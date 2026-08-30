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

initialize().catch((error) => {
  console.warn("Password reset page initialization failed:", error);
  setStatus("This password reset link could not be verified.", "error");
  setFormEnabled(false);
});

async function initialize() {
  const session = await getVerifiedAccountSession({ forceRefresh: true });

  if (!session) {
    setStatus(
      "This password reset link is expired or invalid. Request a new link from the login screen.",
      "error"
    );
    setFormEnabled(false);
    return;
  }

  setStatus("Reset link verified. Enter your new password below.", "success");
  setFormEnabled(true);
  passwordInput?.focus();

  form?.addEventListener("submit", handleSubmit);
}

async function handleSubmit(event) {
  event.preventDefault();

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

  setFormEnabled(false);
  setStatus("Updating your password…", "loading");

  const { error } = await customerSupabase.auth.updateUser({ password });

  if (error) {
    setStatus(
      error.message || "Your password could not be updated. Request a new reset link and try again.",
      "error"
    );
    setFormEnabled(true);
    return;
  }

  setStatus("Password updated. Returning you to sign in…", "success");

  await clearCustomerSession().catch(() => {});

  window.setTimeout(() => {
    window.location.replace("/?auth=login&reset=success");
  }, 850);
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
