import {
  customerSupabase,
  getVerifiedAccountSession,
} from "/js/supabase-config.js";

const ACTIVE_DELIVERY_STATUSES = new Set([
  "preparing",
  "dispatched",
]);

const MAX_RECENT_DELIVERIES = 8;
const REFRESH_DEBOUNCE_MS = 180;

const moneyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const state = {
  initialized: false,
  session: null,
  permissions: null,
  assignments: [],
  orders: [],
  channel: null,
  refreshTimer: null,
  busyOrders: new Set(),
};

const el = {};

document.addEventListener("DOMContentLoaded", initializeRiderModule);

function initializeRiderModule() {
  cacheElements();
  bindEvents();

  window.addEventListener("ssupertea:staff-ready", () => {
    startRiderDashboard().catch(handleInitializationError);
  });

  if (document.body.dataset.staffReady === "true") {
    startRiderDashboard().catch(handleInitializationError);
  }
}

function cacheElements() {
  const ids = [
    "rider-live-dot",
    "rider-live-label",
    "rider-last-updated",
    "rider-refresh-button",
    "rider-status-message",
    "rider-stat-ready",
    "rider-stat-active",
    "rider-assigned-list",
    "rider-recent-list",
    "rider-toast-region",
  ];

  for (const id of ids) {
    el[id] = document.getElementById(id);
  }
}

function bindEvents() {
  el["rider-refresh-button"]?.addEventListener("click", () => {
    refreshDashboard();
  });

  document.getElementById("rider-dashboard")?.addEventListener(
    "click",
    handleDashboardClick
  );

  window.addEventListener("focus", () => {
    if (state.initialized) {
      refreshDashboard({ silent: true });
    }
  });
}

async function startRiderDashboard() {
  if (state.initialized) {
    return;
  }

  state.initialized = true;
  setStatus("Loading assigned deliveries…", "loading");

  const session = await getVerifiedAccountSession({
    forceRefresh: true,
  });

  if (!session) {
    window.location.replace("/?auth=login");
    return;
  }

  const { data: permissions, error } = await customerSupabase.rpc(
    "get_my_staff_permissions"
  );

  if (
    error ||
    permissions?.active !== true ||
    permissions?.can_deliver_orders !== true
  ) {
    window.location.replace("/");
    return;
  }

  state.session = session;
  state.permissions = permissions;

  await refreshDashboard({ silent: true });
  subscribeToRealtime();
}

async function refreshDashboard({ silent = false } = {}) {
  if (!state.session?.user?.id) {
    return;
  }

  if (!silent) {
    setStatus("Refreshing assigned deliveries…", "loading");
  }

  el["rider-refresh-button"]?.setAttribute("aria-busy", "true");

  try {
    const riderUserId = state.session.user.id;

    const assignmentsResult = await customerSupabase
      .from("order_delivery_assignments")
      .select("order_id,rider_user_id,assigned_at")
      .eq("rider_user_id", riderUserId)
      .order("assigned_at", { ascending: false });

    if (assignmentsResult.error) {
      throw assignmentsResult.error;
    }

    state.assignments = Array.isArray(assignmentsResult.data)
      ? assignmentsResult.data
      : [];

    const orderIds = state.assignments.map((assignment) => assignment.order_id);

    if (!orderIds.length) {
      state.orders = [];
      renderDashboard();
      setStatus("No deliveries are assigned to you right now.", "success");
      updateLastUpdated();
      return;
    }

    const ordersResult = await customerSupabase
      .from("orders")
      .select(
        [
          "id",
          "customer_name",
          "order_type",
          "items",
          "items_subtotal",
          "delivery_fee",
          "total_price",
          "status",
          "delivery_address",
          "delivery_lat",
          "delivery_lng",
          "route_distance_m",
          "route_duration_s",
          "created_at",
          "confirmed_at",
        ].join(",")
      )
      .in("id", orderIds)
      .order("created_at", { ascending: false });

    if (ordersResult.error) {
      throw ordersResult.error;
    }

    state.orders = Array.isArray(ordersResult.data)
      ? ordersResult.data
      : [];

    renderDashboard();
    setStatus("Assigned deliveries are up to date.", "success");
    updateLastUpdated();
  } catch (error) {
    console.error("Unable to load Rider Mode:", error);
    setStatus(getSetupAwareErrorMessage(error), "error");
  } finally {
    el["rider-refresh-button"]?.removeAttribute("aria-busy");
  }
}

