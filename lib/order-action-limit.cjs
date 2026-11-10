"use strict";
function unavailable() {
  return Object.assign(new Error("Order security checks unavailable"), { code: "ORDER_SECURITY_UNAVAILABLE", statusCode: 503, publicMessage: "Order checks are temporarily unavailable. Wait briefly and try again." });
}
async function enforceOrderActionLimit(configuration, userId, action, fetchRequest) {
  const headers = { apikey: configuration.serverKey, "Content-Type": "application/json" };
  if (configuration.serverKey.startsWith("eyJ")) headers.Authorization = `Bearer ${configuration.serverKey}`;
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetchRequest(`${configuration.supabaseUrl}/rest/v1/rpc/consume_order_action`, {
      method: "POST", headers, signal: controller.signal, body: JSON.stringify({ p_user_id: userId, p_action: action }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || typeof data?.allowed !== "boolean") throw unavailable();
    if (!data.allowed) throw Object.assign(new Error("Order action rate limited"), { code: "ORDER_RATE_LIMITED", statusCode: 429,
      publicMessage: "Too many order attempts. Wait a minute before trying again. Your cart is still saved.", retryAfter: Math.max(1, Math.min(60, Number(data.retry_after) || 60)) });
  } catch (error) { if (error.code === "ORDER_RATE_LIMITED" || error.code === "ORDER_SECURITY_UNAVAILABLE") throw error; throw unavailable(); }
  finally { clearTimeout(timeout); }
}
module.exports = { enforceOrderActionLimit };
