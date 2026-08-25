import {
  customerSupabase,
  getVerifiedAccountSession,
} from "/js/supabase-config.js";

const ACTIVE_STATUSES = new Set([
  "pending",
  "preparing",
  "dispatched",
]);

const TERMINAL_STATUSES = new Set([
  "completed",
  "cancelled",
]);

const ORDER_QUERY_COLUMNS = [
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
].join(",");

const REFRESH_DEBOUNCE_MS = 180;
const MAX_ORDERS_TO_LOAD = 100;

const moneyFormatter = new Intl.NumberFormat(
  "en-PH",
  {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }
);

const dateTimeFormatter = new Intl.DateTimeFormat(
  "en-PH",
  {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }
);

const state = {
  initialized: false,
  session: null,
  permissions: null,
  orders: [],
  assignments: new Map(),
  riders: [],
  channel: null,
  refreshTimer: null,
  relativeTimeTimer: null,
  busyOrders: new Set(),
};

const el = {};

document.addEventListener(
  "DOMContentLoaded",
  initializeAdminModule
);

function initializeAdminModule() {
  cacheElements();
  bindEvents();

  window.addEventListener(
    "ssupertea:staff-ready",
    () => {
      startAdminDashboard().catch(
        handleInitializationError
      );
    }
  );

  if (
    document.body.dataset.staffReady ===
    "true"
  ) {
    startAdminDashboard().catch(
      handleInitializationError
    );
  }
}

function cacheElements() {
  const ids = [
    "admin-live-dot",
    "admin-live-label",
    "admin-last-updated",
    "admin-refresh-button",
    "admin-status-message",
    "admin-stat-pending",
    "admin-stat-preparing",
    "admin-stat-dispatched",
    "admin-stat-active",
    "admin-pending-count",
    "admin-preparing-count",
    "admin-dispatched-count",
    "admin-recent-count",
    "admin-pending-list",
    "admin-preparing-list",
    "admin-dispatched-list",
    "admin-recent-list",
    "admin-toast-region",
  ];

  for (const id of ids) {
    el[id] = document.getElementById(id);
  }
}

function bindEvents() {
  el["admin-refresh-button"]
    ?.addEventListener(
      "click",
      () => refreshDashboard()
    );

  document
    .getElementById("admin-dashboard")
    ?.addEventListener(
      "click",
      handleDashboardClick
    );
}

async function startAdminDashboard() {
  if (state.initialized) {
    return;
  }

  state.initialized = true;
  setStatus(
    "Loading live orders…",
    "loading"
  );

  const session =
    await getVerifiedAccountSession({
      forceRefresh: true,
    });

  if (!session) {
    window.location.replace(
      "/?auth=login"
    );
    return;
  }

  const {
    data: permissions,
    error: permissionError,
  } = await customerSupabase.rpc(
    "get_my_staff_permissions"
  );

  if (
    permissionError ||
    permissions?.active !== true ||
    permissions?.can_manage_orders !== true
  ) {
    window.location.replace("/");
    return;
  }

  state.session = session;
  state.permissions = permissions;

  await refreshDashboard({
    silent: true,
  });

  subscribeToRealtime();
  startRelativeTimeUpdates();
}

async function refreshDashboard({
  silent = false,
} = {}) {
  if (!state.session) {
    return;
  }

  if (!silent) {
    setStatus(
      "Refreshing orders…",
      "loading"
    );
  }

  el["admin-refresh-button"]?.setAttribute(
    "aria-busy",
    "true"
  );

  try {
    const [
      ordersResult,
      assignmentsResult,
      ridersResult,
    ] = await Promise.all([
      customerSupabase
        .from("orders")
        .select(ORDER_QUERY_COLUMNS)
        .order("created_at", {
          ascending: false,
        })
        .limit(MAX_ORDERS_TO_LOAD),
      customerSupabase
        .from("order_delivery_assignments")
        .select(
          "order_id,rider_user_id,assigned_by,assigned_at"
        ),
      customerSupabase.rpc(
        "admin_list_delivery_staff"
      ),
    ]);

    const firstError =
      ordersResult.error ||
      assignmentsResult.error ||
      ridersResult.error;

    if (firstError) {
      throw firstError;
    }

    state.orders =
      Array.isArray(ordersResult.data)
        ? ordersResult.data
        : [];

    state.assignments = new Map(
      (assignmentsResult.data || []).map(
        (assignment) => [
          assignment.order_id,
          assignment,
        ]
      )
    );

    state.riders =
      Array.isArray(ridersResult.data)
        ? ridersResult.data
        : [];

    renderDashboard();
    setStatus(
      "Live order dashboard is up to date.",
      "success"
    );
    updateLastUpdated();
  } catch (error) {
    console.error(
      "Unable to load the admin dashboard:",
      error
    );

    setStatus(
      getSetupAwareErrorMessage(error),
      "error"
    );
  } finally {
    el["admin-refresh-button"]?.removeAttribute(
      "aria-busy"
    );
  }
}

