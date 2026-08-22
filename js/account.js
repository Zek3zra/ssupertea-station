import {
  customerSupabase,
  clearCustomerSession,
  getVerifiedAccountSession,
} from "/js/supabase-config.js";

const ACTIVE_ORDER_STATUSES = [
  "pending",
  "preparing",
  "dispatched",
];

const STAFF_ROUTE_ADMIN = "/admin.html";
const STAFF_ROUTE_RIDER = "/rider.html";

const accountState = {
  session: null,
  activeOrder: null,
  initialized: false,
  pendingCheckout: false,
};

const el = {};

export async function initializeAccountSystem() {
  cacheAccountElements();
  bindAccountEvents();

  await refreshAccountState({
    allowStaffRedirect: true,
  });

  customerSupabase.auth.onAuthStateChange(
    (event) => {
      if (
        event === "SIGNED_IN" ||
        event === "TOKEN_REFRESHED" ||
        event === "USER_UPDATED" ||
        event === "SIGNED_OUT"
      ) {
        window.setTimeout(async () => {
          await refreshAccountState({
            allowStaffRedirect:
              event === "SIGNED_IN",
          });

          window.dispatchEvent(
            new CustomEvent(
              "ssupertea:account-changed",
              {
                detail: {
                  event,
                  session:
                    accountState.session,
                  activeOrder:
                    accountState.activeOrder,
                },
              }
            )
          );
        }, 0);
      }
    }
  );

  window.addEventListener(
    "ssupertea:order-changed",
    async () => {
      await refreshActiveOrder();
      renderAccountUI();
    }
  );

  const query =
    new URLSearchParams(
      window.location.search
    );

  if (
    query.get("auth") === "login"
  ) {
    openAccountDialog({
      mode: "login",
      message:
        "Sign in to continue.",
    });
  }

  accountState.initialized = true;
  return accountState;
}

export function getAccountState() {
  return {
    ...accountState,
  };
}

export async function ensureCustomerAccount({
  openDialog = true,
  checkoutIntent = false,
} = {}) {
  const session =
    await getVerifiedAccountSession({
      forceRefresh: true,
    });

  if (!session) {
    accountState.session = null;

    if (checkoutIntent) {
      accountState.pendingCheckout = true;
    }

    renderAccountUI();

    if (openDialog) {
      openAccountDialog({
        mode: "login",
        message: checkoutIntent
          ? "Sign in or create an account before placing an order."
          : "Sign in to continue.",
      });
    }

    return null;
  }

  accountState.session = session;
  return session;
}

export async function getActiveOrderForCurrentAccount() {
  if (!accountState.session) {
    accountState.session =
      await getVerifiedAccountSession();
  }

  if (!accountState.session) {
    accountState.activeOrder = null;
    return null;
  }

  const {
    data,
    error,
  } = await customerSupabase
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
        "customer_session_token",
        "created_at",
      ].join(",")
    )
    .in("status", ACTIVE_ORDER_STATUSES)
    .order("created_at", {
      ascending: false,
    })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn(
      "Unable to load active order:",
      error
    );
    return null;
  }

  accountState.activeOrder =
    data || null;

  renderAccountUI();

  return accountState.activeOrder;
}

