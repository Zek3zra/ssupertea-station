"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const { getDeliveryLimitKm } = require("../lib/delivery-policy.cjs");
const userId = "11111111-1111-4111-8111-111111111111";
const orderId = "22222222-2222-4222-8222-222222222222";
const destination = { latitude: 10.407, longitude: 122.998 };
const orderBody = () => ({ id: orderId, customer_name: "TEST DELIVERY", customer_phone: "09171234567", order_type: "delivery", items: [{ product_id: "taro-milk-tea", quantity: 1 }], delivery_address: "Sample public shop-area test point", delivery_lat: destination.latitude, delivery_lng: destination.longitude, route_distance_m: 1, delivery_fee: 0 });
function harness(name, { distance = 3000, duration = 120, maxKm = "50" } = {}) {
  const file = path.join(__dirname, "../api", name + ".js"), calls = [], inserted = [];
  const response = (data, status = 200) => ({ ok: status < 300, status, json: async () => data });
  const context = { module: { exports: {} }, require: createRequire(file), URL, URLSearchParams, AbortController, setTimeout, clearTimeout, console: { error() {} },
    process: { env: { SUPABASE_URL: "https://test.supabase.co", SUPABASE_SECRET_KEY: "fake-server-key", OPENROUTESERVICE_API_KEY: "fake-ors-key", SSUPERTEA_SHOP_LAT: "10.406125231986707", SSUPERTEA_SHOP_LNG: "122.9977403682195", SSUPERTEA_MAX_ROUTE_KM: maxKm } },
    fetch: async (url, options = {}) => {
      calls.push({ url, options });
      if (url.endsWith("/auth/v1/user")) return response({ id: userId, is_anonymous: false });
      if (url.includes("/rpc/consume_order_action")) return response({ allowed: true });
      if (url.includes("/rpc/price_catalog_order")) return response({ items: [{ name: "Taro Milk Tea", quantity: 1, unit_price: 39 }], total_price: 39 });
      if (url.includes("/rest/v1/orders")) {
        if (options.method === "POST") { inserted.push(JSON.parse(options.body)); return response([inserted.at(-1)], 201); }
        return response([]);
      }
      if (url.includes("/directions/")) return response({ features: [{ type: "Feature", properties: { summary: { distance, duration } }, geometry: { type: "LineString", coordinates: [] } }] });
      throw Error("Unexpected network call in isolated test");
    } };
  vm.runInNewContext(fs.readFileSync(file, "utf8"), context);
  return { calls, inserted, async submit(body) { const result = {}; await context.module.exports({ method: "POST", headers: { host: "shop.test", origin: "https://shop.test", authorization: "Bearer fake-customer" }, body }, { setHeader() {}, status(code) { result.status = code; return this; }, json(payload) { result.body = payload; return this; } }); return result; } };
}

test("The delivery ceiling stays at 3 km despite old or invalid environment settings", () => {
  for (const value of [undefined, "", "invalid", "0", "-5", "50", "999"]) assert.equal(getDeliveryLimitKm(value), 3);
  assert.equal(getDeliveryLimitKm("3"), 3);
  assert.equal(getDeliveryLimitKm("2"), 2);
});
for (const distance of [2999.9, 3000, 3000.01, 3001, 50000]) {
  test(`Checkout quote and server order enforce the ${distance} m driving-route boundary`, async () => {
    const route = harness("route", { distance }), create = harness("create-order", { distance });
    const quote = await route.submit({ destination }), result = await create.submit(orderBody());
    if (distance <= 3000) {
      assert.equal(quote.status, 200); assert.equal(result.status, 201);
      assert.equal(result.body.order.delivery_fee, quote.body.summary.delivery_fee);
      assert.equal(create.inserted.length, 1);
    } else {
      assert.equal(quote.status, 422); assert.equal(result.status, 422);
      assert.equal(result.body.code, "DESTINATION_TOO_FAR"); assert.equal(quote.body.code, "DESTINATION_TOO_FAR");
      assert.match(result.body.message, /3 km.*driving route/); assert.equal(create.inserted.length, 0);
    }
  });
}
test("An outside pin is rejected before calling the route provider, even with forged client pricing", async () => {
  const outside = { latitude: 10.46, longitude: 122.998 };
  for (const name of ["route", "create-order"]) {
    const h = harness(name);
    const r = await h.submit(name === "route" ? { destination: outside } : { ...orderBody(), delivery_lat: outside.latitude, delivery_lng: outside.longitude });
    assert.equal(r.status, 422); assert.equal(h.inserted.length, 0); assert.equal(h.calls.some(c => c.url.includes("/directions/")), false);
  }
});
test("A winding road exceeding 3 km is blocked although the endpoint is inside the radius", async () => {
  const h = harness("create-order", { distance: 4800 });
  const r = await h.submit(orderBody()); assert.equal(r.status, 422); assert.equal(h.inserted.length, 0);
  assert.equal(h.calls.filter(c => c.url.includes("/directions/")).length, 1);
});
for (const distance of [300, 300.4, 301, 600.1]) {
  test(`Quote and final fee agree at ${distance} m without rounding down first`, async () => {
    const a = harness("route", { distance }), b = harness("create-order", { distance });
    const quote = await a.submit({ destination }), order = await b.submit(orderBody());
    assert.equal(order.body.order.delivery_fee, quote.body.summary.delivery_fee);
    assert.equal(order.body.order.delivery_fee, Math.ceil(distance / 300) * 10);
  });
}
test("The delivery cap does not block live tracking when a rider is more than 3 km away", async () => {
  const h = harness("route", { distance: 9000, maxKm: "3" });
  const r = await h.submit({ purpose: "tracking", origin: { latitude: 10.45, longitude: 122.998 }, destination });
  assert.equal(r.status, 200); assert.equal(r.body.summary.delivery_fee, null);
});
test("Pickup orders do not need a delivery route and never carry a delivery fee", async () => {
  const h = harness("create-order", { distance: 50000 });
  const r = await h.submit({ ...orderBody(), order_type: "pickup" });
  assert.equal(r.status, 201); assert.equal(r.body.order.delivery_fee, 0);
  assert.equal(h.calls.some(c => c.url.includes("/directions/")), false);
});
for (const distance of [null, -1, "not-a-number"]) {
  test(`Invalid provider distance ${String(distance)} cannot produce an accepted delivery`, async () => {
    for (const name of ["route", "create-order"]) {
      const h = harness(name, { distance }); const r = await h.submit(name === "route" ? { destination } : orderBody());
      assert.equal(r.status, 502); assert.equal(h.inserted.length, 0);
    }
  });
}
