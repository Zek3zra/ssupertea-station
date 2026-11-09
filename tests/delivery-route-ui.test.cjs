"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "../js/app.js"), "utf8");
const requestCode = source.slice(source.indexOf("async function requestDeliveryRoute("), source.indexOf("\nfunction drawDeliveryRoute("));
const errorCode = source.slice(source.indexOf("function getRouteErrorMessage("), source.indexOf("\nfunction formatRouteDistance("));
function harness() {
  const pending = [], summaries = [], state = { checkout: { routeRequestId: 0, routeReady: true, deliveryFee: 20 } }, elements = { "open-google-maps-link": {} };
  let clears = 0, drawings = 0;
  const request = new Function("state", "elements", "fetch", "OPENSTREETMAP_CONFIG", "AbortController", "navigator", "console", "removeRouteLayers", "renderCheckoutSummary", "setRouteSummary", "drawDeliveryRoute", "createGoogleMapsDirectionsLink", requestCode + errorCode + "\nreturn requestDeliveryRoute;")(
    state, elements, () => new Promise(resolve => pending.push(resolve)), { routing: { endpoint: "/api/route" } }, AbortController, { onLine: true }, { error() {} },
    () => { clears++; }, () => {}, s => summaries.push(s), () => { drawings++; }, () => "https://www.google.com/maps/");
  const finish = (index, { distance = 1600, duration = 120, status = 200, code, message } = {}) => pending[index]({ ok: status === 200, status, json: async () => ({ code, message, shop: { latitude: 10.406, longitude: 122.997 }, summary: { distance, duration, delivery_fee: 60 } }) });
  return { state, summaries, request, finish, clears: () => clears, drawings: () => drawings };
}
test("Moving a pin immediately clears the previous fee/route and waits for a new quote", async () => {
  const h = harness(), request = h.request(10.407, 122.998);
  assert.equal(h.state.checkout.routeReady, false); assert.equal(h.state.checkout.deliveryFee, 0); assert.equal(h.clears(), 1);
  h.finish(0); await request; assert.equal(h.state.checkout.routeReady, true); assert.equal(h.drawings(), 1);
});
test("An outside-range API rejection keeps delivery blocked and offers pickup", async () => {
  const h = harness(), request = h.request(10.407, 122.998);
  h.finish(0, { status: 422, code: "DESTINATION_TOO_FAR", message: "Delivery is available within 3 km by driving route. Choose pickup." }); await request;
  assert.equal(h.state.checkout.routeReady, false); assert.equal(h.state.checkout.deliveryFee, 0); assert.equal(h.drawings(), 0);
  assert.match(h.summaries.at(-1).status, /3 km.*pickup/);
});
test("A late old quote cannot re-enable ordering after a newer pin was rejected", async () => {
  const h = harness(), old = h.request(10.407, 122.998), current = h.request(10.42, 122.998);
  h.finish(1, { status: 422, code: "DESTINATION_TOO_FAR", message: "Outside 3 km. Choose pickup." }); await current;
  h.finish(0); await old; assert.equal(h.state.checkout.routeReady, false); assert.equal(h.drawings(), 0);
});
test("The UI also rejects an over-3-km response from an older server", async () => {
  const h = harness(), request = h.request(10.407, 122.998); h.finish(0, { distance: 3000.01 }); await request;
  assert.equal(h.state.checkout.routeReady, false); assert.equal(h.drawings(), 0); assert.match(h.summaries.at(-1).status, /3 km/);
});
