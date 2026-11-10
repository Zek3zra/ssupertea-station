import { customerSupabase, getVerifiedAccountSession, clearCustomerSession } from "/js/supabase-config.js";
import { createStaffMfaRepository, staffSecurityDestination } from "/js/staff-mfa.js";
const repository = createStaffMfaRepository(customerSupabase, getVerifiedAccountSession);
const $ = id => document.getElementById(id);
let owner = null, factorId = null, revision = 0, busy = false;
function message(text) { $("security-status").textContent = text; }
function clearSecrets() { $("security-secret").textContent = ""; $("security-qr").removeAttribute("src"); $("security-code").value = ""; $("security-setup").hidden = true; }
function setBusy(value) { busy = value; for (const control of document.querySelectorAll("button,input")) control.disabled = value; }
async function initialize() {
  const current = revision;
  try {
    const view = await repository.view();
    if (current !== revision) return;
    owner = view.userId;
    $("security-continue").href = staffSecurityDestination(new URLSearchParams(location.search).get("next"), view.permissions);
    if (view.verified) { message("Your staff session is verified."); $("security-continue").hidden = false; return; }
    factorId = view.factor?.id || null;
    if (factorId) { $("security-verify-form").hidden = false; message("Enter the current code from your authenticator app."); $("security-code").focus(); }
    else { $("security-enroll").hidden = false; message("Add an authenticator, then verify its current code."); }
  } catch (error) { if (current === revision) message(error.message); }
}
$("security-enroll").addEventListener("click", async () => {
  if (busy || !owner) return;
  const current = revision; setBusy(true); message("Preparing authenticator setup…");
  try {
    const enrollment = await repository.enroll();
    if (current !== revision || owner !== enrollment.userId) return;
    factorId = enrollment.factorId; $("security-qr").src = enrollment.qrCode; $("security-secret").textContent = enrollment.secret;
    $("security-setup").hidden = false; $("security-verify-form").hidden = false; $("security-enroll").hidden = true;
    message("Scan the QR code, then enter the 6-digit code from your authenticator."); $("security-code").focus();
  } catch (error) { if (current === revision) message(error.message); }
  finally { if (current === revision) { setBusy(false); if (!$('security-verify-form').hidden) $('security-code').focus(); } }
});
$("security-verify-form").addEventListener("submit", async event => {
  event.preventDefault(); if (busy || !owner || !factorId) return;
  const current = revision; setBusy(true); message("Verifying…");
  try {
    await repository.verify(owner, factorId, $("security-code").value.trim());
    if (current !== revision) return;
    clearSecrets(); $("security-verify-form").hidden = true; $("security-continue").hidden = false; message("Authenticator verified. Continue to your dashboard.");
  } catch (error) { if (current === revision) { $("security-code").value = ""; message(error.message); } }
  finally { if (current === revision) setBusy(false); }
});
$("security-signout").addEventListener("click", async () => { revision++; owner = null; clearSecrets(); setBusy(true); try { await clearCustomerSession(); location.replace("/?auth=login"); } catch { message("Sign-out could not finish. Try again."); setBusy(false); } });
customerSupabase.auth.onAuthStateChange((_event, session) => { if (owner && session?.user?.id !== owner) { revision++; owner = null; clearSecrets(); location.replace("/?auth=login"); } });
window.addEventListener("pagehide", () => { revision++; owner = null; clearSecrets(); });
window.addEventListener("pageshow", event => {
  if (!event.persisted) return;
  revision++; factorId = null; setBusy(false);
  $("security-enroll").hidden = true; $("security-verify-form").hidden = true; $("security-continue").hidden = true;
  message("Checking your account…"); initialize();
});
initialize();
