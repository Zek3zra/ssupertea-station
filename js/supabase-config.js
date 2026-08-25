import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.2/+esm";

const ACCOUNT_AUTH_STORAGE_KEY =
  "ssupertea-account-auth-v2";

const SESSION_REFRESH_WINDOW_SECONDS = 120;

/*
 * Browser-safe project configuration.
 * Never place a secret/service_role key in this file.
 */
const SUPABASE_URL = "https://mugcifqtacilnfotzwaa.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Gtqi4OO9Y4F9FLDofC7hEA_5K7KrM1d";

function validateConfiguration() {
  let parsedUrl;

  try {
    parsedUrl = new URL(SUPABASE_URL);
  } catch {
    throw new Error(
      "Invalid SUPABASE_URL in js/supabase-config.js."
    );
  }

  if (parsedUrl.protocol !== "https:") {
    throw new Error("SUPABASE_URL must use HTTPS.");
  }

  if (
    !SUPABASE_PUBLISHABLE_KEY ||
    SUPABASE_PUBLISHABLE_KEY.length < 20
  ) {
    throw new Error(
      "SUPABASE_PUBLISHABLE_KEY is not configured."
    );
  }
}

validateConfiguration();

export const customerSupabase = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: "pkce",
      storageKey: ACCOUNT_AUTH_STORAGE_KEY,
    },
    global: {
      headers: {
        "X-Client-Info":
          "ssupertea-station-pwa/2.0.0",
      },
    },
  }
);

/*
 * Unified identity: customers, admins, and riders use one Supabase Auth
 * session. Staff permissions decide which interface is opened.
 */
export const accountSupabase = customerSupabase;
export const adminSupabase = customerSupabase;

export const supabaseConfig = Object.freeze({
  url: SUPABASE_URL,
  publishableKey: SUPABASE_PUBLISHABLE_KEY,
  storageKey: ACCOUNT_AUTH_STORAGE_KEY,
});

export function isAnonymousSession(session) {
  return session?.user?.is_anonymous === true;
}

function sessionNeedsRefresh(session) {
  const expiresAt = Number(session?.expires_at);

  if (!Number.isFinite(expiresAt)) {
    return true;
  }

  return (
    expiresAt -
      Math.floor(Date.now() / 1000) <=
    SESSION_REFRESH_WINDOW_SECONDS
  );
}

export async function getVerifiedAccountSession({
  forceRefresh = false,
} = {}) {
  const {
    data: { session: storedSession },
    error: sessionError,
  } = await customerSupabase.auth.getSession();

  if (sessionError || !storedSession) {
    return null;
  }

  /*
   * Phase 6 no longer creates anonymous customers. If an old anonymous
   * browser session survived a deployment, remove it from the new account
   * storage and ask the customer to sign in normally.
   */
  if (isAnonymousSession(storedSession)) {
    await clearCustomerSession().catch(() => {});
    return null;
  }

  let session = storedSession;

  if (
    forceRefresh ||
    sessionNeedsRefresh(session)
  ) {
    const {
      data,
      error,
    } = await customerSupabase.auth.refreshSession();

    if (
      error ||
      !data?.session ||
      isAnonymousSession(data.session)
    ) {
      await clearCustomerSession().catch(() => {});
      return null;
    }

    session = data.session;
  }

  const {
    data: { user },
    error: userError,
  } = await customerSupabase.auth.getUser(
    session.access_token
  );

  if (
    userError ||
    !user ||
    user.id !== session.user.id ||
    user.is_anonymous === true
  ) {
    await clearCustomerSession().catch(() => {});
    return null;
  }

  return {
    ...session,
    user,
  };
}

/*
 * Kept for the existing tracking code. Unlike Phase 5, this function NEVER
 * creates an anonymous account. It only returns a verified permanent account.
 */
export async function ensureCustomerSession({
  forceRefresh = false,
} = {}) {
  const session =
    await getVerifiedAccountSession({
      forceRefresh,
    });

  if (!session) {
    const error = new Error(
      "Sign in to your Ssupertea account to continue."
    );

    error.code = "CUSTOMER_ACCOUNT_REQUIRED";
    throw error;
  }

  return session;
}

export async function getVerifiedAdminUser() {
  const session =
    await getVerifiedAccountSession({
      forceRefresh: true,
    });

  return session?.user || null;
}

export async function clearCustomerSession() {
  const {
    error,
  } = await customerSupabase.auth.signOut({
    scope: "local",
  });

  if (
    error &&
    error.code !== "session_not_found"
  ) {
    throw new Error(
      `Unable to clear account session: ${error.message}`
    );
  }

  try {
    localStorage.removeItem(
      ACCOUNT_AUTH_STORAGE_KEY
    );
  } catch {
    // Storage may be unavailable in privacy modes.
  }
}

export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return null;
  }

  return navigator.serviceWorker.register(
    "/sw.js",
    {
      scope: "/",
      updateViaCache: "none",
    }
  );
}

if (typeof window !== "undefined") {
  window.addEventListener(
    "load",
    () => {
      registerServiceWorker().catch(
        (error) => {
          console.error(
            "Service worker registration failed:",
            error
          );
        }
      );
    },
    { once: true }
  );
}