function renderDashboard() {
  const preparing = state.orders.filter((order) => order.status === "preparing");
  const dispatched = state.orders.filter((order) => order.status === "dispatched");
  const recent = state.orders
    .filter((order) => order.status === "completed")
    .slice(0, MAX_RECENT_DELIVERIES);

  setText(el["rider-stat-ready"], String(preparing.length));
  setText(el["rider-stat-active"], String(dispatched.length));

  const assigned = [...dispatched, ...preparing];

  renderOrderList(
    el["rider-assigned-list"],
    assigned,
    "No active delivery is assigned to you."
  );

  renderOrderList(
    el["rider-recent-list"],
    recent,
    "Completed deliveries will appear here."
  );
}

function renderOrderList(container, orders, emptyMessage) {
  if (!container) {
    return;
  }

  container.replaceChildren();

  if (!orders.length) {
    const empty = document.createElement("div");
    empty.className = "rider-empty-state";
    empty.textContent = emptyMessage;
    container.append(empty);
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const order of orders) {
    fragment.append(createDeliveryCard(order));
  }

  container.append(fragment);
}

function createDeliveryCard(order) {
  const card = document.createElement("article");
  card.className = `rider-order-card status-${order.status}`;
  card.dataset.orderId = order.id;

  const header = document.createElement("div");
  header.className = "rider-order-header";

  const heading = document.createElement("div");
  const number = document.createElement("strong");
  number.className = "rider-order-number";
  number.textContent = formatOrderNumber(order.id);

  const customer = document.createElement("span");
  customer.className = "rider-order-customer";
  customer.textContent = order.customer_name || "Customer";

  heading.append(number, customer);

  const status = document.createElement("span");
  status.className = `rider-status-pill status-${order.status}`;
  status.textContent = getStatusLabel(order.status);

  header.append(heading, status);

  const meta = document.createElement("div");
  meta.className = "rider-order-meta";
  meta.append(
    makeChip(formatDateTime(order.created_at)),
    makeChip(getRouteSummary(order))
  );

  const items = createItemsBlock(order.items);

  const addressBlock = document.createElement("div");
  addressBlock.className = "rider-address-block";

  const addressLabel = document.createElement("span");
  addressLabel.className = "rider-section-label";
  addressLabel.textContent = "Delivery address";

  const address = document.createElement("p");
  address.textContent = order.delivery_address || "Delivery address unavailable";

  addressBlock.append(addressLabel, address);

  const mapUrl = getGoogleMapsUrl(order);
  if (mapUrl) {
    const mapLink = document.createElement("a");
    mapLink.className = "rider-map-link";
    mapLink.href = mapUrl;
    mapLink.target = "_blank";
    mapLink.rel = "noopener noreferrer";
    mapLink.textContent = "Open in Google Maps";
    addressBlock.append(mapLink);
  }

  const totals = document.createElement("div");
  totals.className = "rider-total-row";
  totals.innerHTML = `
    <span>Order total</span>
    <strong>${escapeHtml(formatMoney(order.total_price))}</strong>
  `;

  card.append(header, meta, items, addressBlock, totals);

  if (ACTIVE_DELIVERY_STATUSES.has(order.status)) {
    card.append(createActionArea(order));
  }

  return card;
}

function createItemsBlock(itemsValue) {
  const wrapper = document.createElement("div");
  wrapper.className = "rider-order-items";

  const label = document.createElement("span");
  label.className = "rider-section-label";
  label.textContent = "Order items";

  const list = document.createElement("ul");
  const items = Array.isArray(itemsValue) ? itemsValue : [];

  if (!items.length) {
    const row = document.createElement("li");
    row.textContent = "Item details unavailable";
    list.append(row);
  }

  for (const item of items) {
    const row = document.createElement("li");

    const main = document.createElement("strong");
    main.textContent = `${normalizeQuantity(item?.quantity)}× ${getItemName(item)}`;

    const detail = document.createElement("small");
    detail.textContent = getItemDetails(item) || "Customized order";

    row.append(main, detail);
    list.append(row);
  }

  wrapper.append(label, list);
  return wrapper;
}

