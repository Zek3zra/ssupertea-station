import {
  customerSupabase,
  getVerifiedAccountSession,
} from "/js/supabase-config.js";

const GPS_MIN_WRITE_INTERVAL_MS = 5_000;
const GPS_FORCE_WRITE_INTERVAL_MS = 15_000;
const GPS_MIN_MOVE_METERS = 8;
const GPS_FRESH_MS = 30_000;
const GPS_STALE_MS = 75_000;
const UI_TICK_MS = 5_000;

const state = {
  initialized: false,
  session: null,
  channel: null,
  orderChannel: null,
  watchId: null,
  riderOrderId: null,
  lastSent: null,
  writeInFlight: false,
  locations: new Map(),
  customerOrder: null,
  adminObserver: null,
  refreshTimer: null,
  uiTimer: null,
  setupAvailable: true,
};

start().catch((error) => {
  console.warn("Live GPS initialization skipped:", error);
});

async function start() {
  if (state.initialized) return;
  state.initialized = true;
  injectStyles();

  if (isRiderPage()) {
    await waitForStaffReady();
    await initializeRiderGps();
  } else if (isAdminPage()) {
    await waitForStaffReady();
    await initializeAdminGps();
  } else if (isCustomerPage()) {
    initializeCustomerEvents();
    await initializeCustomerGps();
  }

  state.uiTimer = window.setInterval(refreshVisibleAges, UI_TICK_MS);
  window.addEventListener("pagehide", cleanup, { once: true });
}

function isRiderPage() {
  return window.location.pathname.endsWith("/rider.html");
}

function isAdminPage() {
  return window.location.pathname.endsWith("/admin.html");
}

function isCustomerPage() {
  return window.location.pathname === "/" ||
    window.location.pathname.endsWith("/index.html");
}

async function waitForStaffReady() {
  if (document.body.dataset.staffReady === "true") return;

  await new Promise((resolve) => {
    const timeout = window.setTimeout(resolve, 8_000);
    window.addEventListener(
      "ssupertea:staff-ready",
      () => {
        window.clearTimeout(timeout);
        resolve();
      },
      { once: true }
    );
  });
}

async function getSession() {
  state.session = await getVerifiedAccountSession({ forceRefresh: false });
  return state.session;
}

/* =========================================================
   RIDER GPS
========================================================= */

