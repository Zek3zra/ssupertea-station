"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "../js/live-gps.js"), "utf8")
  .replace(/^import[\s\S]*?from\s+["'][^"']+["'];\s*/gm, "")
  .replace(/start\(\)\.catch\([\s\S]*?\n\}\);/, "");

function harness() {
  const button = { hidden: true, disabled: false, setAttribute() {} };
  const text = { textContent: "" }, dot = { dataset: {} };
  const panel = { querySelector: selector => selector === ".live-gps-dot" ? dot : text };
  const watches = [], cleared = [], writes = [];
  const fixture = { assignments: [{ order_id: "delivery-a" }], orders: [{ id: "delivery-a", status: "dispatched" }], error: null };
  const query = table => {
    const chain = { select() { return chain; }, eq() { return chain; }, in() { return chain; }, order() { return chain; },
      then(resolve, reject) { return Promise.resolve({ data: table === "orders" ? fixture.orders : fixture.assignments, error: fixture.error }).then(resolve, reject); } };
    return chain;
  };
  const backend = { from: query, rpc: async (name, params) => { writes.push({ name, params }); return { data: { updated_at: new Date().toISOString() }, error: null }; } };
  const navigator = { geolocation: { watchPosition(success, error, options) { watches.push({ success, error, options }); return watches.length; }, clearWatch: id => cleared.push(id) } };
  const window = { location: { pathname: "/rider.html" }, clearTimeout() {}, clearInterval() {} };
  const app = new Function("document", "window", "navigator", "customerSupabase", "getVerifiedAccountSession", "console", source + `
    return { state, retryRiderGps, syncRiderDispatchedOrder, startLocationWatch, stopLocationWatch, refreshVisibleAges, cleanup };`)(
    { querySelector: selector => selector === "[data-enable-rider-gps]" ? button : selector === "[data-live-gps-rider]" ? panel : null },
    window, navigator, backend, async () => ({ user: { id: "rider-a" } }), { warn() {} }
  );
  app.state.session = { user: { id: "rider-a" } };
  return { ...app, button, text, dot, watches, cleared, writes, fixture, backend, navigator };
}
const fix = { coords: { latitude: 14.5, longitude: 121.0, accuracy: 10 } };

test("Permission failure keeps an actionable Enable GPS button", () => {
  const h = harness(); h.startLocationWatch("delivery-a"); h.watches[0].error({ code: 1 });
  assert.equal(h.button.hidden, false); assert.equal(h.button.disabled, false);
  assert.match(h.text.textContent, /browser settings/);
});
test("Retry rechecks assignments, clears the previous watch and requests high accuracy", async () => {
  const h = harness(); h.startLocationWatch("delivery-a"); h.watches[0].error({ code: 2 });
  await h.retryRiderGps();
  assert.deepEqual(h.cleared, [1]); assert.equal(h.watches.length, 2);
  assert.equal(h.watches[1].options.enableHighAccuracy, true);
  await h.watches[1].success(fix);
  assert.equal(h.writes[0].name, "rider_update_delivery_location");
  assert.equal(h.writes[0].params.p_order_id, "delivery-a");
  assert.equal(h.dot.dataset.gpsState, "live"); assert.equal(h.button.hidden, true);
});
test("Simultaneous retry taps do not create duplicate watchers", async () => {
  const h = harness(); await Promise.all([h.retryRiderGps(), h.retryRiderGps()]); assert.equal(h.watches.length, 1);
});
test("No assignment or a delivery still at the shop cannot enable GPS sharing", async () => {
  const h = harness(); h.fixture.assignments = []; await h.retryRiderGps(); assert.equal(h.watches.length, 0);
  h.fixture.assignments = [{ order_id: "delivery-a" }]; h.fixture.orders = [{ id: "delivery-a", status: "preparing" }];
  await h.retryRiderGps(); assert.equal(h.watches.length, 0); assert.equal(h.button.hidden, true);
});
test("Location callbacks from a stopped delivery cannot write to a new delivery", async () => {
  const h = harness(); h.startLocationWatch("delivery-a"); h.startLocationWatch("delivery-b");
  await h.watches[0].success(fix); h.watches[0].error({ code: 1 });
  assert.equal(h.writes.length, 0); assert.equal(h.state.riderOrderId, "delivery-b"); assert.equal(h.dot.dataset.gpsState, "waiting");
});
test("A late GPS response cannot overwrite a newer watch or error", async () => {
  const h = harness(); let resolve;
  h.backend.rpc = () => new Promise(done => { resolve = done; });
  h.startLocationWatch("delivery-a"); const oldWrite = h.watches[0].success(fix);
  h.startLocationWatch("delivery-b"); h.watches[1].error({ code: 2 });
  resolve({ data: {}, error: null }); await oldWrite;
  assert.equal(h.state.lastSent, null); assert.equal(h.dot.dataset.gpsState, "error");
});
test("Age refresh never hides a GPS error and offers recovery when updates become stale", async () => {
  const h = harness(); h.startLocationWatch("delivery-a"); await h.watches[0].success(fix);
  h.watches[0].error({ code: 3 }); h.refreshVisibleAges(); assert.equal(h.dot.dataset.gpsState, "error");
  h.state.gpsStatus = "live"; h.state.lastSent.sentAt = Date.now() - 80_000; h.refreshVisibleAges();
  assert.equal(h.dot.dataset.gpsState, "stale"); assert.equal(h.button.hidden, false);
});
test("Completing or removing the active delivery stops its GPS watch", async () => {
  const h = harness(); h.startLocationWatch("delivery-a"); h.fixture.orders = [];
  await h.syncRiderDispatchedOrder(); assert.equal(h.state.watchId, null); assert.equal(h.state.riderOrderId, null); assert.deepEqual(h.cleared, [1]);
});
test("GPS and database errors recover without falsely showing live sharing", async () => {
  const h = harness(); delete h.navigator.geolocation; await h.retryRiderGps();
  assert.match(h.text.textContent, /does not support/); assert.equal(h.button.hidden, false);
  h.fixture.error = { message: "Network failure" }; await h.retryRiderGps();
  assert.match(h.text.textContent, /Unable to check/); assert.equal(h.button.disabled, false);
});
test("Failed writes show recovery and GPS writes retain the existing throttle", async () => {
  const h = harness(); h.startLocationWatch("delivery-a"); await h.watches[0].success(fix); await h.watches[0].success(fix);
  assert.equal(h.writes.length, 1);
  h.state.lastSent.sentAt = Date.now() - 16_000;
  h.backend.rpc = async () => ({ error: { message: "Network failure" } });
  await h.watches[0].success(fix); h.refreshVisibleAges(); assert.equal(h.dot.dataset.gpsState, "error"); assert.equal(h.button.hidden, false);
});
