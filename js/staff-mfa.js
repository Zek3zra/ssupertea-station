export async function requiresStaffMfa(client, permissions) {
  if (permissions?.mfa_required !== true) return false;
  try {
    const { data, error } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    return Boolean(error || data?.currentLevel !== "aal2");
  } catch { return true; }
}
export function staffSecurityDestination(next, permissions) {
  if (next === "/rider.html" && permissions.can_deliver_orders) return next;
  return permissions.can_manage_orders ? "/admin.html" : "/rider.html";
}
export function createStaffMfaRepository(client, getSession) {
  async function identity(expected) {
    const session = await getSession({ forceRefresh: true });
    if (!session?.user?.id || session.user.is_anonymous || (expected && session.user.id !== expected)) throw new Error("Your account changed. Sign in again before continuing.");
    return session.user.id;
  }
  async function view() {
    const userId = await identity();
    const { data: permissions, error } = await client.rpc("get_my_staff_permissions");
    if (error || !permissions?.active || !(permissions.can_manage_orders || permissions.can_deliver_orders)) throw new Error("Sign in with an authorized staff account to continue.");
    await identity(userId);
    const { data: factors, error: factorError } = await client.auth.mfa.listFactors();
    if (factorError) throw new Error("Authenticator settings could not load. Try again.");
    const { data: assurance, error: assuranceError } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assuranceError) throw new Error("Verification status could not load. Try again.");
    await identity(userId);
    const all = factors?.all || factors?.totp || [];
    return { userId, permissions, factors: all, factor: all.find(f => f.factor_type === "totp" && f.status === "verified"), verified: assurance?.currentLevel === "aal2" };
  }
  return {
    view,
    async enroll() {
      const current = await view();
      if (current.factor) throw new Error("An authenticator is already added. Enter its current code.");
      // Restart unfinished setup only. Verified factors are never removed here.
      for (const factor of current.factors.filter(f => f.factor_type === "totp" && f.status === "unverified")) {
        await identity(current.userId);
        const { error } = await client.auth.mfa.unenroll({ factorId: factor.id });
        if (error) throw new Error("Unfinished setup could not restart. Try signing in again.");
      }
      await identity(current.userId);
      const { data, error } = await client.auth.mfa.enroll({ factorType: "totp", friendlyName: "Ssupertea staff" });
      if (error || !data?.id || !data.totp?.qr_code) throw new Error("Authenticator setup could not start. Check your connection or contact the store owner.");
      await identity(current.userId);
      const qr = data.totp.qr_code.trim();
      const qrCode = qr.startsWith("<svg") ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr)}` : qr;
      if (!/^data:image\/svg\+xml[;,]/i.test(qrCode)) throw new Error("The authenticator QR code could not be displayed safely.");
      return { userId: current.userId, factorId: data.id, qrCode, secret: data.totp.secret || "" };
    },
    async verify(userId, factorId, code) {
      if (!/^\d{6}$/.test(code || "")) throw new Error("Enter the current 6-digit code from your authenticator app.");
      await identity(userId);
      const { error } = await client.auth.mfa.challengeAndVerify({ factorId, code });
      if (error) throw new Error("The code could not be verified. Use the latest code and try again.");
      await identity(userId);
      const { data, error: levelError } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
      if (levelError || data?.currentLevel !== "aal2") throw new Error("Verification could not be confirmed. Try again.");
    },
  };
}
