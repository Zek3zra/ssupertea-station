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

const state = {
  initialized: false,
  session: null,
  mode: null,
  order: null,
  location: null,
  map: null,
  tileLayer: null,
  routeLayer: null,
  shopMarker: null,
  riderMarker: null,
  customerMarker: null,
  orderChannel: null,
  locationChannel: null,
  routeAbortController: null,
  lastRouteAt: 0,
  lastRoutePosition: null,
  adminObserver: null,
  adminOrderId: null,
  uiTimer: null,
  leafletPromise: null,
};

start().catch((error) => {
  console.warn("Phase 8C live map initialization skipped:", error);
});

async function start() {
  if (state.initialized) return;
  state.initialized = true;

  await waitForDom();
  injectStyles();

  if (isCustomerPage()) {
    state.mode = "customer";
    initializeCustomerEvents();
    await initializeCustomerMap();
  } else if (isAdminPage()) {
    state.mode = "admin";
    await waitForStaffReady();
    await initializeAdminMap();
  }

  state.uiTimer = window.setInterval(refreshFreshnessText, UI_TICK_MS);
  window.addEventListener("pagehide", cleanup, { once: true });
}

function isCustomerPage() {
  return (
    window.location.pathname === "/" ||
    window.location.pathname.endsWith("/index.html")
  );
}

function isAdminPage() {
  return window.location.pathname.endsWith("/admin.html");
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

async function getSession() {
  state.session = await getVerifiedAccountSession({ forceRefresh: false });
  return state.session;
}

/* =========================================================
   CUSTOMER LIVE MAP
========================================================= */

function initializeCustomerEvents() {
  for (const eventName of [
    "ssupertea:account-changed",
    "ssupertea:account-signed-in",
    "ssupertea:order-changed",
    "ssupertea:track-active-order",
  ]) {
    window.addEventListener(eventName, () => {
      window.setTimeout(() => initializeCustomerMap(), 120);
    });
  }

  const trackingDialog = document.getElementById("tracking-dialog");
  if (trackingDialog) {
    const observer = new MutationObserver(() => {
      if (trackingDialog.hasAttribute("open") && state.map) {
        window.setTimeout(() => {
          state.map?.invalidateSize({ animate: false });
          fitMapToActiveDelivery(false);
        }, 80);
      }
    });
    observer.observe(trackingDialog, { attributes: true, attributeFilter: ["open"] });
  }
}

async function initializeCustomerMap() {
  const session = await getSession();
  ensureCustomerPanel();

  if (!session) {
    clearActiveTracking();
    setCustomerPanelVisible(false);
    return;
  }

  const { data: order, error } = await customerSupabase
    .from("orders")
    .select(
      "id,status,order_type,delivery_lat,delivery_lng,delivery_address,created_at"
    )
    .eq("order_type", "delivery")
    .in("status", ["pending", "preparing", "dispatched"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("Unable to load customer order for live map:", error);
    return;
  }

  if (!order || order.status !== "dispatched" || !hasDestination(order)) {
    clearActiveTracking();
    setCustomerPanelVisible(false);
    return;
  }

  const orderChanged = state.order?.id !== order.id;
  state.order = order;

  if (orderChanged) {
    resetRouteState();
    subscribeToActiveOrder(order.id);
  }

  await refreshLocationForOrder(order.id, { showWaiting: false });
}

function ensureCustomerPanel() {
  if (document.querySelector("[data-live-map-customer]")) return;

  const host = document.getElementById("tracking-delivery-card");
  if (!host) return;

  const panel = document.createElement("section");
  panel.className = "live-map-panel live-map-customer-panel";
  panel.dataset.liveMapCustomer = "true";
  panel.hidden = true;
  panel.innerHTML = createMapPanelMarkup("customer");
  host.append(panel);

  bindPanelControls(panel);
}

function setCustomerPanelVisible(visible) {
  ensureCustomerPanel();
  const panel = document.querySelector("[data-live-map-customer]");
  if (panel) panel.hidden = !visible;
}

/* =========================================================
   ADMIN LIVE MAP
========================================================= */

async function initializeAdminMap() {
  const session = await getSession();
  if (!session) return;

  ensureAdminDialog();
  renderAdminButtons();

  const dashboard = document.getElementById("admin-dashboard");
  if (dashboard) {
    state.adminObserver = new MutationObserver(renderAdminButtons);
    state.adminObserver.observe(dashboard, { childList: true, subtree: true });
  }
}

function renderAdminButtons() {
  for (const card of document.querySelectorAll(".admin-order-card.status-dispatched")) {
    if (!card.querySelector(".admin-delivery-block")) continue;
    const orderId = card.dataset.orderId;
    if (!orderId) continue;

    const actions = card.querySelector(".admin-order-actions") || card;
    if (actions.querySelector(`[data-live-map-open="${orderId}"]`)) continue;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "live-map-open-button";
    button.dataset.liveMapOpen = orderId;
    button.textContent = "View live map";
    button.addEventListener("click", () => openAdminLiveMap(orderId));
    actions.append(button);
  }
}

function ensureAdminDialog() {
  if (document.getElementById("live-map-admin-dialog")) return;

  const dialog = document.createElement("dialog");
  dialog.id = "live-map-admin-dialog";
  dialog.className = "live-map-admin-dialog";
  dialog.innerHTML = `
    <div class="live-map-admin-shell">
      <header class="live-map-admin-header">
        <div>
          <span class="live-map-eyebrow">Live delivery</span>
          <h2>Rider tracking</h2>
        </div>
        <button class="live-map-close-button" type="button" aria-label="Close live map">×</button>
      </header>
      ${createMapPanelMarkup("admin")}
    </div>
  `;

  document.body.append(dialog);
  const closeButton = dialog.querySelector(".live-map-close-button");
  closeButton?.addEventListener("click", closeAdminLiveMap);
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeAdminLiveMap();
  });
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) closeAdminLiveMap();
  });
  bindPanelControls(dialog);
}

