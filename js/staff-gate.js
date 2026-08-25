import {
  customerSupabase,
  getVerifiedAccountSession,
  clearCustomerSession,
} from "/js/supabase-config.js";

document.addEventListener(
  "DOMContentLoaded",
  initializeStaffGate
);

async function initializeStaffGate() {
  const required =
    document.body.dataset.staffPermission;

  const session =
    await getVerifiedAccountSession({
      forceRefresh: true,
    });

  if (!session) {
    redirectToStoreLogin();
    return;
  }

  const {
    data,
    error,
  } = await customerSupabase.rpc(
    "get_my_staff_permissions"
  );

  if (
    error ||
    !data?.active
  ) {
    redirectToStore();
    return;
  }

  const allowed =
    required === "deliver"
      ? data.can_deliver_orders === true
      : data.can_manage_orders === true;

  if (!allowed) {
    if (data.can_manage_orders) {
      window.location.replace(
        "/admin.html"
      );
      return;
    }

    if (data.can_deliver_orders) {
      window.location.replace(
        "/rider.html"
      );
      return;
    }

    redirectToStore();
    return;
  }

  document
    .getElementById(
      "staff-gate"
    )
    ?.setAttribute(
      "hidden",
      ""
    );

  const shell =
    document.getElementById(
      "staff-shell"
    );

  if (shell) {
    shell.hidden = false;
  }

  const email =
    document.getElementById(
      "staff-account-email"
    );

  if (email) {
    email.textContent =
      session.user.email ||
      "Authorized staff";
  }

  const role =
    document.getElementById(
      "staff-role-label"
    );

  if (role) {
    role.textContent =
      getRoleLabel(data);
  }

  const riderLink =
    document.getElementById(
      "rider-mode-link"
    );

  if (riderLink) {
    riderLink.hidden =
      data.can_deliver_orders !== true;
  }

  const adminLink =
    document.getElementById(
      "admin-mode-link"
    );

  if (adminLink) {
    adminLink.hidden =
      data.can_manage_orders !== true;
  }

  document
    .getElementById(
      "staff-signout-button"
    )
    ?.addEventListener(
      "click",
      async () => {
        await clearCustomerSession()
          .catch(() => {});
        window.location.replace("/");
      }
    );

  /*
   * Phase-specific staff modules wait for this signal before loading
   * protected data. Only permission booleans are exposed in the event;
   * the Auth session/token stays inside the Supabase client module.
   */
  document.body.dataset.staffReady =
    "true";
  document.body.dataset.canManageOrders =
    String(
      data.can_manage_orders === true
    );
  document.body.dataset.canDeliverOrders =
    String(
      data.can_deliver_orders === true
    );

  window.dispatchEvent(
    new CustomEvent(
      "ssupertea:staff-ready",
      {
        detail: {
          can_manage_orders:
            data.can_manage_orders === true,
          can_deliver_orders:
            data.can_deliver_orders === true,
        },
      }
    )
  );
}

function getRoleLabel(data) {
  if (
    data.can_manage_orders &&
    data.can_deliver_orders
  ) {
    return "Store Admin + Rider";
  }

  if (data.can_manage_orders) {
    return "Store Admin";
  }

  return "Rider";
}

function redirectToStoreLogin() {
  window.location.replace(
    "/?auth=login"
  );
}

function redirectToStore() {
  window.location.replace("/");
}
