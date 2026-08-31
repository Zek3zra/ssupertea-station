import { customerSupabase, getVerifiedAccountSession } from "/js/supabase-config.js";

const ADDRESS_FIELDS = ["address_line1", "city", "province", "landmark", "latitude", "longitude"];
const PROFILE_COLUMNS = ["id", "full_name", "mobile_number", ...ADDRESS_FIELDS, "updated_at"].join(",");
const profileState = { initialized: false, userId: null, profile: null, revision: 0, dataVersion: 0, saving: false };

export function normalizeMobileNumber(value) {
  const phone = String(value || "").trim().replace(/[\s()-]/g, "");
  if (/^09\d{9}$/.test(phone)) return "+63" + phone.slice(1);
  if (/^639\d{9}$/.test(phone)) return "+" + phone;
  if (/^\+639\d{9}$/.test(phone)) return phone;
  throw new Error("Enter a valid Philippine mobile number, such as 0917 123 4567.");
}

export function normalizeProfilePatch(value) {
  const patch = {};
  if (Object.hasOwn(value, "full_name")) {
    patch.full_name = String(value.full_name || "").trim().replace(/\s+/g, " ");
    if (patch.full_name.length < 2 || patch.full_name.length > 120) {
      throw new Error("Enter a full name between 2 and 120 characters.");
    }
  }
  if (Object.hasOwn(value, "mobile_number")) patch.mobile_number = normalizeMobileNumber(value.mobile_number);
  if (ADDRESS_FIELDS.some((field) => Object.hasOwn(value, field))) {
    if (!ADDRESS_FIELDS.every((field) => Object.hasOwn(value, field))) {
      throw new Error("Save the complete address and map pin together.");
    }
    if (ADDRESS_FIELDS.every((field) => value[field] == null)) {
      for (const field of ADDRESS_FIELDS) patch[field] = null;
    } else {
      for (const [field, min, max] of [["address_line1", 3, 180], ["city", 2, 100], ["province", 2, 100], ["landmark", 0, 120]]) {
        const text = String(value[field] || "").trim().replace(/\s+/g, " ");
        if (text.length < min || text.length > max) throw new Error(`Check the ${field.replaceAll("_", " ")} in your delivery address.`);
        patch[field] = text || null;
      }
      if (value.latitude == null || value.longitude == null || value.latitude === "" || value.longitude === "") {
        throw new Error("Choose a delivery map pin before saving your address.");
      }
      patch.latitude = Number(value.latitude);
      patch.longitude = Number(value.longitude);
      if (!Number.isFinite(patch.latitude) || !Number.isFinite(patch.longitude) || patch.latitude < 4.2 || patch.latitude > 21.5 || patch.longitude < 116 || patch.longitude > 127.5) {
        throw new Error("Choose a valid delivery point within the Philippines.");
      }
      if (formatSavedAddress(patch).length > 500) throw new Error("Keep the complete delivery address under 500 characters.");
    }
  }
  if (!Object.keys(patch).length) throw new Error("There are no profile changes to save.");
  return patch;
}

export function formatSavedAddress(profile) {
  if (!profile?.address_line1) return "";
  const address = [profile.address_line1, profile.city, profile.province].filter(Boolean).join(", ");
  return profile.landmark ? `${address} — Landmark: ${profile.landmark}` : address;
}

export function getCachedCustomerProfile(userId) {
  return userId && profileState.userId === userId && profileState.profile ? { ...profileState.profile } : null;
}

function sessionChanged() {
  const error = new Error("Your account changed. Reopen your account or checkout before continuing.");
  error.code = "PROFILE_SESSION_CHANGED";
  return error;
}

export async function loadCustomerProfile(expectedUserId) {
  const revision = profileState.revision;
  const dataVersion = profileState.dataVersion;
  const session = await getVerifiedAccountSession();
  if (!session || session.user.id !== expectedUserId || revision !== profileState.revision) throw sessionChanged();
  const { data, error } = await customerSupabase.from("profiles").select(PROFILE_COLUMNS).eq("id", expectedUserId).maybeSingle();
  if (revision !== profileState.revision) throw sessionChanged();
  if (error) throw error;
  if (dataVersion !== profileState.dataVersion) return getCachedCustomerProfile(expectedUserId);
  profileState.userId = expectedUserId;
  profileState.profile = data || null;
  return data || null;
}

export async function saveCustomerProfile(value, expectedUserId) {
  if (profileState.saving) throw new Error("Your profile is already saving. Please wait.");
  const patch = normalizeProfilePatch(value);
  const revision = profileState.revision;
  profileState.saving = true;
  try {
    const session = await getVerifiedAccountSession({ forceRefresh: true });
    if (!session || session.user.id !== expectedUserId || revision !== profileState.revision) throw sessionChanged();
    // The owner comes from the verified session, never from editable form fields.
    const { data, error } = await customerSupabase.from("profiles")
      .upsert({ id: session.user.id, ...patch }, { onConflict: "id" })
      .select(PROFILE_COLUMNS).single();
    if (revision !== profileState.revision) throw sessionChanged();
    if (error) throw error;
    profileState.dataVersion += 1;
    profileState.userId = expectedUserId;
    profileState.profile = data;
    renderProfile(data, session.user);
    window.dispatchEvent(new CustomEvent("ssupertea:profile-updated", { detail: { userId: expectedUserId } }));
    return data;
  } finally {
    profileState.saving = false;
  }
}