async function openAdminLiveMap(orderId) {
  const dialog = document.getElementById("live-map-admin-dialog");
  if (!dialog) return;

  setPanelStatus("Loading delivery location…", "waiting", dialog);
  setRouteSummary(null, dialog);

  const { data: order, error } = await customerSupabase
    .from("orders")
    .select(
      "id,status,order_type,delivery_lat,delivery_lng,delivery_address,created_at"
    )
    .eq("id", orderId)
    .eq("order_type", "delivery")
    .maybeSingle();

  if (error || !order) {
    setPanelStatus("This delivery could not be loaded.", "error", dialog);
    if (!dialog.open) dialog.showModal();
    return;
  }

  if (order.status !== "dispatched" || !hasDestination(order)) {
    setPanelStatus("This delivery is no longer out for delivery.", "waiting", dialog);
    if (!dialog.open) dialog.showModal();
    return;
  }

  state.adminOrderId = orderId;
  state.order = order;
  resetRouteState();
  subscribeToActiveOrder(orderId);

  if (!dialog.open) dialog.showModal();
  await refreshLocationForOrder(orderId, { showWaiting: true });

  window.setTimeout(() => {
    state.map?.invalidateSize({ animate: false });
    fitMapToActiveDelivery(true);
  }, 100);
}

function closeAdminLiveMap() {
  const dialog = document.getElementById("live-map-admin-dialog");
  if (dialog?.open) dialog.close();
  state.adminOrderId = null;
  clearActiveTracking();
}

/* =========================================================
   REALTIME + LOCATION DATA
========================================================= */