async function initializeRiderGps() {
  const session = await getSession();
  if (!session) return;

  ensureRiderPanel();
  setRiderGpsStatus("GPS sharing is off until a delivery starts.", "idle");

  await syncRiderDispatchedOrder();
  if (!state.setupAvailable) return;

  state.orderChannel = customerSupabase
    .channel(`ssupertea-rider-gps-orders-${session.user.id}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "orders" },
      scheduleRiderSync
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "order_delivery_assignments" },
      scheduleRiderSync
    )
    .subscribe();
}

function scheduleRiderSync() {
  window.clearTimeout(state.refreshTimer);
  state.refreshTimer = window.setTimeout(() => {
    syncRiderDispatchedOrder().catch((error) => {
      console.warn("Unable to refresh rider GPS state:", error);
    });
  }, 220);
}

async function syncRiderDispatchedOrder() {
  const riderUserId = state.session?.user?.id;
  if (!riderUserId) return;

  const assignmentsResult = await customerSupabase
    .from("order_delivery_assignments")
    .select("order_id")
    .eq("rider_user_id", riderUserId);

  if (assignmentsResult.error) {
    handleSetupError(assignmentsResult.error, "rider");
    return;
  }

  const orderIds = (assignmentsResult.data || []).map((row) => row.order_id);
  if (!orderIds.length) {
    stopLocationWatch("GPS sharing is off. No active delivery is assigned.");
    return;
  }

  const ordersResult = await customerSupabase
    .from("orders")
    .select("id,status,order_type,created_at")
    .in("id", orderIds)
    .eq("order_type", "delivery")
    .in("status", ["preparing", "dispatched"])
    .order("created_at", { ascending: false });

  if (ordersResult.error) {
    handleSetupError(ordersResult.error, "rider");
    return;
  }

  const dispatched = (ordersResult.data || []).find(
    (order) => order.status === "dispatched"
  );

  if (!dispatched) {
    stopLocationWatch("GPS sharing is off until you tap Start delivery.");
    return;
  }

  startLocationWatch(dispatched.id);
}

function startLocationWatch(orderId) {
  if (state.watchId !== null && state.riderOrderId === orderId) return;

  stopLocationWatch();
  state.riderOrderId = orderId;
  state.lastSent = null;

  if (!("geolocation" in navigator)) {
    setRiderGpsStatus("This device does not support browser GPS.", "error");
    return;
  }

  setRiderGpsStatus(
    "Waiting for location permission and a GPS fix…",
    "waiting"
  );

  state.watchId = navigator.geolocation.watchPosition(
    handleRiderPosition,
    handleRiderPositionError,
    {
      enableHighAccuracy: true,
      maximumAge: 4_000,
      timeout: 20_000,
    }
  );
}

async function handleRiderPosition(position) {
  const orderId = state.riderOrderId;
  if (!orderId) return;

  const latitude = Number(position.coords.latitude);
  const longitude = Number(position.coords.longitude);
  const accuracy = Number(position.coords.accuracy);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

  const now = Date.now();
  const current = { latitude, longitude, accuracy, sentAt: now };

  if (!shouldSendPosition(current)) {
    updateRiderLocalFix(current);
    return;
  }

  if (state.writeInFlight) return;
  state.writeInFlight = true;

  try {
    const { data, error } = await customerSupabase.rpc(
      "rider_update_delivery_location",
      {
        p_order_id: orderId,
        p_latitude: latitude,
        p_longitude: longitude,
        p_accuracy_m: Number.isFinite(accuracy) ? accuracy : null,
      }
    );

    if (error) {
      if (handleSetupError(error, "rider")) {
        stopLocationWatch();
        return;
      }
      throw error;
    }

    state.lastSent = {
      latitude,
      longitude,
      accuracy,
      sentAt: now,
    };

    setRiderGpsStatus(
      `GPS sharing live${formatAccuracy(accuracy)} • sent just now`,
      "live"
    );

    if (data?.updated_at) {
      state.locations.set(orderId, data);
    }
  } catch (error) {
    console.warn("Unable to send rider GPS:", error);
    setRiderGpsStatus(
      error?.message || "GPS was found, but the location could not be sent.",
      "error"
    );
  } finally {
    state.writeInFlight = false;
  }
}

function shouldSendPosition(current) {
  if (!state.lastSent) return true;

  const elapsed = current.sentAt - state.lastSent.sentAt;
  if (elapsed < GPS_MIN_WRITE_INTERVAL_MS) return false;
  if (elapsed >= GPS_FORCE_WRITE_INTERVAL_MS) return true;

  return haversineMeters(
    state.lastSent.latitude,
    state.lastSent.longitude,
    current.latitude,
    current.longitude
  ) >= GPS_MIN_MOVE_METERS;
}

function updateRiderLocalFix(current) {
  const sentAge = state.lastSent
    ? formatAge(Date.now() - state.lastSent.sentAt)
    : "not sent yet";

  setRiderGpsStatus(
    `GPS acquired${formatAccuracy(current.accuracy)} • last sent ${sentAge}`,
    state.lastSent ? "live" : "waiting"
  );
}

function handleRiderPositionError(error) {
  const message =
    error?.code === 1
      ? "Location permission is blocked. Allow location access for Rider Mode."
      : error?.code === 2
        ? "Your device cannot determine its location right now."
        : "GPS timed out. Keep Rider Mode open and try again.";

  setRiderGpsStatus(message, "error");
}

function stopLocationWatch(message = "") {
  if (state.watchId !== null && "geolocation" in navigator) {
    navigator.geolocation.clearWatch(state.watchId);
  }

  state.watchId = null;
  state.riderOrderId = null;
  state.lastSent = null;
  state.writeInFlight = false;

  if (message) setRiderGpsStatus(message, "idle");
}

function ensureRiderPanel() {
  if (document.querySelector("[data-live-gps-rider]")) return;

  const host = document.querySelector(".rider-live-panel") ||
    document.querySelector(".rider-hero");
  if (!host) return;

  const panel = document.createElement("div");
  panel.className = "live-gps-indicator live-gps-rider";
  panel.dataset.liveGpsRider = "true";
  panel.innerHTML = `
    <span class="live-gps-dot" data-gps-state="idle"></span>
    <span data-live-gps-text>GPS sharing is off.</span>
  `;
  host.append(panel);
}

function setRiderGpsStatus(message, status) {
  ensureRiderPanel();
  const panel = document.querySelector("[data-live-gps-rider]");
  const text = panel?.querySelector("[data-live-gps-text]");
  const dot = panel?.querySelector(".live-gps-dot");
  if (text) text.textContent = message;
  if (dot) dot.dataset.gpsState = status;
}

/* =========================================================
   CUSTOMER GPS INDICATOR
========================================================= */

function initializeCustomerEvents() {
  for (const eventName of [
    "ssupertea:account-changed",
    "ssupertea:account-signed-in",
    "ssupertea:order-changed",
    "ssupertea:track-active-order",
  ]) {
    window.addEventListener(eventName, () => {
      window.setTimeout(() => initializeCustomerGps(), 80);
    });
  }
}

async function initializeCustomerGps() {
  const session = await getSession();
  ensureCustomerPanel();

  if (!session) {
    state.customerOrder = null;
    setCustomerPanelHidden(true);
    stopCustomerChannel();
    return;
  }

  const orderResult = await customerSupabase
    .from("orders")
    .select("id,status,order_type,created_at")
    .eq("order_type", "delivery")
    .in("status", ["pending", "preparing", "dispatched"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (orderResult.error) {
    console.warn("Unable to load customer GPS order:", orderResult.error);
    return;
  }

  state.customerOrder = orderResult.data || null;

  if (!state.customerOrder) {
    setCustomerPanelHidden(true);
    stopCustomerChannel();
    return;
  }

  await refreshCustomerLocation();
  subscribeCustomerLocation(state.customerOrder.id);
}

async function refreshCustomerLocation() {
  ensureCustomerPanel();
  const order = state.customerOrder;

  if (!order || order.status !== "dispatched") {
    setCustomerPanelHidden(true);
    return;
  }

  setCustomerPanelHidden(false);

  const locationResult = await customerSupabase
    .from("order_delivery_locations")
    .select("order_id,rider_user_id,latitude,longitude,accuracy_m,updated_at")
    .eq("order_id", order.id)
    .maybeSingle();

  if (locationResult.error) {
    if (handleSetupError(locationResult.error, "customer")) return;
    console.warn("Unable to load rider location:", locationResult.error);
    setCustomerGpsStatus("Rider GPS is temporarily unavailable.", "error");
    return;
  }

  if (!locationResult.data) {
    state.locations.delete(order.id);
    setCustomerGpsStatus("Waiting for the rider's first GPS location…", "waiting");
    return;
  }

  state.locations.set(order.id, locationResult.data);
  renderCustomerLocation(locationResult.data);
}

function subscribeCustomerLocation(orderId) {
  if (!state.setupAvailable) return;

  const topic = `realtime:ssupertea-customer-gps-${orderId}`;
  if (state.channel?.topic === topic) return;

  stopCustomerChannel();

  state.channel = customerSupabase
    .channel(`ssupertea-customer-gps-${orderId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "order_delivery_locations",
        filter: `order_id=eq.${orderId}`,
      },
      () => refreshCustomerLocation()
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "orders",
        filter: `id=eq.${orderId}`,
      },
      () => refreshCustomerOrderStatus(orderId)
    )
    .subscribe();
}

