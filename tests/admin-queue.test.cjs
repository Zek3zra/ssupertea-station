"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "../js/admin.js"), "utf8").replace(/^import[\s\S]*?from\s+["'][^"']+["'];\s*/gm, "");
const statuses = ["pending", "preparing", "dispatched", "completed", "cancelled"];
function node(dataset = {}) {
  return { dataset, hidden: false, disabled: false, textContent: "", attrs: {}, events: {},
    addEventListener(name, fn) { this.events[name] = fn; }, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; }, focus() { this.focused = true; } };
}
function harness() {
  const nodes = new Map(), lists = {}, storage = new Map(), alerts = [], queries = [];
  const tabs = statuses.map(s => node({ orderTab: s })), panels = statuses.map(s => node({ orderPanel: s })), counts = statuses.map(s => node({ orderCount: s }));
  const getNode = id => { if (!nodes.has(id)) nodes.set(id, node()); return nodes.get(id); };
  const db = { rpc: async () => ({ data: [], error: null }), from(table) {
    const record = { table, filters: [] }; queries.push(record);
    const q = { select() { return q; }, in(_, values) { record.filters = values; return q; }, order() { return q; }, limit(n) { record.limit = n; return q; }, then(resolve) { return Promise.resolve({ data: [], error: null }).then(resolve); } }; return q;
  } };
  const app = new Function("document", "window", "localStorage", "customerSupabase", source + `
    return { state, cacheElements, bindEvents, renderDashboard, selectOrderStatus, filterAndSortOrders, clearFinishedOrders, restoreFinishedOrders, refreshDashboard,
      configure(render){renderOrderList=render;showToast=()=>{};setStatus=()=>{};updateLastUpdated=()=>{};} };`)(
    { addEventListener() {}, getElementById: getNode, querySelectorAll(selector) { return selector === "[data-order-tab]" ? tabs : selector === "[data-order-panel]" ? panels : counts; } },
    { addEventListener() {} }, { getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v) }, db);
  app.cacheElements(); app.bindEvents(); app.configure((container, orders) => { lists[[...nodes].find(([, n]) => n === container)[0]] = orders; });
  app.state.session = { user: { id: "test-admin" } }; app.state.permissions = { can_manage_orders: true };
  app.state.orderAlert = { setPending: orders => alerts.push(orders.filter(o => o.status === "pending").map(o => o.id)) };
  return { ...app, nodes, lists, tabs, panels, counts, alerts, queries, getNode };
}
const sample = statuses.map((status, i) => ({ id: `order-${i}`, status, customer_name: "Sample " + status, customer_phone: "+639171234567", created_at: `2026-11-0${i + 1}T10:00:00Z` }));

