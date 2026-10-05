"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "../js/admin.js"), "utf8").replace(/^import[\s\S]*?from\s+["'][^"']+["'];\s*/gm, "");
function harness() {
  const snapshots = [], requests = [], nodes = new Map();
  let renders = 0;
  const node = id => { if (!nodes.has(id)) nodes.set(id, { setAttribute() {}, removeAttribute() {} }); return nodes.get(id); };
  const backend = {
    rpc: async () => ({ data: [], error: null }),
    from(table) {
      let filters = [];
      const query = { select() { return query; }, in(_, values) { filters = values; return query; }, order() { return query; }, limit() { return query; },
        then(resolve, reject) {
          return new Promise(done => requests.push({ table, filters, done })).then(resolve, reject);
        } };
      return query;
    },
  };
  const app = new Function("document", "customerSupabase", "console", source + `
    return { state, cacheElements, runOrderRpc, refreshDashboard,
      prepare(recordRender) { renderOrderList=recordRender; showToast=()=>{}; updateLastUpdated=()=>{}; setStatus=()=>{}; } };`)(
    { addEventListener() {}, getElementById: node }, backend, { error() {} }
  );
  app.cacheElements(); app.prepare(() => { renders++; }); app.state.session = { user: { id: "admin-a" } };
  app.state.orderAlert = { setPending: orders => snapshots.push(orders.filter(order => order.status === "pending").map(order => order.id)) };
  return { ...app, backend, snapshots, requests, renderCount: () => renders };
}
const flush = () => new Promise(resolve => setImmediate(resolve));
function resolveRefresh(requests, pendingOrders) {
  requests.forEach(request => request.done({ data: request.table === "orders" && request.filters.includes("pending") ? pendingOrders : [], error: null }));
}
test("Successful confirmation stops that order's alert even when refresh is unavailable", async () => {
  const h = harness(); h.state.orders = [{ id: "a", status: "pending" }, { id: "b", status: "pending" }];
  await h.runOrderRpc("admin_confirm_order", "a"); assert.deepEqual(h.snapshots.at(-1), ["b"]);
  await h.runOrderRpc("admin_confirm_order", "b"); assert.deepEqual(h.snapshots.at(-1), []);
});
test("Failed confirmation leaves pending orders eligible for repeated alerts", async () => {
  const h = harness(); h.state.orders = [{ id: "a", status: "pending" }]; h.backend.rpc = async () => ({ error: { message: "Offline" } });
  await assert.rejects(h.runOrderRpc("admin_confirm_order", "a"), /Offline/);
  assert.equal(h.state.orders[0].status, "pending"); assert.equal(h.snapshots.length, 0);
});
test("A late refresh cannot restart an alert after server confirmation", async () => {
  const h = harness(); h.state.orders = [{ id: "a", status: "pending" }]; const loading = h.refreshDashboard(); await flush();
  await h.runOrderRpc("admin_confirm_order", "a"); resolveRefresh(h.requests, [{ id: "a", status: "pending" }]); await loading;
  assert.equal(h.state.orders[0].status, "preparing"); assert.deepEqual(h.snapshots.at(-1), []);
});
test("Only the newest successful queue refresh can update notifications", async () => {
  const h = harness(); const old = h.refreshDashboard(); await flush(); const current = h.refreshDashboard(); await flush();
  resolveRefresh(h.requests.slice(3), []); await current;
  resolveRefresh(h.requests.slice(0, 3), [{ id: "old-pending", status: "pending" }]); await old;
  assert.deepEqual(h.state.orders, []); assert.deepEqual(h.snapshots.at(-1), []);
});
test("Unchanged periodic refreshes keep rider dropdowns intact while reconciling alerts", async () => {
  const h = harness(); const first = h.refreshDashboard(); await flush(); resolveRefresh(h.requests, [{ id: "a", status: "pending" }]); await first;
  const previousRenders = h.renderCount(); const next = h.refreshDashboard(); await flush(); resolveRefresh(h.requests.slice(3), [{ id: "a", status: "pending" }]); await next;
  assert.equal(h.renderCount(), previousRenders); assert.deepEqual(h.snapshots.at(-1), ["a"]);
});
