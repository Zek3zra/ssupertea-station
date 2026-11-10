"use strict";
const { createHash } = require("node:crypto");

function assertOrderBodySize(body, maximumBytes = 100 * 1024) {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  if (Buffer.byteLength(text, "utf8") > maximumBytes) throw Object.assign(new Error("Order request too large"), {
    code: "ORDER_REQUEST_TOO_LARGE", statusCode: 413, publicMessage: "This order request is too large. Reduce the cart and try again.",
  });
}

// Only customer choices identify a retry. Client-supplied prices never do.
function orderRequestFingerprint(input) {
  const items = input.items.map(item => ({
    product_id: item?.product_id ?? null,
    quantity: Number(item?.quantity),
    size_id: item?.size_id ?? null,
    sugar_id: item?.sugar_id ?? null,
    ice_id: item?.ice_id ?? null,
    addon_ids: Array.isArray(item?.addon_ids) ? [...item.addon_ids].sort() : [],
  }));
  return createHash("sha256").update(JSON.stringify({
    customer_name: input.customerName, customer_phone: input.customerPhone,
    order_type: input.orderType, items, delivery_address: input.deliveryAddress,
    delivery_lat: input.deliveryLatitude, delivery_lng: input.deliveryLongitude,
  })).digest("hex");
}

function assertMatchingOrder(order, fingerprint) {
  // Older orders have no fingerprint. Recovery never changes the saved order.
  if (order.request_fingerprint && order.request_fingerprint !== fingerprint) {
    const error = new Error("This checkout identifier was already used for different order details.");
    Object.assign(error, { statusCode: 409, code: "ORDER_REQUEST_MISMATCH", publicMessage: "These order details differ from the original request. Refresh and review your existing order before trying again." });
    throw error;
  }
  return order;
}

module.exports = { orderRequestFingerprint, assertMatchingOrder, assertOrderBodySize };