test("All five statuses have independent queues; Finished never contains Cancelled", () => {
  const h = harness(); h.state.orders = structuredClone(sample); h.renderDashboard();
  for (const [status, list] of [["pending", "pending"], ["preparing", "preparing"], ["dispatched", "dispatched"], ["completed", "recent"], ["cancelled", "cancelled"]]) {
    assert.deepEqual(h.lists[`admin-${list}-list`].map(o => o.status), [status]);
    assert.equal(h.counts.find(n => n.dataset.orderCount === status).textContent, "1");
  }
});
test("Exactly one status panel is visible and its tab has selected/focus state", () => {
  const h = harness(); h.renderDashboard(); h.tabs[3].events.click();
  assert.equal(h.state.selectedStatus, "completed");
  assert.deepEqual(h.panels.filter(p => !p.hidden).map(p => p.dataset.orderPanel), ["completed"]);
  assert.deepEqual(h.tabs.filter(t => t.attrs["aria-selected"] === "true").map(t => t.dataset.orderTab), ["completed"]);
  assert.deepEqual(h.tabs.map(t => t.tabIndex), [-1, -1, -1, 0, -1]);
});
test("Arrow, Home and End keys navigate status tabs accessibly", () => {
  const h = harness(); let prevented = 0;
  h.tabs[0].events.keydown({ key: "ArrowLeft", preventDefault() { prevented++; } }); assert.equal(h.state.selectedStatus, "cancelled"); assert.equal(h.tabs[4].focused, true);
  h.tabs[4].events.keydown({ key: "Home", preventDefault() { prevented++; } }); assert.equal(h.state.selectedStatus, "pending");
  h.tabs[0].events.keydown({ key: "End", preventDefault() { prevented++; } }); assert.equal(h.state.selectedStatus, "cancelled"); assert.equal(prevented, 3);
});
test("Search and status selection never hide pending orders from the repeating alert", () => {
  const h = harness(); h.state.orders = structuredClone(sample); h.selectOrderStatus("cancelled");
  h.getNode("admin-order-search").events.input({ target: { value: "not found" } });
  assert.equal(h.lists["admin-pending-list"].length, 0); assert.deepEqual(h.alerts.at(-1), ["order-0"]);
  assert.equal(h.state.selectedStatus, "cancelled"); assert.equal(h.counts[0].textContent, "1");
});
test("Order search accepts names, formatted mobile numbers and order reference", () => {
  const h = harness(); h.state.orders = structuredClone(sample);
  for (const query of ["sample completed", "+63 917 123 4567", "0917 123 4567", "order-3"]) {
    h.getNode("admin-order-search").events.input({ target: { value: query } }); assert.equal(h.lists["admin-recent-list"].length, 1);
  }
});
test("Newest and oldest sorting do not change stored orders", () => {
  const h = harness(); const orders = [{ id: "early", created_at: "2026-11-01" }, { id: "late", created_at: "2026-11-09" }];
  assert.deepEqual(h.filterAndSortOrders(orders).map(o => o.id), ["late", "early"]); h.state.sortOrder = "oldest";
  assert.deepEqual(h.filterAndSortOrders(orders).map(o => o.id), ["early", "late"]); assert.deepEqual(orders.map(o => o.id), ["early", "late"]);
});
test("Clear and restore Finished and Cancelled act on their own histories only", () => {
  const h = harness(); h.state.orders = structuredClone(sample); h.renderDashboard();
  h.getNode("admin-clear-finished-button").events.click();
  assert.equal(h.lists["admin-recent-list"].length, 0); assert.equal(h.lists["admin-cancelled-list"].length, 1);
  h.getNode("admin-clear-cancelled-button").events.click();
  h.getNode("admin-restore-finished-button").events.click();
  assert.equal(h.lists["admin-recent-list"].length, 1); assert.equal(h.lists["admin-cancelled-list"].length, 0);
  h.getNode("admin-restore-cancelled-button").events.click(); assert.equal(h.lists["admin-cancelled-list"].length, 1);
  assert.deepEqual(h.state.orders, sample); assert.equal(h.queries.length, 0);
});
test("Live refresh preserves the selected status while updating its counts", () => {
  const h = harness(); h.state.orders = structuredClone(sample); h.selectOrderStatus("completed"); h.renderDashboard();
  h.state.orders.push({ ...sample[0], id: "new-pending" }); h.renderDashboard();
  assert.equal(h.state.selectedStatus, "completed"); assert.equal(h.counts[0].textContent, "2"); assert.deepEqual(h.alerts.at(-1), ["order-0", "new-pending"]);
});
test("Show more expands only its own history and search resets the page size", () => {
  const h = harness(); h.state.orders = Array.from({ length: 30 }, (_, i) => ({ ...sample[3], id: `done-${i}` })); h.renderDashboard();
  assert.equal(h.lists["admin-recent-list"].length, 12); assert.equal(h.getNode("admin-more-completed").hidden, false);
  h.getNode("admin-more-completed").events.click(); assert.equal(h.lists["admin-recent-list"].length, 24); assert.equal(h.state.historyLimits.cancelled, 12);
  h.getNode("admin-order-search").events.input({ target: { value: "Sample" } }); assert.equal(h.lists["admin-recent-list"].length, 12);
});
test("Completed and cancelled reads each have their own 100-order limit", async () => {
  const h = harness(); await h.refreshDashboard();
  for (const status of ["completed", "cancelled"]) assert.ok(h.queries.some(q => q.table === "orders" && q.filters.length === 1 && q.filters[0] === status && q.limit === 100));
  assert.ok(h.queries.some(q => q.filters.includes("pending") && q.limit === undefined));
});
