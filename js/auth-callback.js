import {
  customerSupabase,
} from "/js/supabase-config.js";

const status =
  document.getElementById(
    "auth-callback-status"
  );

initialize();

async function initialize() {
  const url =
    new URL(window.location.href);

  const code =
    url.searchParams.get("code");

  const next =
    safeNextPath(
      url.searchParams.get("next")
    );

  if (!code) {
    status.textContent =
      "The sign-in callback is missing its authorization code.";
    return;
  }

  const {
    error,
  } = await customerSupabase.auth.exchangeCodeForSession(
    code
  );

  if (error) {
    status.textContent =
      error.message ||
      "The sign-in session could not be completed.";
    return;
  }

  status.textContent =
    "Signed in. Returning to Ssupertea…";

  window.location.replace(next);
}

function safeNextPath(value) {
  const path =
    String(value || "/");

  if (
    !path.startsWith("/") ||
    path.startsWith("//")
  ) {
    return "/";
  }

  return path;
}
