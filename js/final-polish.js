import {
  customerSupabase,
  getVerifiedAccountSession,
} from "/js/supabase-config.js";

const ACTIVE_ORDER_STATUSES = new Set([
  "pending",
  "preparing",
  "dispatched",
]);

const state = {
  initialized: false,
  historyLoadedForUser: null,
  historyRevision: 0,
  historyRequest: null,
  resetSending: false,
};

start().catch((error) => {
  console.warn("Final production polish could not initialize:", error);
});

async function start() {
  if (state.initialized) return;
  state.initialized = true;

  await waitForDom();
  injectStyles();

  if (isCustomerPage()) {
    initializeCustomerPolish();
  }

  if (isAdminPage() || isRiderPage()) {
    initializeStaffPolish();
  }
}

function waitForDom() {
  if (document.readyState !== "loading") return Promise.resolve();

  return new Promise((resolve) => {
    document.addEventListener("DOMContentLoaded", resolve, { once: true });
  });
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

function isRiderPage() {
  return window.location.pathname.endsWith("/rider.html");
}

/* =========================================================
   CUSTOMER ACCOUNT POLISH
========================================================= */

function initializeCustomerPolish() {
  installForgotPasswordControl();
  ensureOrderHistoryPanel();

  for (const eventName of [
    "ssupertea:account-changed",
    "ssupertea:account-signed-in",
    "ssupertea:order-changed",
  ]) {
    window.addEventListener(eventName, () => {
      invalidateOrderHistory(eventName !== "ssupertea:order-changed");
      window.setTimeout(loadOrderHistory, 0);
    });
  }

  document
    .getElementById("header-profile-button")
    ?.addEventListener("click", () => window.setTimeout(loadOrderHistory, 100));

  document
    .getElementById("mobile-profile-button")
    ?.addEventListener("click", () => window.setTimeout(loadOrderHistory, 100));

  window.addEventListener("ssupertea:account-signed-out", clearOrderHistory);

  // Invalidate immediately, before account.js finishes its asynchronous refresh.
  // Do not await Supabase calls inside an auth state change callback.
  customerSupabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") {
      clearOrderHistory();
    } else if (event === "SIGNED_IN") {
      invalidateOrderHistory(true);
      window.setTimeout(loadOrderHistory, 0);
    }
  });

  loadOrderHistory();
}

function installForgotPasswordControl() {
  const loginForm = document.getElementById("login-form");
  if (!loginForm || document.getElementById("forgot-password-button")) return;

  const button = document.createElement("button");
  button.id = "forgot-password-button";
  button.className = "account-text-action";
  button.type = "button";
  button.textContent = "Forgot password?";
  button.addEventListener("click", handleForgotPassword);
  loginForm.append(button);
}

async function handleForgotPassword() {
  if (state.resetSending) return;

  const emailInput = document.getElementById("login-email");
  const button = document.getElementById("forgot-password-button");
  const email = String(emailInput?.value || "").trim().toLowerCase();

  if (!email || !emailInput.checkValidity()) {
    setAuthStatus("Enter a valid email first, then choose Forgot password.", "error");
    emailInput?.focus();
    return;
  }

  state.resetSending = true;
  if (button) button.disabled = true;
  setAuthStatus("Sending password reset email…", "loading");

  try {
    const callback =
      `${window.location.origin}/auth-callback.html?next=${encodeURIComponent("/reset-password.html")}`;
    const { error } = await customerSupabase.auth.resetPasswordForEmail(email, {
      redirectTo: callback,
    });

    if (error) throw error;

    setAuthStatus(
      "If an account exists for this email, a reset link has been sent. Open it in the same browser where you requested it.",
      "success"
    );
  } catch (error) {
    setAuthStatus(
      error.message || "The reset email could not be sent. Check your connection and try again.",
      "error"
    );
  } finally {
    state.resetSending = false;
    if (button) button.disabled = false;
  }
}

function invalidateOrderHistory(clear = false) {
  state.historyRevision += 1;
  state.historyLoadedForUser = null;
  state.historyRequest = null;

  if (clear) {
    document.querySelector("[data-history-list]")?.replaceChildren();
  }
}

function clearOrderHistory() {
  invalidateOrderHistory(true);
  document.querySelector("[data-history-list]")?.replaceChildren(
    createHistoryMessage("Sign in to view your orders.")
  );
}

function ensureOrderHistoryPanel() {
  const profileView = document.getElementById("account-profile-view");
  if (!profileView || document.querySelector("[data-account-order-history]")) return;

  const panel = document.createElement("section");
  panel.className = "account-order-history";
  panel.dataset.accountOrderHistory = "true";
  panel.innerHTML = `
    <div class="account-history-heading">
      <div>
        <span>Order history</span>
        <strong>My Orders</strong>
      </div>
      <button type="button" data-history-refresh>Refresh</button>
    </div>
    <div class="account-history-list" data-history-list>
      <p class="account-history-empty">Sign in to view your orders.</p>
    </div>
  `;

  const logoutButton = document.getElementById("account-logout-button");
  if (logoutButton) {
    profileView.insertBefore(panel, logoutButton);
  } else {
    profileView.append(panel);
  }

  panel
    .querySelector("[data-history-refresh]")
    ?.addEventListener("click", () => {
      invalidateOrderHistory();
      loadOrderHistory();
    });
}

