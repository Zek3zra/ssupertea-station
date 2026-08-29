import {
  customerSupabase,
  getVerifiedAccountSession,
} from "/js/supabase-config.js";

import {
  OPENSTREETMAP_CONFIG,
} from "/js/openstreetmap-config.js";

const ROUTE_MIN_RECALC_MS = 30_000;
const ROUTE_FORCE_RECALC_MS = 60_000;
const ROUTE_MIN_MOVE_METERS = 180;
const UI_TICK_MS = 5_000;
const SYNC_DEBOUNCE_MS = 180;

const state = {
  initialized: false,
  session: null,
  order: null,
  location: null,
  map: null,
  tileLayer: null,
  routeLayer: null,
  riderMarker: null,
  customerMarker: null,
  orderChannel: null,
  locationChannel: null,
  routeAbortController: null,
  lastRouteAt: 0,
  lastRoutePosition: null,
  observer: null,
  syncTimer: null,
  uiTimer: null,
  leafletPromise: null,
};

start().catch((error) => {
  console.warn("Rider live map initialization skipped:", error);
});

async function start() {
  if (state.initialized) return;
  state.initialized = true;

  await waitForDom();
  await waitForStaffReady();
  injectStyles();

  const session = await getVerifiedAccountSession({ forceRefresh: false });
  if (!session) return;
  state.session = session;

  observeRiderDashboard();
  await syncActiveDelivery();

  state.uiTimer = window.setInterval(refreshFreshnessText, UI_TICK_MS);
  window.addEventListener("pagehide", cleanup, { once: true });
}

