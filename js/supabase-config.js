import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.2/+esm";

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
      storageKey: "ssupertea-customer-auth-v1",
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

export async function ensureCustomerSession({ captchaToken = null } = {}) {
  const {
    data: { session: existingSession },
    error: sessionError,
  } = await customerSupabase.auth.getSession();

  if (sessionError) {
    throw createAuthSessionError(
      "Unable to restore customer session",
      sessionError
    );
  }

  if (existingSession && isAnonymousSession(existingSession)) {
    return existingSession;
  }

  if (existingSession) {
    const { error: signOutError } = await customerSupabase.auth.signOut({
      scope: "local",
    });

    if (signOutError) {
      throw createAuthSessionError(
        "Unable to reset customer session",
        signOutError
      );
    }
  }

  const signInResult = captchaToken
    ? await customerSupabase.auth.signInAnonymously({
        options: { captchaToken },
      })
    : await customerSupabase.auth.signInAnonymously();

  if (signInResult.error) {
    throw createAuthSessionError(
      "Unable to create anonymous customer session",
      signInResult.error
    );
  }

  const session = signInResult.data?.session;

  if (!session || !isAnonymousSession(session)) {
    const error = new Error(
      "Supabase returned no valid anonymous customer session."
    );

    error.code = "anonymous_session_missing";
    throw error;
  }

  return session;
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