function createActionArea(order) {
  const wrapper = document.createElement("div");
  wrapper.className = "rider-order-actions";

  const copy = document.createElement("p");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "rider-action-button";
  button.dataset.orderId = order.id;

  if (order.status === "preparing") {
    copy.textContent = "Start only when you are leaving the shop with this delivery.";
    button.dataset.riderAction = "start";
    button.textContent = "Start delivery";
  } else {
    copy.textContent = "Complete the delivery only after the customer has received the order.";
    button.dataset.riderAction = "complete";
    button.textContent = "Complete delivery";
  }

  if (state.busyOrders.has(order.id)) {
    button.disabled = true;
  }

  wrapper.append(copy, button);
  return wrapper;
}

async function handleDashboardClick(event) {
  const button = event.target.closest("[data-rider-action]");

  if (!button) {
    return;
  }

  const action = button.dataset.riderAction;
  const orderId = button.dataset.orderId;

  if (!action || !orderId || state.busyOrders.has(orderId)) {
    return;
  }

  try {
    setOrderBusy(orderId, true);

    if (action === "start") {
      await runOrderRpc("rider_start_delivery", orderId);
      showToast(`${formatOrderNumber(orderId)} is now out for delivery.`, "success");
    } else if (action === "complete") {
      const confirmed = window.confirm(
        `Mark ${formatOrderNumber(orderId)} as delivered and completed?`
      );

      if (!confirmed) {
        return;
      }

      await runOrderRpc("rider_complete_delivery", orderId);
      showToast(`${formatOrderNumber(orderId)} completed.`, "success");
    }

    await refreshDashboard({ silent: true });
  } catch (error) {
    console.error("Rider order action failed:", error);
    showToast(
      error?.message || "The delivery could not be updated.",
      "error"
    );
    await refreshDashboard({ silent: true });
  } finally {
    setOrderBusy(orderId, false);
  }
}

async function runOrderRpc(functionName, orderId) {
  const { error } = await customerSupabase.rpc(functionName, {
    p_order_id: orderId,
  });

  if (error) {
    throw new Error(error.message || "Delivery update failed.");
  }
}

function setOrderBusy(orderId, busy) {
  if (busy) {
    state.busyOrders.add(orderId);
  } else {
    state.busyOrders.delete(orderId);
  }

  for (const button of document.querySelectorAll(
    `[data-order-id="${cssEscape(orderId)}"] [data-rider-action]`
  )) {
    button.disabled = busy;
  }
}

function subscribeToRealtime() {
  if (state.channel) {
    customerSupabase.removeChannel(state.channel);
  }

  setLiveState("connecting");

  state.channel = customerSupabase
    .channel("ssupertea-rider-core-v1")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "order_delivery_assignments",
      },
      () => scheduleRefresh()
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "orders",
      },
      () => scheduleRefresh()
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        setLiveState("live");
        return;
      }

      if (
        status === "CHANNEL_ERROR" ||
        status === "TIMED_OUT" ||
        status === "CLOSED"
      ) {
        setLiveState("offline");
      }
    });
}

function scheduleRefresh() {
  window.clearTimeout(state.refreshTimer);
  state.refreshTimer = window.setTimeout(() => {
    refreshDashboard({ silent: true });
  }, REFRESH_DEBOUNCE_MS);
}

function setLiveState(value) {
  const dot = el["rider-live-dot"];
  const label = el["rider-live-label"];

  if (dot) {
    dot.dataset.state = value;
  }

  if (!label) {
    return;
  }

  label.textContent =
    value === "live"
      ? "Live updates connected"
      : value === "connecting"
        ? "Connecting live updates…"
        : "Live updates disconnected";
}

function getItemName(item) {
  const candidates = [
    item?.name,
    item?.product_name,
    item?.productName,
    item?.item_name,
    item?.title,
  ];

  for (const value of candidates) {
    const normalized = String(value || "").trim();
    if (normalized) {
      return normalized;
    }
  }

  return "Drink";
}