function renderDashboard() {
  const pending = [];
  const preparing = [];
  const dispatched = [];
  const recent = [];

  for (const order of state.orders) {
    if (order.status === "pending") {
      pending.push(order);
      continue;
    }

    if (order.status === "preparing") {
      preparing.push(order);
      continue;
    }

    if (order.status === "dispatched") {
      dispatched.push(order);
      continue;
    }

    if (
      TERMINAL_STATUSES.has(order.status) &&
      recent.length < 12
    ) {
      recent.push(order);
    }
  }

  const activeCount =
    pending.length +
    preparing.length +
    dispatched.length;

  setText(
    el["admin-stat-pending"],
    String(pending.length)
  );
  setText(
    el["admin-stat-preparing"],
    String(preparing.length)
  );
  setText(
    el["admin-stat-dispatched"],
    String(dispatched.length)
  );
  setText(
    el["admin-stat-active"],
    String(activeCount)
  );

  setText(
    el["admin-pending-count"],
    String(pending.length)
  );
  setText(
    el["admin-preparing-count"],
    String(preparing.length)
  );
  setText(
    el["admin-dispatched-count"],
    String(dispatched.length)
  );
  setText(
    el["admin-recent-count"],
    String(recent.length)
  );

  renderOrderList(
    el["admin-pending-list"],
    pending,
    "No new orders are waiting for confirmation."
  );

  renderOrderList(
    el["admin-preparing-list"],
    preparing,
    "No orders are being prepared right now."
  );

  renderOrderList(
    el["admin-dispatched-list"],
    dispatched,
    "No delivery is currently in progress."
  );

  renderOrderList(
    el["admin-recent-list"],
    recent,
    "Completed and cancelled orders will appear here."
  );
}

function renderOrderList(
  container,
  orders,
  emptyMessage
) {
  if (!container) {
    return;
  }

  container.replaceChildren();

  if (!orders.length) {
    const empty = document.createElement("div");
    empty.className = "admin-empty-state";
    empty.textContent = emptyMessage;
    container.append(empty);
    return;
  }

  const fragment =
    document.createDocumentFragment();

  for (const order of orders) {
    fragment.append(
      createOrderCard(order)
    );
  }

  container.append(fragment);
}

function createOrderCard(order) {
  const card = document.createElement("article");
  card.className =
    `admin-order-card status-${order.status}`;
  card.dataset.orderId = order.id;

  const header = document.createElement("div");
  header.className = "admin-order-header";

  const headingGroup = document.createElement("div");

  const orderNumber = document.createElement("strong");
  orderNumber.className = "admin-order-number";
  orderNumber.textContent = formatOrderNumber(
    order.id
  );

  const customer = document.createElement("span");
  customer.className = "admin-order-customer";
  customer.textContent =
    order.customer_name || "Customer";

  headingGroup.append(
    orderNumber,
    customer
  );

  const status = document.createElement("span");
  status.className =
    `admin-status-pill status-${order.status}`;
  status.textContent = getStatusLabel(
    order.status,
    order.order_type
  );

  header.append(
    headingGroup,
    status
  );

  const meta = document.createElement("div");
  meta.className = "admin-order-meta";
  meta.append(
    makeChip(
      order.order_type === "delivery"
        ? "Delivery"
        : "Pickup"
    ),
    makeChip(
      formatRelativeTime(order.created_at),
      "relative-time",
      order.created_at
    ),
    makeChip(
      formatDateTime(order.created_at)
    )
  );

  const items = createItemsBlock(order.items);
  const totals = createTotalsBlock(order);

  card.append(
    header,
    meta,
    items,
    totals
  );

  if (order.order_type === "delivery") {
    card.append(
      createDeliveryBlock(order)
    );
  }

  const assignment =
    state.assignments.get(order.id) || null;

  const actionArea =
    createActionArea(
      order,
      assignment
    );

  if (actionArea) {
    card.append(actionArea);
  }

  return card;
}

