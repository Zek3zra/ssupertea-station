import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.2/+esm";

const CUSTOMER_AUTH_STORAGE_KEY =
  "ssupertea-customer-auth-v1";

const SESSION_REFRESH_WINDOW_SECONDS = 120;


/*
 * Replace only these two project-specific values.
 * Supabase Dashboard → Project Settings → API:
 *   1. Project URL
 *   2. Publishable key
 *
 * Never place a secret key or service_role key in browser code.
 */
const SUPABASE_URL = "https://mugcifqtacilnfotzwaa.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11Z2NpZnF0YWNpbG5mb3R6d2FhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM3NzM1NjEsImV4cCI6MjA5OTM0OTU2MX0.95efZITZi7Zjbg84LSmeIYhGRx3XyUPOlD6S4IHR3OM";

function validateConfiguration() {
  let parsedUrl;

  try {
    parsedUrl = new URL(SUPABASE_URL);
  } catch {
    throw new Error(
      "Invalid SUPABASE_URL in js/supabase-config.js. Use the exact Project URL from Supabase."
    );
  }

  if (parsedUrl.protocol !== "https:") {
    throw new Error("SUPABASE_URL must use HTTPS.");
  }

  const keyLooksUnconfigured =
    !SUPABASE_PUBLISHABLE_KEY ||
    SUPABASE_PUBLISHABLE_KEY.includes("YOUR_") ||
    SUPABASE_PUBLISHABLE_KEY.length < 20;

  if (keyLooksUnconfigured) {
    throw new Error(
      "SUPABASE_PUBLISHABLE_KEY is not configured. Use the Publishable key from Supabase, never the service_role key."
    );
  }
}

validateConfiguration();

const sharedOptions = {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    flowType: "pkce",
  },
  global: {
    headers: {
      "X-Client-Info": "ssupertea-station-pwa/1.0.0",
    },
  },
};

/*
 * Customer and staff sessions use different storage keys.
 * This prevents an admin login in one tab from replacing the anonymous
 * customer session used by the storefront on the same browser.
 */
export const customerSupabase = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    ...sharedOptions,
    auth: {
      ...sharedOptions.auth,
      storageKey: CUSTOMER_AUTH_STORAGE_KEY,
    },
  }
);

export const adminSupabase = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    ...sharedOptions,
    auth: {
      ...sharedOptions.auth,
      storageKey: "ssupertea-admin-auth-v1",
    },
  }
);

export const supabaseConfig = Object.freeze({
  url: SUPABASE_URL,
  publishableKey: SUPABASE_PUBLISHABLE_KEY,
});

function decodeJwtPayload(accessToken) {
  if (!accessToken || typeof accessToken !== "string") {
    return null;
  }

  const parts = accessToken.split(".");

  if (parts.length !== 3) {
    return null;
  }

  try {
    const base64Url = parts[1];
    const base64 = base64Url
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(base64Url.length / 4) * 4, "=");

    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (character) =>
      character.charCodeAt(0)
    );
    const json = new TextDecoder().decode(bytes);

    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function isAnonymousSession(session) {
  if (!session) {
    return false;
  }

  if (typeof session.user?.is_anonymous === "boolean") {
    return session.user.is_anonymous;
  }

  const jwtPayload = decodeJwtPayload(session.access_token);
  return jwtPayload?.is_anonymous === true;
}

/**
 * Returns the existing anonymous customer session or creates one.
 *
 * When CAPTCHA is enabled in Supabase, pass the verified CAPTCHA token:
 * ensureCustomerSession({ captchaToken: "token-from-widget" })
 */
function createAuthSessionError(prefix, authError) {
  const error = new Error(
    `${prefix}: ${authError?.message || "Unknown authentication error"}`
  );

  error.name = authError?.name || "AuthSessionError";
  error.code = authError?.code || "";
  error.status = Number(authError?.status) || 0;
  error.details = authError?.details || "";
  error.cause = authError || null;

  return error;
}

async function validateCustomerSession(session) {
  if (
    !session?.access_token ||
    !session?.user?.id ||
    !isAnonymousSession(session)
  ) {
    return false;
  }

  const {
    data: { user },
    error,
  } = await customerSupabase.auth.getUser(
    session.access_token
  );

  return Boolean(
    !error &&
    user?.id &&
    user.id === session.user.id &&
    user.is_anonymous === true
  );
}