export async function cancelPendingOrder(
  orderId
) {
  const session =
    await ensureCustomerAccount({
      openDialog: true,
    });

  if (!session) {
    const error = new Error(
      "Sign in before cancelling an order."
    );
    error.code =
      "CUSTOMER_ACCOUNT_REQUIRED";
    throw error;
  }

  const response = await fetch(
    "/api/cancel-order",
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json",
        Authorization:
          `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        order_id: orderId,
      }),
    }
  );

  const payload =
    await response.json().catch(
      () => ({})
    );

  if (
    response.ok &&
    payload?.order
  ) {
    accountState.activeOrder = null;

    window.dispatchEvent(
      new CustomEvent(
        "ssupertea:order-changed",
        {
          detail: {
            order: payload.order,
          },
        }
      )
    );

    return payload.order;
  }

  const error = new Error(
    payload?.message ||
    "The order could not be cancelled."
  );

  error.code =
    payload?.code || "";
  error.status =
    response.status;

  throw error;
}

export function openAccountDialog({
  mode = "login",
  message = "",
} = {}) {
  setAuthMode(mode);

  if (message) {
    setAuthStatus(
      message,
      "info"
    );
  }

  if (
    !el["account-dialog"].open
  ) {
    el["account-dialog"].showModal();
  }

  document.body.classList.add(
    "dialog-open"
  );

  window.setTimeout(() => {
    if (mode === "signup") {
      el["signup-name"]?.focus();
    } else {
      el["login-email"]?.focus();
    }
  }, 40);
}

async function refreshAccountState({
  allowStaffRedirect = false,
} = {}) {
  accountState.session =
    await getVerifiedAccountSession();

  if (!accountState.session) {
    accountState.activeOrder = null;
    renderAccountUI();
    return;
  }

  const permissions =
    await getMyStaffPermissions();

  if (
    allowStaffRedirect &&
    permissions.active === true
  ) {
    if (
      permissions.can_manage_orders
    ) {
      window.location.replace(
        STAFF_ROUTE_ADMIN
      );
      return;
    }

    if (
      permissions.can_deliver_orders
    ) {
      window.location.replace(
        STAFF_ROUTE_RIDER
      );
      return;
    }
  }

  await refreshActiveOrder();
  renderAccountUI();

  if (
    accountState.pendingCheckout &&
    !accountState.activeOrder
  ) {
    accountState.pendingCheckout =
      false;

    window.dispatchEvent(
      new CustomEvent(
        "ssupertea:resume-checkout"
      )
    );
  }
}

async function refreshActiveOrder() {
  if (!accountState.session) {
    accountState.activeOrder = null;
    return null;
  }

  return getActiveOrderForCurrentAccount();
}

async function getMyStaffPermissions() {
  const {
    data,
    error,
  } = await customerSupabase.rpc(
    "get_my_staff_permissions"
  );

  if (error) {
    /*
     * Before the Phase 6 SQL is installed, customers should still be able
     * to use the storefront. The setup guide verifies the RPC separately.
     */
    console.warn(
      "Staff permission check unavailable:",
      error
    );

    return {
      active: false,
      can_manage_orders: false,
      can_deliver_orders: false,
    };
  }

  return data || {
    active: false,
    can_manage_orders: false,
    can_deliver_orders: false,
  };
}

function cacheAccountElements() {
  const ids = [
    "header-profile-button",
    "header-profile-label",
    "header-profile-avatar",
    "mobile-profile-button",
    "mobile-profile-label",
    "account-dialog",
    "close-account-dialog",
    "account-login-view",
    "account-signup-view",
    "account-profile-view",
    "account-dialog-title",
    "account-dialog-copy",
    "account-login-tab",
    "account-signup-tab",
    "google-login-button",
    "login-form",
    "login-email",
    "login-password",
    "signup-form",
    "signup-name",
    "signup-email",
    "signup-password",
    "signup-confirm-password",
    "auth-status",
    "account-profile-avatar",
    "account-profile-name",
    "account-profile-email",
    "account-active-order-card",
    "account-active-order-number",
    "account-active-order-status",
    "account-track-order-button",
    "account-logout-button",
  ];

  for (const id of ids) {
    el[id] =
      document.getElementById(id);
  }
}

function bindAccountEvents() {
  el["header-profile-button"]
    ?.addEventListener(
      "click",
      handleProfileButton
    );

  el["mobile-profile-button"]
    ?.addEventListener(
      "click",
      handleProfileButton
    );

  el["close-account-dialog"]
    ?.addEventListener(
      "click",
      closeAccountDialog
    );

  el["account-dialog"]
    ?.addEventListener(
      "click",
      (event) => {
        if (
          event.target ===
          el["account-dialog"]
        ) {
          closeAccountDialog();
        }
      }
    );

  el["account-login-tab"]
    ?.addEventListener(
      "click",
      () => setAuthMode("login")
    );

  el["account-signup-tab"]
    ?.addEventListener(
      "click",
      () => setAuthMode("signup")
    );

  el["google-login-button"]
    ?.addEventListener(
      "click",
      handleGoogleLogin
    );

  el["login-form"]
    ?.addEventListener(
      "submit",
      handleEmailLogin
    );

  el["signup-form"]
    ?.addEventListener(
      "submit",
      handleEmailSignup
    );

  el["account-track-order-button"]
    ?.addEventListener(
      "click",
      () => {
        const order =
          accountState.activeOrder;

        if (!order) {
          return;
        }

        closeAccountDialog();

        window.dispatchEvent(
          new CustomEvent(
            "ssupertea:track-active-order",
            {
              detail: {
                order,
              },
            }
          )
        );
      }
    );

  el["account-logout-button"]
    ?.addEventListener(
      "click",
      handleLogout
    );
}

function handleProfileButton() {
  if (accountState.session) {
    setAuthMode("profile");
    openAccountDialog({
      mode: "profile",
    });
    return;
  }

  openAccountDialog({
    mode: "login",
  });
}

async function handleGoogleLogin() {
  setAuthStatus(
    "Opening Google sign-in…",
    "loading"
  );

  const next =
    `${window.location.pathname}${window.location.search}${window.location.hash}`;

  const callback =
    `${window.location.origin}/auth-callback.html?next=${encodeURIComponent(next)}`;

  const {
    error,
  } = await customerSupabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callback,
    },
  });

  if (error) {
    setAuthStatus(
      error.message ||
      "Google sign-in could not start.",
      "error"
    );
  }
}

async function handleEmailLogin(
  event
) {
  event.preventDefault();

  const email =
    normalizeEmail(
      el["login-email"].value
    );

  const password =
    el["login-password"].value;

  setAuthStatus(
    "Signing in…",
    "loading"
  );

  const {
    data,
    error,
  } = await customerSupabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    setAuthStatus(
      getAuthErrorMessage(error),
      "error"
    );
    return;
  }

  accountState.session =
    data?.session || null;

  await afterSuccessfulAuthentication();
}

async function handleEmailSignup(
  event
) {
  event.preventDefault();

  const name =
    String(
      el["signup-name"].value || ""
    )
      .trim()
      .replace(/\s+/g, " ");

  const email =
    normalizeEmail(
      el["signup-email"].value
    );

  const password =
    el["signup-password"].value;

  const confirmation =
    el["signup-confirm-password"].value;

  if (
    name.length < 2 ||
    name.length > 120
  ) {
    setAuthStatus(
      "Enter your full name.",
      "error"
    );
    return;
  }

  if (password !== confirmation) {
    setAuthStatus(
      "The passwords do not match.",
      "error"
    );
    return;
  }

  if (password.length < 8) {
    setAuthStatus(
      "Use at least 8 characters for your password.",
      "error"
    );
    return;
  }

  setAuthStatus(
    "Creating your account…",
    "loading"
  );

  const callback =
    `${window.location.origin}/auth-callback.html?next=${encodeURIComponent("/")}`;

  const {
    data,
    error,
  } = await customerSupabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: name,
      },
      emailRedirectTo: callback,
    },
  });

  if (error) {
    setAuthStatus(
      getAuthErrorMessage(error),
      "error"
    );
    return;
  }

  if (!data?.session) {
    setAuthStatus(
      "Account created. Check your email and confirm it before signing in.",
      "success"
    );
    return;
  }

  accountState.session =
    data.session;

  await afterSuccessfulAuthentication();
}

async function afterSuccessfulAuthentication() {
  await refreshAccountState({
    allowStaffRedirect: true,
  });

  if (
    !accountState.session
  ) {
    return;
  }

  closeAccountDialog();

  window.dispatchEvent(
    new CustomEvent(
      "ssupertea:account-signed-in",
      {
        detail: {
          session:
            accountState.session,
          activeOrder:
            accountState.activeOrder,
        },
      }
    )
  );
}

async function handleLogout() {
  setAuthStatus(
    "Signing out…",
    "loading"
  );

  await clearCustomerSession()
    .catch((error) => {
      console.warn(
        "Local account sign-out:",
        error
      );
    });

  accountState.session = null;
  accountState.activeOrder = null;
  accountState.pendingCheckout = false;

  closeAccountDialog();
  renderAccountUI();

  window.dispatchEvent(
    new CustomEvent(
      "ssupertea:account-signed-out"
    )
  );
}

function renderAccountUI() {
  const user =
    accountState.session?.user;

  const signedIn =
    Boolean(user);

  const name =
    getDisplayName(user);

  const email =
    user?.email || "";

  const initial =
    getInitial(name || email);

  if (el["header-profile-label"]) {
    el["header-profile-label"].textContent =
      signedIn
        ? firstName(name || "Account")
        : "Login";
  }

  if (el["header-profile-avatar"]) {
    el["header-profile-avatar"].textContent =
      signedIn
        ? initial
        : "";
  }

  if (el["mobile-profile-label"]) {
    el["mobile-profile-label"].textContent =
      signedIn
        ? "Profile"
        : "Login";
  }

  if (signedIn) {
    el["account-profile-avatar"].textContent =
      initial;

    el["account-profile-name"].textContent =
      name || "Ssupertea customer";

    el["account-profile-email"].textContent =
      email;
  }

  const order =
    accountState.activeOrder;

  if (
    el["account-active-order-card"]
  ) {
    el["account-active-order-card"].hidden =
      !order;
  }

  if (order) {
    el["account-active-order-number"].textContent =
      formatOrderNumber(order.id);

    el["account-active-order-status"].textContent =
      getOrderStatusLabel(
        order.status,
        order.order_type
      );
  }
}

function setAuthMode(mode) {
  const signedIn =
    mode === "profile" &&
    Boolean(accountState.session);

  const showLogin =
    !signedIn &&
    mode !== "signup";

  const showSignup =
    !signedIn &&
    mode === "signup";

  el["account-login-view"].hidden =
    !showLogin;

  el["account-signup-view"].hidden =
    !showSignup;

  el["account-profile-view"].hidden =
    !signedIn;

  el["account-login-tab"].classList.toggle(
    "is-active",
    showLogin
  );

  el["account-signup-tab"].classList.toggle(
    "is-active",
    showSignup
  );

  const tabs =
    document.querySelector(
      ".account-auth-tabs"
    );

  if (tabs) {
    tabs.hidden = signedIn;
  }

  el["google-login-button"].hidden =
    signedIn;

  el["account-dialog-title"].textContent =
    signedIn
      ? "Your account"
      : showSignup
        ? "Create your account"
        : "Welcome back";

  el["account-dialog-copy"].textContent =
    signedIn
      ? "Track your current order and manage your session."
      : "Sign in before placing an order.";

  setAuthStatus("", "info");
  renderAccountUI();
}

function closeAccountDialog() {
  if (
    el["account-dialog"]?.open
  ) {
    el["account-dialog"].close();
  }

  document.body.classList.remove(
    "dialog-open"
  );
}

function setAuthStatus(
  message,
  type
) {
  const status =
    el["auth-status"];

  if (!status) {
    return;
  }

  status.textContent =
    message || "";

  status.hidden =
    !message;

  status.dataset.type =
    type || "info";
}

function getDisplayName(user) {
  return String(
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    ""
  )
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function firstName(value) {
  return (
    String(value || "")
      .trim()
      .split(/\s+/)[0] ||
    "Account"
  );
}

function getInitial(value) {
  const character =
    String(value || "")
      .trim()
      .charAt(0)
      .toUpperCase();

  return /^[A-Z0-9]$/.test(
    character
  )
    ? character
    : "S";
}

function getAuthErrorMessage(error) {
  const code =
    String(error?.code || "")
      .toLowerCase();

  if (
    code === "invalid_credentials"
  ) {
    return "The email or password is incorrect.";
  }

  if (
    code === "email_not_confirmed"
  ) {
    return "Confirm your email address before signing in.";
  }

  if (
    code === "user_already_exists" ||
    code === "user_already_registered"
  ) {
    return "An account already exists for that email. Sign in instead.";
  }

  return (
    error?.message ||
    "Authentication failed."
  );
}

function getOrderStatusLabel(
  status,
  orderType
) {
  if (
    status === "dispatched" &&
    orderType === "pickup"
  ) {
    return "Ready for pickup";
  }

  const labels = {
    pending: "Order received",
    preparing: "Preparing",
    dispatched: "Out for delivery",
    completed: "Completed",
    cancelled: "Cancelled",
  };

  return labels[status] || "Pending";
}

function formatOrderNumber(orderId) {
  const compact =
    String(orderId || "")
      .replace(/[^a-fA-F0-9]/g, "")
      .slice(0, 8)
      .toUpperCase();

  return `SS-${compact || "00000000"}`;
}