function createItemsBlock(itemsValue) {
  const wrapper = document.createElement("div");
  wrapper.className = "admin-order-items";

  const title = document.createElement("span");
  title.className = "admin-section-label";
  title.textContent = "Order items";

  const list = document.createElement("ul");

  const items = Array.isArray(itemsValue)
    ? itemsValue
    : [];

  if (!items.length) {
    const item = document.createElement("li");
    item.textContent = "Item details unavailable";
    list.append(item);
  }

  for (const item of items) {
    const row = document.createElement("li");

    const main = document.createElement("span");
    const quantity = normalizeQuantity(
      item?.quantity
    );
    const name = getItemName(item);
    main.textContent = `${quantity}× ${name}`;

    const detail = document.createElement("small");
    detail.textContent =
      getItemDetails(item) || "Customized order";

    row.append(main, detail);
    list.append(row);
  }

  wrapper.append(title, list);
  return wrapper;
}

function createTotalsBlock(order) {
  const wrapper = document.createElement("div");
  wrapper.className = "admin-order-total-row";

  const left = document.createElement("span");
  left.textContent =
    order.order_type === "delivery"
      ? `Items ${formatMoney(order.items_subtotal)} + delivery ${formatMoney(order.delivery_fee)}`
      : "Order total";

  const total = document.createElement("strong");
  total.textContent =
    formatMoney(order.total_price);

  wrapper.append(left, total);
  return wrapper;
}

function createDeliveryBlock(order) {
  const wrapper = document.createElement("div");
  wrapper.className = "admin-delivery-block";

  const copy = document.createElement("div");

  const label = document.createElement("span");
  label.className = "admin-section-label";
  label.textContent = "Delivery address";

  const address = document.createElement("p");
  address.textContent =
    order.delivery_address ||
    "Delivery address unavailable";

  const route = document.createElement("small");
  route.textContent = getRouteSummary(order);

  copy.append(label, address, route);
  wrapper.append(copy);

  const mapUrl = getGoogleMapsUrl(order);

  if (mapUrl) {
    const link = document.createElement("a");
    link.className = "admin-map-link";
    link.href = mapUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Open map";
    wrapper.append(link);
  }

  return wrapper;
}

function createActionArea(
  order,
  assignment
) {
  if (!ACTIVE_STATUSES.has(order.status)) {
    return null;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "admin-order-actions";

  if (order.status === "pending") {
    const copy = document.createElement("p");
    copy.textContent =
      "Confirm when the store has accepted this order. Customer cancellation locks immediately.";

    const button = createActionButton({
      label: "Confirm order",
      action: "confirm",
      orderId: order.id,
      primary: true,
    });

    wrapper.append(copy, button);
    return wrapper;
  }

  if (order.status === "preparing") {
    if (order.order_type !== "delivery") {
      const note = document.createElement("p");
      note.textContent =
        "Pickup order. No rider assignment is required.";
      wrapper.append(note);
      return wrapper;
    }

    wrapper.append(
      createRiderAssignmentPanel(
        order,
        assignment
      )
    );
    return wrapper;
  }

  const rider = assignment
    ? getRiderById(
        assignment.rider_user_id
      )
    : null;

  const note = document.createElement("p");
  note.textContent = rider
    ? `Assigned to ${getRiderDisplayName(rider)}. Rider delivery controls arrive in Phase 8.`
    : "Delivery is in progress. Rider delivery controls arrive in Phase 8.";

  wrapper.append(note);
  return wrapper;
}

function createRiderAssignmentPanel(
  order,
  assignment
) {
  const panel = document.createElement("div");
  panel.className = "admin-rider-panel";

  const current = document.createElement("div");
  current.className = "admin-rider-current";

  const currentLabel = document.createElement("span");
  currentLabel.className = "admin-section-label";
  currentLabel.textContent = "Assigned rider";

  const currentValue = document.createElement("strong");
  const assignedRider = assignment
    ? getRiderById(
        assignment.rider_user_id
      )
    : null;

  currentValue.textContent = assignedRider
    ? getRiderDisplayName(assignedRider)
    : "Not assigned";

  current.append(
    currentLabel,
    currentValue
  );

  const controls = document.createElement("div");
  controls.className = "admin-rider-controls";

  const select = document.createElement("select");
  select.className = "admin-rider-select";
  select.dataset.riderSelect = order.id;
  select.setAttribute(
    "aria-label",
    `Select rider for ${formatOrderNumber(order.id)}`
  );

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent =
    state.riders.length
      ? "Choose rider"
      : "No active riders";
  select.append(placeholder);

  for (const rider of state.riders) {
    const option = document.createElement("option");
    option.value = rider.user_id;
    option.textContent =
      getRiderDisplayName(rider) +
      (rider.is_current_user
        ? " (you)"
        : "");

    if (
      assignment?.rider_user_id ===
      rider.user_id
    ) {
      option.selected = true;
    }

    select.append(option);
  }

  const assignButton =
    createActionButton({
      label: assignment
        ? "Update rider"
        : "Assign rider",
      action: "assign",
      orderId: order.id,
      primary: true,
    });

  if (!state.riders.length) {
    select.disabled = true;
    assignButton.disabled = true;
  }

  controls.append(
    select,
    assignButton
  );

  if (
    state.permissions
      ?.can_deliver_orders === true &&
    state.session?.user?.id
  ) {
    const assignMe = createActionButton({
      label: "Assign to me",
      action: "assign-me",
      orderId: order.id,
      primary: false,
    });

    controls.append(assignMe);
  }

  panel.append(
    current,
    controls
  );

  return panel;
}

function createActionButton({
  label,
  action,
  orderId,
  primary,
}) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = primary
    ? "admin-action-button is-primary"
    : "admin-action-button";
  button.dataset.adminAction = action;
  button.dataset.orderId = orderId;
  button.textContent = label;

  if (state.busyOrders.has(orderId)) {
    button.disabled = true;
  }

  return button;
}