function waitForDom() {
  if (document.readyState !== "loading") return Promise.resolve();
  return new Promise((resolve) => {
    document.addEventListener("DOMContentLoaded", resolve, { once: true });
  });
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

function observeRiderDashboard() {
  const list = document.getElementById("rider-assigned-list");
  if (!list) return;

  state.observer = new MutationObserver(() => {
    scheduleSync();
  });

  state.observer.observe(list, {
    childList: true,
    subtree: true,
  });
}

function scheduleSync() {
  window.clearTimeout(state.syncTimer);
  state.syncTimer = window.setTimeout(() => {
    syncActiveDelivery().catch((error) => {
      console.warn("Unable to refresh rider live map:", error);
    });
  }, SYNC_DEBOUNCE_MS);
}

async function syncActiveDelivery() {
  const riderUserId = state.session?.user?.id;
  if (!riderUserId) return;

  const assignmentsResult = await customerSupabase
    .from("order_delivery_assignments")
    .select("order_id")
    .eq("rider_user_id", riderUserId);

  if (assignmentsResult.error) {
    console.warn("Unable to load rider assignments for map:", assignmentsResult.error);
    return;
  }

  const orderIds = (assignmentsResult.data || []).map((row) => row.order_id);
  if (!orderIds.length) {
    clearActiveTracking();
    return;
  }

  const ordersResult = await customerSupabase
    .from("orders")
    .select(
      "id,status,order_type,delivery_lat,delivery_lng,delivery_address,created_at"
    )
    .in("id", orderIds)
    .eq("order_type", "delivery")
    .eq("status", "dispatched")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (ordersResult.error) {
    console.warn("Unable to load active rider delivery for map:", ordersResult.error);
    return;
  }

  const order = ordersResult.data || null;
  if (!order || !hasDestination(order)) {
    clearActiveTracking();
    return;
  }

  const changed = state.order?.id !== order.id;
  state.order = order;

  if (changed) {
    resetRouteState();
    subscribeToActiveDelivery(order.id);
  }

  ensurePanel();
  await refreshLocation(order.id);
}

function subscribeToActiveDelivery(orderId) {
  stopRealtimeChannels();

  state.locationChannel = customerSupabase
    .channel(`ssupertea-rider-map-location-${orderId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "order_delivery_locations",
        filter: `order_id=eq.${orderId}`,
      },
      () => refreshLocation(orderId)
    )
    .subscribe();

  state.orderChannel = customerSupabase
    .channel(`ssupertea-rider-map-order-${orderId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "orders",
        filter: `id=eq.${orderId}`,
      },
      () => refreshTrackedOrder(orderId)
    )
    .subscribe();
}

async function refreshTrackedOrder(orderId) {
  const { data: order, error } = await customerSupabase
    .from("orders")
    .select(
      "id,status,order_type,delivery_lat,delivery_lng,delivery_address,created_at"
    )
    .eq("id", orderId)
    .maybeSingle();

  if (error || !order) return;

  if (order.status !== "dispatched") {
    clearActiveTracking();
    return;
  }

  state.order = order;
  ensurePanel();
}

async function refreshLocation(orderId) {
  const { data: location, error } = await customerSupabase
    .from("order_delivery_locations")
    .select("order_id,rider_user_id,latitude,longitude,accuracy_m,updated_at")
    .eq("order_id", orderId)
    .maybeSingle();

  if (error) {
    console.warn("Unable to load rider GPS for rider map:", error);
    setStatus("Live map is temporarily unavailable.", "error");
    return;
  }

  ensurePanel();

  if (!location || !hasLocation(location)) {
    state.location = null;
    setStatus("Waiting for your first GPS location…", "waiting");
    setRouteSummary(null);
    return;
  }

  state.location = location;
  await renderMap();
}

function ensurePanel() {
  const orderId = state.order?.id;
  if (!orderId) return null;

  const card = document.querySelector(
    `.rider-order-card.status-dispatched[data-order-id="${cssEscape(orderId)}"]`
  );
  if (!card) return null;

  let panel = card.querySelector("[data-rider-live-map]");
  if (panel) return panel;

  if (state.map && !state.map.getContainer()?.isConnected) {
    destroyMap();
  }

  panel = document.createElement("section");
  panel.className = "rider-live-map-panel";
  panel.dataset.riderLiveMap = "true";
  panel.innerHTML = `
    <div class="rider-live-map-header">
      <div>
        <span>Live delivery map</span>
        <strong>You → Customer</strong>
      </div>
      <button type="button" data-rider-map-recenter>Recenter</button>
    </div>
    <div class="rider-live-map-canvas" data-rider-map-canvas role="img" aria-label="Rider live delivery map"></div>
    <div class="rider-live-map-summary" aria-label="Remaining delivery estimate">
      <div>
        <span>Remaining</span>
        <strong data-rider-map-distance>Waiting…</strong>
      </div>
      <div>
        <span>ETA</span>
        <strong data-rider-map-duration>Waiting…</strong>
      </div>
    </div>
    <div class="rider-live-map-status" data-rider-map-status data-state="waiting" role="status" aria-live="polite">
      Waiting for your GPS location…
    </div>
    <p class="rider-live-map-note">Use Open in Google Maps above for turn-by-turn navigation.</p>
  `;

  const actions = card.querySelector(".rider-order-actions");
  if (actions) {
    card.insertBefore(panel, actions);
  } else {
    card.append(panel);
  }

  panel.querySelector("[data-rider-map-recenter]")?.addEventListener("click", () => {
    state.map?.invalidateSize({ animate: false });
    fitMapToDelivery();
  });

  if (state.location) {
    window.setTimeout(() => renderMap(), 0);
  }

  return panel;
}

function getPanel() {
  return ensurePanel();
}

async function renderMap() {
  const order = state.order;
  const location = state.location;
  const panel = getPanel();

  if (!order || !location || !panel || !hasDestination(order)) return;

  try {
    await ensureLeaflet();
    ensureMap(panel);
    updateMarkers(order, location);
    updateFreshness();

    if (shouldRecalculateRoute(location)) {
      await calculateTrackingRoute(order, location);
    } else if (!state.routeLayer) {
      fitMapToDelivery();
    }
  } catch (error) {
    console.warn("Unable to render rider live map:", error);
    setStatus("The map could not be displayed right now.", "error");
  }
}

function ensureMap(panel) {
  const canvas = panel.querySelector("[data-rider-map-canvas]");
  if (!canvas) return;

  if (state.map && state.map.getContainer() !== canvas) {
    destroyMap();
  }

  if (state.map) {
    state.map.invalidateSize({ animate: false });
    return;
  }

  const L = window.L;
  state.map = L.map(canvas, {
    zoomControl: true,
    attributionControl: true,
    minZoom: OPENSTREETMAP_CONFIG.tiles.minimumZoom,
    maxZoom: OPENSTREETMAP_CONFIG.tiles.maximumZoom,
    zoomAnimation: true,
    fadeAnimation: true,
  }).setView(
    [Number(locationLatitude()), Number(locationLongitude())],
    16
  );

  state.tileLayer = L.tileLayer(OPENSTREETMAP_CONFIG.tiles.url, {
    minZoom: OPENSTREETMAP_CONFIG.tiles.minimumZoom,
    maxZoom: OPENSTREETMAP_CONFIG.tiles.maximumZoom,
    attribution: OPENSTREETMAP_CONFIG.tiles.attribution,
  }).addTo(state.map);

  window.setTimeout(() => state.map?.invalidateSize({ animate: false }), 60);
}

function updateMarkers(order, location) {
  if (!state.map) return;

  const L = window.L;
  const rider = [Number(location.latitude), Number(location.longitude)];
  const customer = [Number(order.delivery_lat), Number(order.delivery_lng)];

  if (!state.riderMarker) {
    state.riderMarker = L.marker(rider, {
      icon: makeMarkerIcon("rider", "🛵", "You"),
      keyboard: false,
      zIndexOffset: 500,
    }).addTo(state.map);
  } else {
    state.riderMarker.setLatLng(rider);
  }

  if (!state.customerMarker) {
    state.customerMarker = L.marker(customer, {
      icon: makeMarkerIcon("customer", "●", "Customer"),
      keyboard: false,
      zIndexOffset: 300,
    }).addTo(state.map);
  } else {
    state.customerMarker.setLatLng(customer);
  }
}

function makeMarkerIcon(type, symbol, label) {
  return window.L.divIcon({
    className: "rider-live-map-div-icon",
    html: `<div class="rider-live-map-marker rider-live-map-marker-${type}" aria-label="${escapeHtml(label)}"><span>${escapeHtml(symbol)}</span></div>`,
    iconSize: [38, 38],
    iconAnchor: [19, 19],
  });
}

async function calculateTrackingRoute(order, location) {
  state.routeAbortController?.abort();
  const controller = new AbortController();
  state.routeAbortController = controller;

  const origin = {
    latitude: Number(location.latitude),
    longitude: Number(location.longitude),
  };
  const destination = {
    latitude: Number(order.delivery_lat),
    longitude: Number(order.delivery_lng),
  };

  setStatus("Updating route and ETA…", "waiting");

  try {
    const response = await fetch(OPENSTREETMAP_CONFIG.routing.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        purpose: "tracking",
        origin,
        destination,
      }),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.message || "Unable to calculate remaining route.");
    }

    if (controller.signal.aborted) return;

    state.lastRouteAt = Date.now();
    state.lastRoutePosition = origin;
    drawRoute(payload?.route);
    setRouteSummary(payload?.summary);
    updateFreshness();
    fitMapToDelivery();
  } catch (error) {
    if (error?.name === "AbortError") return;
    console.warn("Rider route calculation failed:", error);
    state.lastRouteAt = Date.now();
    state.lastRoutePosition = origin;
    setRouteSummary(null);
    updateFreshness("Route estimate unavailable. Your GPS is still live.");
    fitMapToDelivery();
  } finally {
    if (state.routeAbortController === controller) {
      state.routeAbortController = null;
    }
  }
}