async function refreshCustomerOrderStatus(orderId) {
  const { data, error } = await customerSupabase
    .from("orders")
    .select("id,status,order_type,created_at")
    .eq("id", orderId)
    .maybeSingle();

  if (error || !data) return;
  state.customerOrder = data;

  if (data.status === "dispatched") {
    await refreshCustomerLocation();
  } else {
    setCustomerPanelHidden(true);
    if (data.status === "completed" || data.status === "cancelled") {
      stopCustomerChannel();
    }
  }
}

function ensureCustomerPanel() {
  if (document.querySelector("[data-live-gps-customer]")) return;

  const host = document.getElementById("tracking-delivery-card") ||
    document.querySelector(".tracking-status-card");
  if (!host) return;

  const panel = document.createElement("div");
  panel.className = "live-gps-indicator live-gps-customer";
  panel.dataset.liveGpsCustomer = "true";
  panel.hidden = true;
  panel.innerHTML = `
    <span class="live-gps-dot" data-gps-state="waiting"></span>
    <div>
      <strong>Live rider GPS</strong>
      <span data-live-gps-text>Waiting for location…</span>
    </div>
  `;
  host.append(panel);
}

function setCustomerPanelHidden(hidden) {
  ensureCustomerPanel();
  const panel = document.querySelector("[data-live-gps-customer]");
  if (panel) panel.hidden = hidden;
}