function getItemDetails(item) {
  const details = [];

  for (const value of [
    item?.size_label ?? item?.size,
    item?.sugar_label ?? item?.sugar_level ?? item?.sugar,
    item?.ice_label ?? item?.ice_level ?? item?.ice,
  ]) {
    const normalized = getOptionDisplayText(value);
    if (normalized) {
      details.push(normalized);
    }
  }

  const addons = Array.isArray(item?.addons)
    ? item.addons
    : Array.isArray(item?.add_ons)
      ? item.add_ons
      : [];

  const addonNames = addons.map(getOptionDisplayText).filter(Boolean);
  if (addonNames.length) {
    details.push(`Add-ons: ${addonNames.join(", ")}`);
  }

  return details.join(" • ");
}

function getOptionDisplayText(value) {
  if (value === null || value === undefined || value === false) {
    return "";
  }

  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim();
  }

  if (typeof value !== "object") {
    return "";
  }

  for (const candidate of [
    value.label,
    value.name,
    value.title,
    value.value,
    value.id,
  ]) {
    if (typeof candidate !== "string" && typeof candidate !== "number") {
      continue;
    }

    const normalized = String(candidate).trim();
    if (normalized) {
      return normalized;
    }
  }

  return "";
}

function normalizeQuantity(value) {
  const quantity = Number(value);
  return Number.isFinite(quantity) && quantity > 0
    ? Math.round(quantity)
    : 1;
}

function getRouteSummary(order) {
  const parts = [];
  const distance = Number(order.route_distance_m);
  const duration = Number(order.route_duration_s);

  if (Number.isFinite(distance)) {
    parts.push(
      distance >= 1000
        ? `${(distance / 1000).toFixed(1)} km`
        : `${Math.round(distance)} m`
    );
  }

  if (Number.isFinite(duration)) {
    parts.push(`${Math.max(1, Math.round(duration / 60))} min estimate`);
  }

  return parts.join(" • ") || "Route details unavailable";
}

function getGoogleMapsUrl(order) {
  const latitude = Number(order.delivery_lat);
  const longitude = Number(order.delivery_lng);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return "";
  }

  const destination = encodeURIComponent(`${latitude},${longitude}`);
  return `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`;
}

function getStatusLabel(status) {
  if (status === "preparing") {
    return "Ready to start";
  }

  if (status === "dispatched") {
    return "Out for delivery";
  }

  if (status === "completed") {
    return "Completed";
  }

  return "Delivery";
}

function formatOrderNumber(id) {
  const compact = String(id || "")
    .replace(/-/g, "")
    .slice(0, 8)
    .toUpperCase();

  return compact ? `SS-${compact}` : "SS-ORDER";
}

function formatMoney(value) {
  const amount = Number(value);
  return moneyFormatter.format(Number.isFinite(amount) ? amount : 0);
}

function formatDateTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Time unavailable"
    : dateTimeFormatter.format(date);
}

function makeChip(text) {
  const chip = document.createElement("span");
  chip.className = "rider-meta-chip";
  chip.textContent = text;
  return chip;
}

function setStatus(message, type) {
  const node = el["rider-status-message"];
  if (!node) {
    return;
  }

  node.textContent = message;
  node.dataset.type = type;
}

function updateLastUpdated() {
  if (!el["rider-last-updated"]) {
    return;
  }

  el["rider-last-updated"].textContent = `Updated ${new Intl.DateTimeFormat(
    "en-PH",
    {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    }
  ).format(new Date())}`;
}

function getSetupAwareErrorMessage(error) {
  const message = String(error?.message || "");

  if (
    /rider_start_delivery|rider_complete_delivery|order_delivery_assignments|permission denied|row-level security|schema cache/i.test(
      message
    )
  ) {
    return "Phase 8 Rider Core database setup is required before Rider Mode can load assigned orders.";
  }

  return message || "Rider Mode could not be loaded.";
}

function showToast(message, type = "info") {
  const region = el["rider-toast-region"];
  if (!region) {
    return;
  }

  const toast = document.createElement("div");
  toast.className = `rider-toast is-${type}`;
  toast.setAttribute("role", "status");
  toast.textContent = message;
  region.append(toast);

  window.setTimeout(() => toast.remove(), 4200);
}

function handleInitializationError(error) {
  state.initialized = false;
  console.error("Rider dashboard initialization failed:", error);
  setStatus(getSetupAwareErrorMessage(error), "error");
}

function setText(node, value) {
  if (node) {
    node.textContent = value;
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function cssEscape(value) {
  if (window.CSS?.escape) {
    return window.CSS.escape(value);
  }

  return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}