function drawRoute(routeFeature) {
  if (!state.map || !routeFeature) return;

  if (state.routeLayer) {
    state.map.removeLayer(state.routeLayer);
    state.routeLayer = null;
  }

  state.routeLayer = window.L.geoJSON(routeFeature, {
    style: {
      color: "#1473e6",
      weight: 6,
      opacity: 0.92,
      lineCap: "round",
      lineJoin: "round",
    },
  }).addTo(state.map);
}

function shouldRecalculateRoute(location) {
  if (!state.lastRoutePosition || !state.lastRouteAt) return true;

  const elapsed = Date.now() - state.lastRouteAt;
  if (elapsed >= ROUTE_FORCE_RECALC_MS) return true;
  if (elapsed < ROUTE_MIN_RECALC_MS) return false;

  return haversineMeters(
    state.lastRoutePosition.latitude,
    state.lastRoutePosition.longitude,
    Number(location.latitude),
    Number(location.longitude)
  ) >= ROUTE_MIN_MOVE_METERS;
}

function fitMapToDelivery() {
  if (!state.map || !state.order || !state.location || !window.L) return;

  const bounds = window.L.latLngBounds([
    [Number(state.location.latitude), Number(state.location.longitude)],
    [Number(state.order.delivery_lat), Number(state.order.delivery_lng)],
  ]);

  state.map.fitBounds(bounds, {
    padding: [34, 34],
    maxZoom: 17,
    animate: false,
  });
}