function setCustomerGpsStatus(message, status) {
  ensureCustomerPanel();
  const panel = document.querySelector("[data-live-gps-customer]");
  if (!panel) return;
  panel.hidden = false;
  const text = panel.querySelector("[data-live-gps-text]");
  const dot = panel.querySelector(".live-gps-dot");
  if (text) text.textContent = message;
  if (dot) dot.dataset.gpsState = status;
}

function renderCustomerLocation(location) {
  const ageMs = getLocationAgeMs(location);
  const status = ageMs <= GPS_FRESH_MS
    ? "live"
    : ageMs <= GPS_STALE_MS
      ? "waiting"
      : "stale";

  const label = status === "live"
    ? `Rider location updated ${formatAge(ageMs)}${formatAccuracy(location.accuracy_m)}.`
    : status === "waiting"
      ? `Rider GPS last updated ${formatAge(ageMs)}.`
      : `Rider GPS may be paused • last update ${formatAge(ageMs)}.`;

  setCustomerGpsStatus(label, status);
}

function stopCustomerChannel() {
  if (state.channel) customerSupabase.removeChannel(state.channel);
  state.channel = null;
}

/* =========================================================
   ADMIN GPS INDICATORS
========================================================= */

async function initializeAdminGps() {
  const session = await getSession();
  if (!session) return;

  await refreshAdminLocations();
  if (!state.setupAvailable) return;

  state.channel = customerSupabase
    .channel("ssupertea-admin-live-gps")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "order_delivery_locations" },
      () => refreshAdminLocations()
    )
    .subscribe();

  const dashboard = document.getElementById("admin-dashboard");
  if (dashboard) {
    state.adminObserver = new MutationObserver(() => scheduleAdminRender());
    state.adminObserver.observe(dashboard, { childList: true, subtree: true });
  }
}

async function refreshAdminLocations() {
  const result = await customerSupabase
    .from("order_delivery_locations")
    .select("order_id,rider_user_id,latitude,longitude,accuracy_m,updated_at")
    .order("updated_at", { ascending: false });

  if (result.error) {
    if (handleSetupError(result.error, "admin")) return;
    console.warn("Unable to load admin live GPS:", result.error);
    return;
  }

  state.locations = new Map(
    (result.data || []).map((row) => [row.order_id, row])
  );
  renderAdminIndicators();
}

function scheduleAdminRender() {
  window.clearTimeout(state.refreshTimer);
  state.refreshTimer = window.setTimeout(renderAdminIndicators, 80);
}

function renderAdminIndicators() {
  for (const card of document.querySelectorAll(".admin-order-card.status-dispatched")) {
    if (!card.querySelector(".admin-delivery-block")) continue;

    const orderId = card.dataset.orderId;
    if (!orderId) continue;

    let panel = card.querySelector("[data-live-gps-admin]");
    if (!panel) {
      panel = document.createElement("div");
      panel.className = "live-gps-indicator live-gps-admin";
      panel.dataset.liveGpsAdmin = "true";
      panel.innerHTML = `
        <span class="live-gps-dot" data-gps-state="waiting"></span>
        <span data-live-gps-text>Waiting for rider GPS…</span>
      `;
      const host = card.querySelector(".admin-order-actions") ||
        card.querySelector(".admin-delivery-block") || card;
      host.append(panel);
    }

    const location = state.locations.get(orderId);
    const text = panel.querySelector("[data-live-gps-text]");
    const dot = panel.querySelector(".live-gps-dot");

    if (!location) {
      if (text) text.textContent = "GPS: waiting for rider location";
      if (dot) dot.dataset.gpsState = "waiting";
      continue;
    }

    const ageMs = getLocationAgeMs(location);
    const gpsState = ageMs <= GPS_FRESH_MS
      ? "live"
      : ageMs <= GPS_STALE_MS
        ? "waiting"
        : "stale";

    if (text) {
      text.textContent = gpsState === "live"
        ? `GPS live • updated ${formatAge(ageMs)}${formatAccuracy(location.accuracy_m)}`
        : `GPS ${gpsState === "stale" ? "may be paused" : "delayed"} • ${formatAge(ageMs)}`;
    }
    if (dot) dot.dataset.gpsState = gpsState;
  }
}