function sessionNeedsRefresh(session) {
  const expiresAt = Number(session?.expires_at);

  if (!Number.isFinite(expiresAt)) {
    return true;
  }

  const nowSeconds =
    Math.floor(Date.now() / 1000);

  return (
    expiresAt - nowSeconds <=
    SESSION_REFRESH_WINDOW_SECONDS
  );
}

async function resetStoredCustomerSession() {
  try {
    await customerSupabase.auth.signOut({
      scope: "local",
    });
  } catch (error) {
    console.warn(
      "Unable to sign out the stale customer session:",
      error
    );
  }

  try {
    localStorage.removeItem(
      CUSTOMER_AUTH_STORAGE_KEY
    );
  } catch {
    // Storage may be unavailable in strict privacy modes.
  }
}

async function createAnonymousCustomerSession(
  captchaToken
) {
  const result = captchaToken
    ? await customerSupabase.auth.signInAnonymously({
        options: {
          captchaToken,
        },
      })
    : await customerSupabase.auth.signInAnonymously();

  if (result.error) {
    throw createAuthSessionError(
      "Unable to create anonymous customer session",
      result.error
    );
  }

  const session = result.data?.session;

  if (
    !session ||
    !isAnonymousSession(session)
  ) {
    const error = new Error(
      "Supabase returned no valid anonymous customer session."
    );

    error.code = "anonymous_session_missing";
    throw error;
  }

  if (
    !await validateCustomerSession(session)
  ) {
    await resetStoredCustomerSession();

    const error = new Error(
      "Supabase created a session that could not be verified."
    );

    error.code =
      "anonymous_session_verification_failed";

    throw error;
  }

  return session;
}

/**
 * Returns a verified anonymous customer session.
 *
 * getSession() may restore a browser-stored token. Before checkout, this
 * function refreshes when requested and verifies the user with Supabase Auth.
 * Invalid sessions are removed and replaced with a new anonymous session.
 */
export async function ensureCustomerSession({
  captchaToken = null,
  forceRefresh = false,
  forceNew = false,
} = {}) {
  if (forceNew) {
    await resetStoredCustomerSession();

    return createAnonymousCustomerSession(
      captchaToken
    );
  }

  const {
    data: { session: storedSession },
    error: sessionError,
  } = await customerSupabase.auth.getSession();

  if (sessionError) {
    await resetStoredCustomerSession();

    throw createAuthSessionError(
      "Unable to restore customer session",
      sessionError
    );
  }

  if (
    storedSession &&
    isAnonymousSession(storedSession)
  ) {
    let candidate = storedSession;

    if (
      forceRefresh ||
      sessionNeedsRefresh(candidate)
    ) {
      const {
        data,
        error: refreshError,
      } = await customerSupabase.auth.refreshSession(
        candidate
      );

      if (
        !refreshError &&
        data?.session &&
        isAnonymousSession(data.session)
      ) {
        candidate = data.session;
      } else {
        console.warn(
          "Stored customer session refresh failed:",
          refreshError
        );

        await resetStoredCustomerSession();
        candidate = null;
      }
    }

    if (
      candidate &&
      await validateCustomerSession(candidate)
    ) {
      return candidate;
    }

    await resetStoredCustomerSession();
  } else if (storedSession) {
    await resetStoredCustomerSession();
  }

  return createAnonymousCustomerSession(
    captchaToken
  );
}


/**
 * Verifies the current staff session against Supabase Auth.
 * Returns the permanent authenticated user or null.
 */
export async function getVerifiedAdminUser() {
  const {
    data: { session },
    error: sessionError,
  } = await adminSupabase.auth.getSession();

  if (sessionError || !session || isAnonymousSession(session)) {
    return null;
  }

  const {
    data: { user },
    error: userError,
  } = await adminSupabase.auth.getUser();

  if (userError || !user) {
    return null;
  }

  return user;
}

export async function clearCustomerSession() {
  const { error } = await customerSupabase.auth.signOut({ scope: "local" });

  if (error) {
    throw new Error(`Unable to clear customer session: ${error.message}`);
  }
}

export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return null;
  }

  const registration = await navigator.serviceWorker.register("/sw.js", {
    scope: "/",
    updateViaCache: "none",
  });

  return registration;
}

/*
 * Any page that imports this module automatically registers the PWA
 * service worker after the page finishes loading.
 */
if (typeof window !== "undefined") {
  window.addEventListener(
    "load",
    () => {
      registerServiceWorker().catch((error) => {
        console.error("Service worker registration failed:", error);
        window.dispatchEvent(
          new CustomEvent("ssupertea:service-worker-error", {
            detail: { message: error.message },
          })
        );
      });
    },
    { once: true }
  );
}
