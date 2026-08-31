import { customerSupabase } from "/js/supabase-config.js";

const status = document.getElementById("auth-callback-status");

initialize().catch(() => {
  status.textContent =
    "The sign-in session could not be completed. Check your connection and request a new link.";
});

async function initialize() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  const next = safeNextPath(url.searchParams.get("next"));
  const hash = new URLSearchParams(url.hash.slice(1));
  const authError =
    url.searchParams.get("error_description") || hash.get("error_description");

  // Never retain an authorization code or error token in browser history.
  window.history.replaceState({}, "", url.pathname);

  if (authError) {
    status.textContent = `Sign-in could not be completed: ${authError}`;
    return;
  }

  if (!code) {
    status.textContent =
      "This sign-in link is incomplete. Request a new link and open it in the same browser where you started.";
    return;
  }

  const { error } = await customerSupabase.auth.exchangeCodeForSession(code);
  if (error) {
    status.textContent =
      "This link may be expired, already used, or opened in a different browser. Request a new link and open it in the same browser where you started.";
    return;
  }

  status.textContent = next === "/reset-password.html"
    ? "Account verified. Opening the password reset form…"
    : "Signed in. Returning to Ssupertea…";
  window.location.replace(next);
}

function safeNextPath(value) {
  const path = String(value || "/");

  // Browsers normalize backslashes and control characters in URLs.
  // Accept only a root-relative path that cannot become an external URL.
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    /[\\\u0000-\u001f\u007f]/.test(path)
  ) {
    return "/";
  }

  return path;
}