async function handleDashboardClick(event) {
  const button = event.target.closest(
    "[data-admin-action]"
  );

  if (!button) {
    return;
  }

  const action =
    button.dataset.adminAction;
  const orderId =
    button.dataset.orderId;

  if (!orderId || !action) {
    return;
  }

  if (state.busyOrders.has(orderId)) {
    return;
  }

  try {
    setOrderBusy(orderId, true);

    if (action === "confirm") {
      await confirmOrder(orderId);
      return;
    }

    if (action === "assign-me") {
      const userId =
        state.session?.user?.id;

      if (!userId) {
        throw new Error(
          "Your staff session is unavailable."
        );
      }

      await assignRider(
        orderId,
        userId
      );
      return;
    }

    if (action === "assign") {
      const select = document.querySelector(
        `[data-rider-select="${cssEscape(orderId)}"]`
      );

      const riderUserId =
        String(select?.value || "").trim();

      if (!riderUserId) {
        showToast(
          "Choose a rider first.",
          "error"
        );
        return;
      }

      await assignRider(
        orderId,
        riderUserId
      );
    }
  } catch (error) {
    console.error(
      "Admin order action failed:",
      error
    );

    showToast(
      error?.message ||
      "The order could not be updated.",
      "error"
    );

    await refreshDashboard({
      silent: true,
    });
  } finally {
    setOrderBusy(orderId, false);
  }
}

async function confirmOrder(orderId) {
  const {
    error,
  } = await customerSupabase.rpc(
    "admin_confirm_order",
    {
      p_order_id: orderId,
    }
  );

  if (error) {
    throw new Error(
      error.message ||
      "This order could not be confirmed."
    );
  }

  showToast(
    `${formatOrderNumber(orderId)} confirmed.`,
    "success"
  );

  await refreshDashboard({
    silent: true,
  });
}

async function assignRider(
  orderId,
  riderUserId
) {
  const {
    error,
  } = await customerSupabase.rpc(
    "admin_assign_rider",
    {
      p_order_id: orderId,
      p_rider_user_id: riderUserId,
    }
  );

  if (error) {
    throw new Error(
      error.message ||
      "The rider could not be assigned."
    );
  }

  const rider = getRiderById(
    riderUserId
  );

  showToast(
    rider
      ? `${getRiderDisplayName(rider)} assigned to ${formatOrderNumber(orderId)}.`
      : `Rider assigned to ${formatOrderNumber(orderId)}.`,
    "success"
  );

  await refreshDashboard({
    silent: true,
  });
}