/* =========================================================
   SHARED HELPERS
========================================================= */

function handleSetupError(error, context) {
  const message = String(error?.message || "");
  const code = String(error?.code || "");
  const missing =
    code === "42P01" ||
    code === "PGRST202" ||
    /order_delivery_locations|rider_update_delivery_location|schema cache|does not exist/i.test(message);

  if (!missing) return false;

  state.setupAvailable = false;

  if (context === "rider") {
    setRiderGpsStatus("Phase 8B GPS database setup is not applied yet.", "waiting");
  } else if (context === "customer") {
    setCustomerPanelHidden(true);
  }

  return true;
}

function refreshVisibleAges() {
  if (isRiderPage() && state.lastSent) {
    setRiderGpsStatus(
      `GPS sharing live${formatAccuracy(state.lastSent.accuracy)} • last sent ${formatAge(Date.now() - state.lastSent.sentAt)}`,
      "live"
    );
  }

  if (isCustomerPage() && state.customerOrder?.status === "dispatched") {
    const location = state.locations.get(state.customerOrder.id);
    if (location) renderCustomerLocation(location);
  }

  if (isAdminPage()) renderAdminIndicators();
}

function getLocationAgeMs(location) {
  const timestamp = new Date(location?.updated_at).getTime();
  if (!Number.isFinite(timestamp)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Date.now() - timestamp);
}

function formatAge(ageMs) {
  if (!Number.isFinite(ageMs)) return "an unknown time ago";
  if (ageMs < 5_000) return "just now";
  if (ageMs < 60_000) return `${Math.max(1, Math.round(ageMs / 1_000))}s ago`;
  return `${Math.max(1, Math.round(ageMs / 60_000))}m ago`;
}

function formatAccuracy(value) {
  const accuracy = Number(value);
  return Number.isFinite(accuracy)
    ? ` • ±${Math.max(1, Math.round(accuracy))} m`
    : "";
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const earthRadius = 6_371_000;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function injectStyles() {
  if (document.getElementById("ssupertea-live-gps-style")) return;

  const style = document.createElement("style");
  style.id = "ssupertea-live-gps-style";
  style.textContent = `
    .live-gps-indicator{margin-top:10px;padding:10px 11px;display:flex;align-items:center;gap:9px;border:1px solid rgba(14,91,59,.16);border-radius:12px;background:rgba(239,248,242,.92);color:#315447;font-size:.64rem;font-weight:750;line-height:1.4}
    .live-gps-indicator[hidden]{display:none!important}.live-gps-indicator strong{display:block;color:#173b2c;font-size:.66rem}.live-gps-indicator span:not(.live-gps-dot){display:block}.live-gps-dot{width:9px;height:9px;flex:0 0 9px;border-radius:50%;background:#d9a514;box-shadow:0 0 0 4px rgba(217,165,20,.14)}
    .live-gps-dot[data-gps-state="live"]{background:#4b9a64;box-shadow:0 0 0 4px rgba(75,154,100,.14)}.live-gps-dot[data-gps-state="error"],.live-gps-dot[data-gps-state="stale"]{background:#d85c5c;box-shadow:0 0 0 4px rgba(216,92,92,.14)}.live-gps-dot[data-gps-state="idle"]{background:#8a9a92;box-shadow:0 0 0 4px rgba(138,154,146,.12)}
    .live-gps-rider{margin-top:2px;border-color:rgba(255,255,255,.17);background:rgba(255,255,255,.08);color:rgba(255,255,255,.78)}.live-gps-admin{margin-top:9px}.live-gps-customer{margin-top:12px}
  `;
  document.head.append(style);
}

function cleanup() {
  stopLocationWatch();
  stopCustomerChannel();
  if (state.orderChannel) customerSupabase.removeChannel(state.orderChannel);
  state.orderChannel = null;
  if (state.adminObserver) state.adminObserver.disconnect();
  state.adminObserver = null;
  window.clearTimeout(state.refreshTimer);
  window.clearInterval(state.uiTimer);
}