function subscribeToActiveOrder(orderId) {
  stopRealtimeChannels();

  state.locationChannel = customerSupabase
    .channel(`ssupertea-live-map-location-${state.mode}-${orderId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "order_delivery_locations",
        filter: `order_id=eq.${orderId}`,
      },
      () => refreshLocationForOrder(orderId, { showWaiting: true })
    )
    .subscribe();

  state.orderChannel = customerSupabase
    .channel(`ssupertea-live-map-order-${state.mode}-${orderId}`)
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

  state.order = order;

  if (order.status !== "dispatched") {
    if (state.mode === "customer") {
      setCustomerPanelVisible(false);
    } else if (state.mode === "admin") {
      const dialog = document.getElementById("live-map-admin-dialog");
      setPanelStatus("Delivery tracking has ended.", "idle", dialog);
      window.setTimeout(closeAdminLiveMap, 700);
    }
    clearActiveTracking();
  }
}

async function refreshLocationForOrder(orderId, { showWaiting = true } = {}) {
  const { data: location, error } = await customerSupabase
    .from("order_delivery_locations")
    .select("order_id,rider_user_id,latitude,longitude,accuracy_m,updated_at")
    .eq("order_id", orderId)
    .maybeSingle();

  if (error) {
    console.warn("Unable to load rider location for live map:", error);
    const root = getActivePanelRoot();
    setPanelStatus("Live map is temporarily unavailable.", "error", root);
    return;
  }

  if (!location || !hasLocation(location)) {
    state.location = null;
    if (showWaiting) {
      setPanelStatus("Waiting for the rider's first GPS location…", "waiting", getActivePanelRoot());
    }
    if (state.mode === "customer") setCustomerPanelVisible(false);
    return;
  }

  state.location = location;

  if (state.mode === "customer") setCustomerPanelVisible(true);
  await renderActiveMap();
}

/* =========================================================
   MAP RENDERING
========================================================= */

async function renderActiveMap() {
  const order = state.order;
  const location = state.location;
  const root = getActivePanelRoot();

  if (!order || !location || !root || !hasDestination(order)) return;

  try {
    await ensureLeaflet();
    ensureMap(root);
    updateMarkers(order, location);
    updateFreshness(root);

    const shouldRoute = shouldRecalculateRoute(location);
    if (shouldRoute) {
      await calculateTrackingRoute(order, location, root);
    } else if (!state.routeLayer) {
      fitMapToActiveDelivery(true);
    }
  } catch (error) {
    console.warn("Unable to render live delivery map:", error);
    setPanelStatus("The map could not be displayed right now.", "error", root);
  }
}

function ensureMap(root) {
  const canvas = root.querySelector("[data-live-map-canvas]");
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
    [
      OPENSTREETMAP_CONFIG.defaultView.latitude,
      OPENSTREETMAP_CONFIG.defaultView.longitude,
    ],
    OPENSTREETMAP_CONFIG.defaultView.zoom
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
  const shop = [
    OPENSTREETMAP_CONFIG.defaultView.latitude,
    OPENSTREETMAP_CONFIG.defaultView.longitude,
  ];
  const rider = [Number(location.latitude), Number(location.longitude)];
  const customer = [Number(order.delivery_lat), Number(order.delivery_lng)];

  if (!state.shopMarker) {
    state.shopMarker = L.marker(shop, {
      icon: makeMarkerIcon("shop", "S", "Ssupertea Station"),
      keyboard: false,
    }).addTo(state.map);
  } else {
    state.shopMarker.setLatLng(shop);
  }

  if (!state.riderMarker) {
    state.riderMarker = L.marker(rider, {
      icon: makeMarkerIcon("rider", "🛵", "Rider"),
      keyboard: false,
      zIndexOffset: 500,
    }).addTo(state.map);
  } else {
    state.riderMarker.setLatLng(rider);
  }

  if (!state.customerMarker) {
    state.customerMarker = L.marker(customer, {
      icon: makeMarkerIcon("customer", "●", "Delivery location"),
      keyboard: false,
      zIndexOffset: 300,
    }).addTo(state.map);
  } else {
    state.customerMarker.setLatLng(customer);
  }
}

function makeMarkerIcon(type, symbol, label) {
  const L = window.L;
  return L.divIcon({
    className: "live-map-div-icon",
    html: `<div class="live-map-marker live-map-marker-${type}" aria-label="${escapeHtml(label)}"><span>${escapeHtml(symbol)}</span></div>`,
    iconSize: [38, 38],
    iconAnchor: [19, 19],
  });
}

async function calculateTrackingRoute(order, location, root) {
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

  setPanelStatus("Updating route and ETA…", "waiting", root);

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
    setRouteSummary(payload?.summary, root);
    updateFreshness(root);
    fitMapToActiveDelivery(true);
  } catch (error) {
    if (error?.name === "AbortError") return;
    console.warn("Tracking route calculation failed:", error);
    state.lastRouteAt = Date.now();
    state.lastRoutePosition = origin;
    setRouteSummary(null, root);
    updateFreshness(root, "Route estimate unavailable. Rider GPS is still live.");
    fitMapToActiveDelivery(true);
  } finally {
    if (state.routeAbortController === controller) {
      state.routeAbortController = null;
    }
  }
}

function drawRoute(routeFeature) {
  if (!state.map || !routeFeature) return;
  const L = window.L;

  if (state.routeLayer) {
    state.map.removeLayer(state.routeLayer);
    state.routeLayer = null;
  }

  state.routeLayer = L.geoJSON(routeFeature, {
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

function fitMapToActiveDelivery(includeShop = false) {
  if (!state.map || !state.order || !state.location || !window.L) return;

  const points = [
    [Number(state.location.latitude), Number(state.location.longitude)],
    [Number(state.order.delivery_lat), Number(state.order.delivery_lng)],
  ];

  if (includeShop) {
    points.push([
      OPENSTREETMAP_CONFIG.defaultView.latitude,
      OPENSTREETMAP_CONFIG.defaultView.longitude,
    ]);
  }

  const bounds = window.L.latLngBounds(points);
  state.map.fitBounds(bounds, {
    padding: [34, 34],
    maxZoom: 17,
    animate: false,
  });
}

/* =========================================================
   UI
========================================================= */

function createMapPanelMarkup(context) {
  return `
    <div class="live-map-header">
      <div>
        <span class="live-map-eyebrow">Live delivery map</span>
        <strong>Track your rider</strong>
      </div>
      <button class="live-map-recenter-button" type="button" data-live-map-recenter>Recenter</button>
    </div>
    <div class="live-map-canvas" data-live-map-canvas role="img" aria-label="Live delivery map"></div>
    <div class="live-map-summary" aria-label="Remaining delivery estimate">
      <div>
        <span>Remaining</span>
        <strong data-live-map-distance>Calculating…</strong>
      </div>
      <div>
        <span>ETA</span>
        <strong data-live-map-duration>Calculating…</strong>
      </div>
    </div>
    <div class="live-map-status" data-live-map-status data-state="waiting" role="status" aria-live="polite">
      Waiting for rider GPS…
    </div>
    ${context === "admin" ? '<p class="live-map-admin-note">The route estimate refreshes periodically while the rider marker moves with live GPS.</p>' : ''}
  `;
}

function bindPanelControls(root) {
  root.querySelector("[data-live-map-recenter]")?.addEventListener("click", () => {
    state.map?.invalidateSize({ animate: false });
    fitMapToActiveDelivery(true);
  });
}

function getActivePanelRoot() {
  if (state.mode === "customer") {
    return document.querySelector("[data-live-map-customer]");
  }
  return document.getElementById("live-map-admin-dialog");
}

function updateFreshness(root, overrideMessage = "") {
  if (!root || !state.location) return;

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
      ? `Rider location updated ${formatAge(ageMs)}${accuracyText}.`
      : status === "waiting"
        ? `Rider GPS last updated ${formatAge(ageMs)}${accuracyText}.`
        : `Rider GPS may be paused • last update ${formatAge(ageMs)}${accuracyText}.`
  );

  setPanelStatus(message, status, root);
}

function refreshFreshnessText() {
  const root = getActivePanelRoot();
  if (state.location && root && isPanelVisible(root)) {
    updateFreshness(root);
  }
}

function setPanelStatus(message, status, root) {
  const element = root?.querySelector?.("[data-live-map-status]");
  if (!element) return;
  element.textContent = message;
  element.dataset.state = status;
}

function setRouteSummary(summary, root) {
  const distance = root?.querySelector?.("[data-live-map-distance]");
  const duration = root?.querySelector?.("[data-live-map-duration]");
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

function isPanelVisible(root) {
  if (!root) return false;
  if (root instanceof HTMLDialogElement) return root.open;
  return !root.hidden;
}

/* =========================================================
   LEAFLET LOADER
========================================================= */

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
    script.addEventListener("error", () => reject(new Error("Leaflet failed to load.")), { once: true });
    document.head.append(script);
  });

  return state.leafletPromise;
}

/* =========================================================
   CLEANUP + HELPERS
========================================================= */

function clearActiveTracking() {
  stopRealtimeChannels();
  state.routeAbortController?.abort();
  state.routeAbortController = null;
  state.order = null;
  state.location = null;
  resetRouteState();
  destroyMap();
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
  if (state.map) {
    state.map.remove();
  }
  state.map = null;
  state.tileLayer = null;
  state.routeLayer = null;
  state.shopMarker = null;
  state.riderMarker = null;
  state.customerMarker = null;
}

function hasDestination(order) {
  const latitude = Number(order?.delivery_lat);
  const longitude = Number(order?.delivery_lng);
  return Number.isFinite(latitude) && Number.isFinite(longitude);
}

function hasLocation(location) {
  const latitude = Number(location?.latitude);
  const longitude = Number(location?.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude);
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
  state.adminObserver?.disconnect();
  window.clearInterval(state.uiTimer);
  destroyMap();
}

function injectStyles() {
  if (document.getElementById("ssupertea-live-map-style")) return;

  const style = document.createElement("style");
  style.id = "ssupertea-live-map-style";
  style.textContent = `
    .live-map-panel{margin-top:14px;padding:12px;border:1px solid rgba(14,91,59,.16);border-radius:16px;background:#fff;box-shadow:0 10px 28px rgba(17,67,47,.08)}.live-map-panel[hidden]{display:none!important}.live-map-header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}.live-map-header>div{display:grid;gap:2px}.live-map-eyebrow{color:#4d7665;font-size:.58rem;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.live-map-header strong{color:#173b2c;font-size:.84rem}.live-map-recenter-button,.live-map-open-button,.live-map-close-button{border:1px solid rgba(14,91,59,.16);background:#f7fbf8;color:#0e5b3b;font:inherit;font-weight:850;cursor:pointer}.live-map-recenter-button{min-height:34px;padding:0 10px;border-radius:10px;font-size:.62rem}.live-map-open-button{width:100%;min-height:40px;margin-top:9px;border-radius:11px;font-size:.66rem}.live-map-canvas{height:280px;border-radius:13px;overflow:hidden;background:#eef3ef}.live-map-summary{margin-top:10px;display:grid;grid-template-columns:1fr 1fr;gap:8px}.live-map-summary>div{padding:9px 10px;border-radius:11px;background:#f4f8f5;display:grid;gap:2px}.live-map-summary span{color:#647b71;font-size:.56rem;font-weight:850;text-transform:uppercase;letter-spacing:.05em}.live-map-summary strong{color:#173b2c;font-size:.76rem}.live-map-status{margin-top:8px;padding:8px 9px;border-radius:10px;background:#eff8f2;color:#315447;font-size:.61rem;font-weight:750;line-height:1.45}.live-map-status[data-state=waiting]{background:#fff8e7;color:#7a601e}.live-map-status[data-state=stale],.live-map-status[data-state=error]{background:#fff0f0;color:#8a3030}.live-map-status[data-state=idle]{background:#f1f3f2;color:#637069}.live-map-div-icon{background:transparent;border:0}.live-map-marker{width:38px;height:38px;display:grid;place-items:center;border:3px solid #fff;border-radius:50%;box-shadow:0 5px 16px rgba(18,58,43,.24);font-weight:950}.live-map-marker-shop{background:#0e5b3b;color:#fff;font-size:.9rem}.live-map-marker-rider{background:#fff6d8;color:#173b2c;font-size:1.15rem}.live-map-marker-customer{background:#1473e6;color:#fff;font-size:.85rem}.live-map-admin-dialog{width:min(calc(100% - 28px),720px);max-width:720px;padding:0;border:0;border-radius:22px;background:transparent}.live-map-admin-dialog::backdrop{background:rgba(12,30,23,.58);backdrop-filter:blur(3px)}.live-map-admin-shell{padding:18px;border-radius:22px;background:#f7f3e9;box-shadow:0 28px 80px rgba(12,38,28,.3)}.live-map-admin-header{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}.live-map-admin-header h2{margin:3px 0 0;color:#173b2c;font-size:1.2rem}.live-map-close-button{width:38px;height:38px;border-radius:50%;font-size:1.15rem}.live-map-admin-dialog .live-map-panel{margin-top:14px}.live-map-admin-note{margin:8px 2px 0;color:#697c73;font-size:.58rem;line-height:1.45}@media(max-width:560px){.live-map-canvas{height:240px}.live-map-admin-shell{padding:12px}.live-map-summary{grid-template-columns:1fr 1fr}.live-map-header{align-items:flex-start}}
  `;
  document.head.append(style);
}