function setOrderBusy(
  orderId,
  busy
) {
  if (busy) {
    state.busyOrders.add(orderId);
  } else {
    state.busyOrders.delete(orderId);
  }

  for (
    const button of document.querySelectorAll(
      `[data-order-id="${cssEscape(orderId)}"] [data-admin-action]`
    )
  ) {
    button.disabled = busy;
  }
}

function subscribeToRealtime() {
  if (state.channel) {
    customerSupabase.removeChannel(
      state.channel
    );
  }

  setLiveState("connecting");

  state.channel = customerSupabase
    .channel("ssupertea-admin-orders-v1")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "orders",
      },
      handleOrderRealtimeChange
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table:
          "order_delivery_assignments",
      },
      () => scheduleRealtimeRefresh()
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

function handleOrderRealtimeChange(payload) {
  const isNewPendingOrder =
    payload?.eventType === "INSERT" &&
    payload?.new?.status === "pending";

  if (isNewPendingOrder) {
    showToast(
      `New order ${formatOrderNumber(payload.new.id)} received.`,
      "info"
    );
  }

  scheduleRealtimeRefresh();
}

function scheduleRealtimeRefresh() {
  window.clearTimeout(
    state.refreshTimer
  );

  state.refreshTimer =
    window.setTimeout(
      () => {
        refreshDashboard({
          silent: true,
        });
      },
      REFRESH_DEBOUNCE_MS
    );
}

function setLiveState(value) {
  const dot = el["admin-live-dot"];
  const label = el["admin-live-label"];

  if (dot) {
    dot.dataset.state = value;
  }

  if (!label) {
    return;
  }

  if (value === "live") {
    label.textContent = "Live updates connected";
    return;
  }

  if (value === "connecting") {
    label.textContent = "Connecting live updates…";
    return;
  }

  label.textContent =
    "Live updates disconnected";
}

function startRelativeTimeUpdates() {
  window.clearInterval(
    state.relativeTimeTimer
  );

  state.relativeTimeTimer =
    window.setInterval(
      updateRelativeTimeLabels,
      30_000
    );
}

function updateRelativeTimeLabels() {
  for (
    const node of document.querySelectorAll(
      ".relative-time[data-created-at]"
    )
  ) {
    node.textContent =
      formatRelativeTime(
        node.dataset.createdAt
      );
  }
}

function makeChip(
  text,
  className = "",
  createdAt = ""
) {
  const chip = document.createElement("span");
  chip.className =
    `admin-meta-chip ${className}`.trim();
  chip.textContent = text;

  if (createdAt) {
    chip.dataset.createdAt = createdAt;
  }

  return chip;
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
    const normalized =
      String(value || "").trim();

    if (normalized) {
      return normalized;
    }
  }

  return "Drink";
}

function getItemDetails(item) {
  const details = [];

  const optionValues = [
    item?.size_label ?? item?.size,
    item?.sugar_label ?? item?.sugar_level ?? item?.sugar,
    item?.ice_label ?? item?.ice_level ?? item?.ice,
  ];

  for (const value of optionValues) {
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

  if (addons.length) {
    const addonNames = addons
      .map(getOptionDisplayText)
      .filter(Boolean);

    if (addonNames.length) {
      details.push(
        `Add-ons: ${addonNames.join(", ")}`
      );
    }
  }

  return details.join(" • ");
}

function getOptionDisplayText(value) {
  if (
    value === null ||
    value === undefined ||
    value === false
  ) {
    return "";
  }

  if (
    typeof value === "string" ||
    typeof value === "number"
  ) {
    return String(value).trim();
  }

  if (typeof value !== "object") {
    return "";
  }

  const candidates = [
    value.label,
    value.name,
    value.title,
    value.value,
    value.id,
  ];

  for (const candidate of candidates) {
    if (
      typeof candidate !== "string" &&
      typeof candidate !== "number"
    ) {
      continue;
    }

    const normalized =
      String(candidate).trim();

    if (normalized) {
      return normalized;
    }
  }

  return "";
}

function normalizeQuantity(value) {
  const quantity = Number(value);

  return Number.isFinite(quantity) &&
    quantity > 0
    ? Math.round(quantity)
    : 1;
}

function getRiderById(userId) {
  return state.riders.find(
    (rider) => rider.user_id === userId
  ) || null;
}

function getRiderDisplayName(rider) {
  const displayName = String(
    rider?.display_name || ""
  ).trim();

  const email = String(
    rider?.email || ""
  ).trim();

  if (
    displayName &&
    email &&
    displayName.toLowerCase() !==
      email.toLowerCase()
  ) {
    return displayName;
  }

  return displayName || email || "Rider";
}

function getRouteSummary(order) {
  const parts = [];

  const distance = Number(
    order.route_distance_m
  );

  if (Number.isFinite(distance)) {
    parts.push(
      distance >= 1000
        ? `${(distance / 1000).toFixed(1)} km route`
        : `${Math.round(distance)} m route`
    );
  }

  const duration = Number(
    order.route_duration_s
  );

  if (Number.isFinite(duration)) {
    parts.push(
      `${Math.max(1, Math.round(duration / 60))} min estimate`
    );
  }

  return parts.join(" • ") ||
    "Route details unavailable";
}

function getGoogleMapsUrl(order) {
  const latitude = Number(
    order.delivery_lat
  );
  const longitude = Number(
    order.delivery_lng
  );

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return "";
  }

  const destination =
    `${latitude},${longitude}`;

  return (
    "https://www.google.com/maps/dir/?api=1" +
    `&destination=${encodeURIComponent(destination)}`
  );
}