function clearProfile() {
  profileState.revision += 1;
  profileState.userId = null;
  profileState.profile = null;
  profileState.dataVersion += 1;
  document.getElementById("customer-profile-form")?.reset();
  const summary = document.getElementById("profile-saved-address");
  if (summary) summary.textContent = "No saved delivery address yet.";
  const remove = document.getElementById("profile-remove-address");
  if (remove) remove.hidden = true;
  setProfileEnabled(false);
  setProfileStatus("");
  window.dispatchEvent(new CustomEvent("ssupertea:profile-cleared"));
}

export function initializeCustomerProfile() {
  if (profileState.initialized) return;
  profileState.initialized = true;
  setProfileEnabled(false);
  document.getElementById("customer-profile-form")?.addEventListener("submit", saveProfileForm);
  document.getElementById("profile-retry-button")?.addEventListener("click", refreshProfileForm);
  document.getElementById("profile-remove-address")?.addEventListener("click", removeSavedAddress);
  window.addEventListener("ssupertea:account-signed-out", clearProfile);
  for (const id of ["header-profile-button", "mobile-profile-button"]) {
    document.getElementById(id)?.addEventListener("click", () => {
      if (!profileState.userId) refreshProfileForm();
    });
  }
  customerSupabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT" || (session?.user?.id && session.user.id !== profileState.userId)) {
      clearProfile();
      if (session?.user?.id) window.setTimeout(refreshProfileForm, 0);
    }
  });
  refreshProfileForm();
}

async function refreshProfileForm() {
  const revision = profileState.revision;
  setProfileEnabled(false);
  try {
    const session = await getVerifiedAccountSession();
    if (revision !== profileState.revision) return;
    if (!session) { clearProfile(); return; }
    setProfileStatus("Loading your saved details…");
    const profile = await loadCustomerProfile(session.user.id);
    if (revision !== profileState.revision) return;
    renderProfile(profile, session.user);
    setProfileStatus("");
    window.dispatchEvent(new CustomEvent("ssupertea:profile-updated", { detail: { userId: session.user.id } }));
  } catch (error) {
    if (revision !== profileState.revision) return;
    setProfileStatus("Your saved details could not be loaded. Try again before editing your profile.", true);
  }
}

function renderProfile(profile, user) {
  const name = document.getElementById("profile-full-name");
  const phone = document.getElementById("profile-mobile-number");
  if (name) name.value = profile?.full_name || user?.user_metadata?.full_name || user?.user_metadata?.name || "";
  if (phone) phone.value = profile?.mobile_number || "";
  const summary = document.getElementById("profile-saved-address");
  if (summary) summary.textContent = formatSavedAddress(profile) || "No saved delivery address yet. Select Delivery during checkout to save an address and map pin without placing an order.";
  setProfileEnabled(true);
  const remove = document.getElementById("profile-remove-address");
  if (remove) remove.hidden = !profile?.address_line1;
}

async function saveProfileForm(event) {
  event.preventDefault();
  if (profileState.saving || !profileState.userId) return;
  const revision = profileState.revision;
  const owner = profileState.userId;
  const patch = { full_name: document.getElementById("profile-full-name").value, mobile_number: document.getElementById("profile-mobile-number").value };
  setProfileEnabled(false);
  setProfileStatus("Saving your profile…");
  try {
    await saveCustomerProfile(patch, owner);
    if (revision === profileState.revision) setProfileStatus("Your name and mobile number are saved.");
  } catch (error) {
    if (revision === profileState.revision) setProfileStatus(error.message || "Your profile could not be saved. Try again.", true);
  } finally {
    if (revision === profileState.revision) setProfileEnabled(true);
  }
}

async function removeSavedAddress() {
  if (profileState.saving || !profileState.userId) return;
  if (!window.confirm("Remove your saved delivery address? Existing orders will keep their original address.")) return;
  const revision = profileState.revision;
  setProfileEnabled(false);
  try {
    await saveCustomerProfile(Object.fromEntries(ADDRESS_FIELDS.map((key) => [key, null])), profileState.userId);
    if (revision === profileState.revision) setProfileStatus("Saved address removed. Existing orders are unchanged.");
  } catch (error) {
    if (revision === profileState.revision) setProfileStatus(error.message || "The saved address could not be removed.", true);
  } finally {
    if (revision === profileState.revision) setProfileEnabled(true);
  }
}

function setProfileEnabled(enabled) {
  const fields = document.getElementById("customer-profile-fields");
  if (fields) fields.disabled = !enabled;
  const remove = document.getElementById("profile-remove-address");
  if (remove) remove.disabled = !enabled;
}

function setProfileStatus(message, error = false) {
  const status = document.getElementById("customer-profile-status");
  if (status) { status.textContent = message; status.hidden = !message; status.dataset.type = error ? "error" : "success"; }
  const retry = document.getElementById("profile-retry-button");
  if (retry) retry.hidden = !error;
}
