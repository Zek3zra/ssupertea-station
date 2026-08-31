import {
  customerSupabase,
  clearCustomerSession,
  getVerifiedAccountSession,
} from "/js/supabase-config.js";

const form = document.getElementById("reset-password-form");
const passwordInput = document.getElementById("reset-password");
const confirmationInput = document.getElementById("reset-password-confirm");
const submitButton = document.getElementById("reset-password-submit");
const status = document.getElementById("reset-password-status");
let verifiedUserId = null;
let saving = false;

setFormEnabled(false);
form?.addEventListener("submit", handleSubmit);

initialize().catch(() => {
  setStatus("Your account could not be verified. Check your connection and request a new reset link.", "error");
  setFormEnabled(false);
});

async function initialize() {
  const session = await getVerifiedAccountSession({ forceRefresh: true });

  if (!session?.user?.id) {
    setStatus(
      "This password reset link is expired or invalid. Request a new link from the login screen.",
      "error"
    );
    return;
  }

  verifiedUserId = session.user.id;
  setStatus("Account verified. Enter your new password below.", "success");
  setFormEnabled(true);
  passwordInput?.focus();
}

async function handleSubmit(event) {
  event.preventDefault();
  if (!verifiedUserId || saving) return;

  const password = String(passwordInput?.value || "");
  const confirmation = String(confirmationInput?.value || "");

  if (password.length < 8) {
    setStatus("Use at least 8 characters for your new password.", "error");
    passwordInput?.focus();
    return;
  }

  if (password !== confirmation) {
    setStatus("The passwords do not match.", "error");
    confirmationInput?.focus();
    return;
  }

  saving = true;
  setFormEnabled(false);
  setStatus("Updating your password…", "loading");

  try {
    const session = await getVerifiedAccountSession();
    if (session?.user?.id !== verifiedUserId) {
      verifiedUserId = null;
      setStatus("Your account session changed. Request a new reset link before continuing.", "error");
      return;
    }

    const { error } = await customerSupabase.auth.updateUser({ password });
    if (error) throw error;

    verifiedUserId = null;
    passwordInput.value = "";
    confirmationInput.value = "";

    try {
      await clearCustomerSession();
    } catch {
      setStatus("Password updated, but sign-out could not finish. Return to your account and sign out before signing in again.", "error");
      return;
    }

    setStatus("Password updated. Returning you to sign in…", "success");
    window.setTimeout(() => {
      window.location.replace("/?auth=login&reset=success");
    }, 850);
  } catch (error) {
    setStatus(
      error.message || "Your password could not be updated. Check your connection and try again.",
      "error"
    );
  } finally {
    saving = false;
    setFormEnabled(Boolean(verifiedUserId));
  }
}

function setFormEnabled(enabled) {
  if (passwordInput) passwordInput.disabled = !enabled;
  if (confirmationInput) confirmationInput.disabled = !enabled;
  if (submitButton) submitButton.disabled = !enabled;
}

function setStatus(message, type) {
  if (!status) return;
  status.textContent = message;
  status.dataset.type = type || "info";
}