function updateFreshness(overrideMessage = "") {
  if (!state.location) return;

  const ageMs = getLocationAgeMs(state.location);
  const accuracy = Number(state.location.accuracy_m);
  const accuracyText = Number.isFinite(accuracy)
    ? ` • ±${Math.max(1, Math.round(accuracy))} m`
    : "";

  let status = "live";
  if (ageMs > 75_000) status = "stale";
  else if (ageMs > 30_000) status = "waiting";

  const message = overrideMessage || (
    status === "live"
      ? `Your location updated ${formatAge(ageMs)}${accuracyText}.`
      : status === "waiting"
        ? `Your GPS last updated ${formatAge(ageMs)}${accuracyText}.`
        : `Your GPS may be paused • last update ${formatAge(ageMs)}${accuracyText}.`
  );

  setStatus(message, status);
}

function refreshFreshnessText() {
  const panel = document.querySelector("[data-rider-live-map]");
  if (state.location && panel?.isConnected) {
    updateFreshness();
  }
}

function setStatus(message, status) {
  const element = getPanel()?.querySelector("[data-rider-map-status]");
  if (!element) return;
  element.textContent = message;
  element.dataset.state = status;
}

function setRouteSummary(summary) {
  const panel = getPanel();
  const distance = panel?.querySelector("[data-rider-map-distance]");
  const duration = panel?.querySelector("[data-rider-map-duration]");
  const distanceMeters = Number(summary?.distance);
  const durationSeconds = Number(summary?.duration);

  if (distance) {
    distance.textContent = Number.isFinite(distanceMeters)
      ? formatDistance(distanceMeters)
      : "Unavailable";
  }

  if (duration) {
    duration.textContent = Number.isFinite(durationSeconds)
      ? formatDuration(durationSeconds)
      : "Unavailable";
  }
}

function ensureLeaflet() {
  if (window.L?.map) return Promise.resolve(window.L);
  if (state.leafletPromise) return state.leafletPromise;

  state.leafletPromise = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${OPENSTREETMAP_CONFIG.leaflet.cssUrl}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = OPENSTREETMAP_CONFIG.leaflet.cssUrl;
      link.integrity = OPENSTREETMAP_CONFIG.leaflet.cssIntegrity;
      link.crossOrigin = "anonymous";
      document.head.append(link);
    }

    const existing = document.querySelector(
      `script[src="${OPENSTREETMAP_CONFIG.leaflet.scriptUrl}"]`
    );

    if (existing) {
      if (window.L?.map) {
        resolve(window.L);
        return;
      }
      existing.addEventListener("load", () => resolve(window.L), { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = OPENSTREETMAP_CONFIG.leaflet.scriptUrl;
    script.integrity = OPENSTREETMAP_CONFIG.leaflet.scriptIntegrity;
    script.crossOrigin = "anonymous";
    script.addEventListener("load", () => resolve(window.L), { once: true });
    script.addEventListener(
      "error",
      () => reject(new Error("Leaflet failed to load.")),
      { once: true }
    );
    document.head.append(script);
  });

  return state.leafletPromise;
}

function clearActiveTracking() {
  stopRealtimeChannels();
  state.routeAbortController?.abort();
  state.routeAbortController = null;
  state.order = null;
  state.location = null;
  resetRouteState();
  destroyMap();

  for (const panel of document.querySelectorAll("[data-rider-live-map]")) {
    panel.remove();
  }
}

function stopRealtimeChannels() {
  if (state.locationChannel) customerSupabase.removeChannel(state.locationChannel);
  if (state.orderChannel) customerSupabase.removeChannel(state.orderChannel);
  state.locationChannel = null;
  state.orderChannel = null;
}