async function loadOrderHistory() {
  if (state.historyRequest !== null) return;

  ensureOrderHistoryPanel();
  const list = document.querySelector("[data-history-list]");
  if (!list) return;

  const requestId = ++state.historyRevision;
  state.historyRequest = requestId;

  try {
    const session = await getVerifiedAccountSession({ forceRefresh: false });
    if (requestId !== state.historyRevision) return;

    const userId = session?.user?.id;
    if (!userId) {
      clearOrderHistory();
      return;
    }

    if (state.historyLoadedForUser === userId) return;
    list.replaceChildren(createHistoryMessage("Loading your orders…"));

    const { data, error } = await customerSupabase
      .from("orders")
      .select(
        "id,order_type,items_subtotal,delivery_fee,total_price,status,created_at"
      )
      // Staff RLS can allow more rows; My Orders must still show only this user.
      .eq("customer_session_token", userId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (requestId !== state.historyRevision) return;
    if (error) throw error;

    const { data: currentAuth, error: authError } =
      await customerSupabase.auth.getSession();
    if (requestId !== state.historyRevision) return;
    if (authError || currentAuth?.session?.user?.id !== userId) {
      clearOrderHistory();
      return;
    }

    const orders = Array.isArray(data) ? data : [];
    list.replaceChildren();

    if (!orders.length) {
      list.append(createHistoryMessage("You have no previous orders yet."));
    } else {
      for (const order of orders) {
        list.append(createOrderHistoryCard(order));
      }
    }

    state.historyLoadedForUser = userId;
  } catch (error) {
    if (requestId !== state.historyRevision) return;
    console.warn("Unable to load customer order history:", error);
    list.replaceChildren(
      createHistoryMessage("Order history is temporarily unavailable. Try again shortly.")
    );
  } finally {
    if (state.historyRequest === requestId) state.historyRequest = null;
  }
}

function createHistoryMessage(message) {
  const paragraph = document.createElement("p");
  paragraph.className = "account-history-empty";
  paragraph.textContent = message;
  return paragraph;
}

function createOrderHistoryCard(order) {
  const article = document.createElement("article");
  article.className = "account-history-order";

  const top = document.createElement("div");
  top.className = "account-history-order-top";

  const identity = document.createElement("div");
  const number = document.createElement("strong");
  number.textContent = formatOrderNumber(order.id);
  const date = document.createElement("span");
  date.textContent = formatOrderDate(order.created_at);
  identity.append(number, date);

  const status = document.createElement("span");
  status.className = `account-history-status status-${safeStatus(order.status)}`;
  status.textContent = getOrderStatusLabel(order.status, order.order_type);

  top.append(identity, status);

  const facts = document.createElement("div");
  facts.className = "account-history-facts";

  const type = document.createElement("span");
  type.textContent = order.order_type === "delivery" ? "Delivery" : "Pickup";

  const total = document.createElement("strong");
  total.textContent = formatMoney(order.total_price);

  facts.append(type, total);

  if (ACTIVE_ORDER_STATUSES.has(order.status)) {
    article.dataset.active = "true";
  }

  article.append(top, facts);
  return article;
}

function setAuthStatus(message, type) {
  const status = document.getElementById("auth-status");
  if (!status) return;

  status.textContent = message || "";
  status.hidden = !message;
  status.dataset.type = type || "info";
}

/* =========================================================
   STAFF MODE + PRODUCTION COPY POLISH
========================================================= */

function initializeStaffPolish() {
  applyProductionCopy();
  applyStaffModeSwitch();

  window.addEventListener("ssupertea:staff-ready", () => {
    applyProductionCopy();
    applyStaffModeSwitch();
  });

  window.setTimeout(() => {
    applyProductionCopy();
    applyStaffModeSwitch();
  }, 300);
}

function applyStaffModeSwitch() {
  const canManage = document.body.dataset.canManageOrders === "true";
  const canDeliver = document.body.dataset.canDeliverOrders === "true";

  const adminLink = document.getElementById("admin-mode-link");
  const riderLink = document.getElementById("rider-mode-link");

  if (isAdminPage()) {
    if (adminLink) adminLink.hidden = true;

    if (riderLink) {
      riderLink.hidden = !canDeliver;
      riderLink.textContent = "Rider Mode →";
      riderLink.classList.add("staff-mode-switch");
      riderLink.setAttribute("aria-label", "Switch to Rider Mode");
    }
  }

  if (isRiderPage()) {
    if (riderLink) riderLink.hidden = true;

    if (adminLink) {
      adminLink.hidden = !canManage;
      adminLink.textContent = "← Back to Admin";
      adminLink.classList.add("staff-mode-switch");
      adminLink.setAttribute("aria-label", "Return to Store Admin");
    }
  }
}

function applyProductionCopy() {
  if (isRiderPage()) {
    const eyebrow = document.querySelector(".rider-hero .eyebrow");
    if (eyebrow) eyebrow.textContent = "Rider Mode";
  }

  if (isAdminPage()) {
    for (const paragraph of document.querySelectorAll(".admin-column-copy")) {
      if (paragraph.textContent.includes("Phase 8")) {
        paragraph.textContent =
          "Track dispatched deliveries, rider GPS status, and live route updates from this column.";
      }
    }
  }
}

/* =========================================================
   FORMATTERS + STYLES
========================================================= */

function formatOrderNumber(orderId) {
  const compact = String(orderId || "")
    .replace(/[^a-fA-F0-9]/g, "")
    .slice(0, 8)
    .toUpperCase();

  return `SS-${compact || "00000000"}`;
}

function formatOrderDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatMoney(value) {
  const number = Number(value);
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(Number.isFinite(number) ? number : 0);
}

function safeStatus(value) {
  const status = String(value || "pending").toLowerCase();
  return /^[a-z-]+$/.test(status) ? status : "pending";
}

function getOrderStatusLabel(status, orderType) {
  if (status === "dispatched" && orderType === "pickup") {
    return "Ready for pickup";
  }

  return (
    {
      pending: "Order received",
      preparing: "Preparing",
      dispatched: "Out for delivery",
      completed: "Completed",
      cancelled: "Cancelled",
    }[status] || "Pending"
  );
}

function injectStyles() {
  if (document.getElementById("final-polish-styles")) return;

  const style = document.createElement("style");
  style.id = "final-polish-styles";
  style.textContent = `
    .account-text-action {
      justify-self: end;
      margin-top: -3px;
      padding: 3px 0;
      border: 0;
      background: transparent;
      color: var(--green-800, #0e5b3b);
      font: inherit;
      font-size: .72rem;
      font-weight: 800;
      cursor: pointer;
    }
    .account-text-action:hover { text-decoration: underline; }
    .account-order-history {
      margin-top: 16px;
      padding-top: 15px;
      border-top: 1px solid var(--border, rgba(14,91,59,.14));
    }
    .account-history-heading,
    .account-history-order-top,
    .account-history-facts {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .account-history-heading > div { display: grid; gap: 2px; }
    .account-history-heading span {
      color: var(--ink-500, #6b7b73);
      font-size: .62rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: .05em;
    }
    .account-history-heading strong { color: var(--green-950, #153c2e); }
    .account-history-heading button {
      border: 0;
      background: transparent;
      color: var(--green-800, #0e5b3b);
      font: inherit;
      font-size: .66rem;
      font-weight: 850;
      cursor: pointer;
    }
    .account-history-list {
      max-height: 280px;
      margin-top: 10px;
      display: grid;
      gap: 8px;
      overflow: auto;
      overscroll-behavior: contain;
    }
    .account-history-empty {
      margin: 0;
      padding: 13px;
      border-radius: 12px;
      background: var(--cream-100, #f8f4e8);
      color: var(--ink-500, #6b7b73);
      font-size: .68rem;
      line-height: 1.5;
    }
    .account-history-order {
      padding: 11px 12px;
      border: 1px solid var(--border, rgba(14,91,59,.14));
      border-radius: 13px;
      background: #fff;
    }
    .account-history-order[data-active="true"] {
      border-color: rgba(14,91,59,.28);
      background: #f7fbf8;
    }
    .account-history-order-top > div { display: grid; gap: 2px; min-width: 0; }
    .account-history-order-top > div strong {
      color: var(--green-950, #153c2e);
      font-size: .73rem;
    }
    .account-history-order-top > div span,
    .account-history-facts span {
      color: var(--ink-500, #6b7b73);
      font-size: .61rem;
    }
    .account-history-status {
      padding: 5px 7px;
      border-radius: 999px;
      background: #eef4f1;
      color: #355c4c;
      font-size: .56rem;
      font-weight: 900;
      white-space: nowrap;
    }
    .account-history-status.status-completed { background: #eaf6ed; color: #34724a; }
    .account-history-status.status-cancelled { background: #fff0f0; color: #963b3b; }
    .account-history-status.status-dispatched { background: #efecff; color: #51458e; }
    .account-history-facts {
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid var(--border, rgba(14,91,59,.1));
    }
    .account-history-facts strong {
      color: var(--green-950, #153c2e);
      font-size: .72rem;
    }
    .staff-mode-switch {
      min-height: 40px;
      padding: 0 14px !important;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-color: rgba(255,255,255,.28) !important;
      background: #fff !important;
      color: var(--green-800, #0e5b3b) !important;
      font-weight: 900 !important;
    }
  `;

  document.head.append(style);
}