function formatOrderNumber(id) {
  const compact = String(id || "")
    .replace(/-/g, "")
    .slice(0, 8)
    .toUpperCase();

  return compact
    ? `SS-${compact}`
    : "SS-ORDER";
}

function formatMoney(value) {
  const amount = Number(value);

  return moneyFormatter.format(
    Number.isFinite(amount)
      ? amount
      : 0
  );
}

function formatDateTime(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Time unavailable";
  }

  return dateTimeFormatter.format(date);
}

function formatRelativeTime(value) {
  const timestamp = new Date(value).getTime();

  if (!Number.isFinite(timestamp)) {
    return "Just now";
  }

  const elapsedMs = Math.max(
    0,
    Date.now() - timestamp
  );

  const minutes = Math.floor(
    elapsedMs / 60_000
  );

  if (minutes < 1) {
    return "Just now";
  }

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(
    minutes / 60
  );

  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(
    hours / 24
  );

  return `${days}d ago`;
}

function getStatusLabel(
  status,
  orderType
) {
  if (status === "pending") {
    return "Pending";
  }

  if (status === "preparing") {
    return "Preparing";
  }

  if (status === "dispatched") {
    return orderType === "pickup"
      ? "Ready for pickup"
      : "On delivery";
  }

  if (status === "completed") {
    return "Completed";
  }

  if (status === "cancelled") {
    return "Cancelled";
  }

  return "Order";
}

function setStatus(message, type) {
  const node = el["admin-status-message"];

  if (!node) {
    return;
  }

  node.textContent = message;
  node.dataset.type = type;
}

function updateLastUpdated() {
  if (!el["admin-last-updated"]) {
    return;
  }

  el["admin-last-updated"].textContent =
    `Updated ${new Intl.DateTimeFormat(
      "en-PH",
      {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
      }
    ).format(new Date())}`;
}

function getSetupAwareErrorMessage(error) {
  const message = String(
    error?.message || ""
  );

  if (
    /order_delivery_assignments|admin_list_delivery_staff|confirmed_at|schema cache/i
      .test(message)
  ) {
    return (
      "Phase 7 database setup is required. Run " +
      "sql/PHASE_7_ADMIN_ORDERS.sql in Supabase, then refresh this page."
    );
  }

  return message ||
    "The live order dashboard could not be loaded.";
}

function showToast(message, type = "info") {
  const region = el["admin-toast-region"];

  if (!region) {
    return;
  }

  const toast = document.createElement("div");
  toast.className =
    `admin-toast is-${type}`;
  toast.setAttribute("role", "status");
  toast.textContent = message;
  region.append(toast);

  window.setTimeout(() => {
    toast.remove();
  }, 4200);
}

function handleInitializationError(error) {
  state.initialized = false;
  console.error(
    "Admin dashboard initialization failed:",
    error
  );
  setStatus(
    getSetupAwareErrorMessage(error),
    "error"
  );
}

function setText(node, value) {
  if (node) {
    node.textContent = value;
  }
}

function cssEscape(value) {
  if (window.CSS?.escape) {
    return window.CSS.escape(value);
  }

  return String(value).replace(
    /[^a-zA-Z0-9_-]/g,
    "\\$&"
  );
}