function resetRouteState() {
  state.lastRouteAt = 0;
  state.lastRoutePosition = null;
  if (state.routeLayer && state.map) {
    state.map.removeLayer(state.routeLayer);
  }
  state.routeLayer = null;
}

function destroyMap() {
  if (state.map) state.map.remove();
  state.map = null;
  state.tileLayer = null;
  state.routeLayer = null;
  state.riderMarker = null;
  state.customerMarker = null;
}

function hasDestination(order) {
  return Number.isFinite(Number(order?.delivery_lat)) &&
    Number.isFinite(Number(order?.delivery_lng));
}

function hasLocation(location) {
  return Number.isFinite(Number(location?.latitude)) &&
    Number.isFinite(Number(location?.longitude));
}

function locationLatitude() {
  return state.location?.latitude ?? state.order?.delivery_lat ??
    OPENSTREETMAP_CONFIG.defaultView.latitude;
}

function locationLongitude() {
  return state.location?.longitude ?? state.order?.delivery_lng ??
    OPENSTREETMAP_CONFIG.defaultView.longitude;
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

function formatDistance(meters) {
  if (meters < 1000) return `${Math.max(1, Math.round(meters))} m`;
  return `${(meters / 1000).toFixed(meters < 10_000 ? 1 : 0)} km`;
}

function formatDuration(seconds) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
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

function cssEscape(value) {
  if (window.CSS?.escape) return window.CSS.escape(String(value));
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function cleanup() {
  stopRealtimeChannels();
  state.routeAbortController?.abort();
  state.observer?.disconnect();
  window.clearTimeout(state.syncTimer);
  window.clearInterval(state.uiTimer);
  destroyMap();
}

function injectStyles() {
  if (document.getElementById("ssupertea-rider-live-map-style")) return;

  const style = document.createElement("style");
  style.id = "ssupertea-rider-live-map-style";
  style.textContent = `
    .rider-live-map-panel{margin-top:12px;padding-top:12px;border-top:1px solid var(--border)}.rider-live-map-header{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:9px}.rider-live-map-header>div{display:grid;gap:2px}.rider-live-map-header span{color:var(--ink-500);font-size:.56rem;font-weight:900;letter-spacing:.06em;text-transform:uppercase}.rider-live-map-header strong{color:var(--green-950);font-size:.76rem}.rider-live-map-header button{min-height:34px;padding:0 10px;border:1px solid var(--border);border-radius:10px;background:#f7fbf8;color:var(--green-800);font:inherit;font-size:.6rem;font-weight:850}.rider-live-map-canvas{height:240px;border-radius:13px;overflow:hidden;background:#eef3ef}.rider-live-map-summary{margin-top:9px;display:grid;grid-template-columns:1fr 1fr;gap:8px}.rider-live-map-summary>div{padding:9px 10px;border-radius:11px;background:var(--cream-100);display:grid;gap:2px}.rider-live-map-summary span{color:var(--ink-500);font-size:.54rem;font-weight:850;text-transform:uppercase;letter-spacing:.05em}.rider-live-map-summary strong{color:var(--green-950);font-size:.72rem}.rider-live-map-status{margin-top:8px;padding:8px 9px;border-radius:10px;background:#eff8f2;color:#315447;font-size:.59rem;font-weight:750;line-height:1.45}.rider-live-map-status[data-state=waiting]{background:#fff8e7;color:#7a601e}.rider-live-map-status[data-state=stale],.rider-live-map-status[data-state=error]{background:#fff0f0;color:#8a3030}.rider-live-map-note{margin-top:7px;color:var(--ink-500);font-size:.56rem;line-height:1.45}.rider-live-map-div-icon{background:transparent;border:0}.rider-live-map-marker{width:38px;height:38px;display:grid;place-items:center;border:3px solid #fff;border-radius:50%;box-shadow:0 5px 16px rgba(18,58,43,.24);font-weight:950}.rider-live-map-marker-rider{background:#fff6d8;color:#173b2c;font-size:1.15rem}.rider-live-map-marker-customer{background:#1473e6;color:#fff;font-size:.85rem}@media(max-width:560px){.rider-live-map-canvas{height:220px}}
  `;
  document.head.append(style);
}
