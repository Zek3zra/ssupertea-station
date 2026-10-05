"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = name => fs.readFileSync(path.join(__dirname, "../js", name), "utf8");
const source = read("rider.js").replace(/^import[\s\S]*?from\s+["'][^"']+["'];\s*/gm, "");
class Element {
  constructor(tag = "div") { this.tag = tag; this.children = []; this.attrs = {}; this.listeners = {}; this.dataset = {}; this.hidden = false; this.open = false; this.style = { removeProperty() {} }; }
  set textContent(value) { this.text = String(value); this.children = []; }
  get textContent() { return (this.text || "") + this.children.map(child => child.textContent).join(" "); }
  append(...children) { this.children.push(...children.flatMap(child => child.tag === "fragment" ? child.children : [child])); }
  replaceChildren(...children) { this.children = []; this.text = ""; this.append(...children); }
  setAttribute(name, value) { this.attrs[name] = value; }
  addEventListener(name, handler) { (this.listeners[name] ||= []).push(handler); }
  emit(name, event = {}) { this.listeners[name]?.forEach(handler => handler({ target: this, ...event })); }
  showModal() { this.open = true; }
  close() { this.open = false; this.emit("close"); }
  getBoundingClientRect() { return { left: 20, right: 300, top: 100, bottom: 700 }; }
  all(predicate) { return this.children.flatMap(child => [...(predicate(child) ? [child] : []), ...child.all(predicate)]); }
}
function harness(storage = new Map()) {
  const elements = new Map();
  const document = { addEventListener() {}, createElement: tag => new Element(tag), createDocumentFragment: () => new Element("fragment"),
    getElementById(id) { if (!elements.has(id)) elements.set(id, new Element(id === "rider-details-dialog" ? "dialog" : "div")); return elements.get(id); } };
  const createOrderContact = new Function("document", read("order-contact.js").replace(/^export /gm, "") + "\nreturn createOrderContact;")(document);
  const bindSheetDismiss = new Function(read("sheet-dismiss.js").replace(/^export /gm, "") + "\nreturn bindSheetDismiss;")();
  const app = new Function("document", "window", "localStorage", "customerSupabase", "createOrderContact", "bindSheetDismiss", source + `
    return { state, cacheElements, bindEvents, loadClearedCompletedDeliveries, removeCompletedDelivery, clearCompletedDeliveries,
      restoreCompletedDeliveries, toggleCompletedDeliveries, renderDashboard, openDeliveryDetails, closeDeliveryDetails, handleDashboardClick, getGoogleMapsUrl,
      prepare() { showToast=()=>{}; } };`)(
    document, { addEventListener() {} }, { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    { from() { throw new Error("Clearing must not read or delete orders"); }, rpc() { throw new Error("History controls must not write orders"); } }, createOrderContact, bindSheetDismiss
  );
  app.cacheElements(); app.prepare(); app.bindEvents(); app.state.session = { user: { id: "rider-a" } };
  return { ...app, elements, storage, node: id => document.getElementById(id) };
}
const completed = {
  id: "completed-a", status: "completed", customer_name: "Sample customer", customer_phone: "+639171234567", order_type: "delivery",
  created_at: "2026-10-05T02:00:00Z", confirmed_at: "2026-10-05T02:05:00Z", total_price: 110, items_subtotal: 90, delivery_fee: 20,
  delivery_address: "Sample street", delivery_lat: 14.5, delivery_lng: 121,
  items: [{ name: "Milk Tea", quantity: 2, size_label: "Medium", sugar_label: "Less sugar", addons: [{ label: "Crushed cookies" }], unit_price: 45, line_total: 90 }]
};
const active = { ...completed, id: "active-a", status: "dispatched" };
test("Completed cards stay compact with full items, address and maps only in the modal", () => {
  const h = harness(); h.state.orders = [completed, active]; h.renderDashboard();
  const card = h.node("rider-recent-list").children[0];
  assert.match(card.textContent, /Sample customer.*Completed.*₱110.00.*More details.*Remove/);
  assert.doesNotMatch(card.textContent, /Sample street|Milk Tea/);
  assert.equal(card.all(node => node.tag === "a").length, 0);
  assert.equal(card.all(node => node.dataset.completedAction === "details")[0].attrs["aria-haspopup"], "dialog");
});
test("Removing a completed delivery preserves active deliveries and all original records", () => {
  const h = harness(); h.state.orders = structuredClone([completed, active]); h.removeCompletedDelivery(completed.id);
  assert.deepEqual(h.state.orders, [completed, active]); assert.equal(h.node("rider-recent-list").children[0].className, "rider-empty-state");
  assert.equal(h.node("rider-assigned-list").children[0].dataset.orderId, active.id);
  h.removeCompletedDelivery(active.id); assert.equal(h.state.clearedCompletedIds.has(active.id), false);
});
test("Clearing hides all loaded completed deliveries beyond the eight-card limit", () => {
  const h = harness(); h.state.orders = [...Array.from({ length: 20 }, (_, i) => ({ ...completed, id: `done-${i}` })), active];
  h.renderDashboard(); assert.equal(h.node("rider-recent-list").children.length, 8);
  h.clearCompletedDeliveries(); assert.equal(h.state.clearedCompletedIds.size, 20);
  h.state.orders.unshift({ ...completed, id: "new-completed" }); h.renderDashboard();
  assert.equal(h.node("rider-recent-list").children[0].dataset.orderId, "new-completed");
});
test("Cleared entries remain hidden after reload and are scoped to the rider account", () => {
  const first = harness(); first.state.orders = [completed]; first.clearCompletedDeliveries();
  const next = harness(first.storage); next.loadClearedCompletedDeliveries(); assert.equal(next.state.clearedCompletedIds.has(completed.id), true);
  next.state.session = { user: { id: "rider-b" } }; next.loadClearedCompletedDeliveries(); assert.equal(next.state.clearedCompletedIds.size, 0);
});
test("Show cleared restores the completed list and reverses minimization", () => {
  const h = harness(); h.state.orders = [completed]; h.clearCompletedDeliveries(); h.toggleCompletedDeliveries(); h.restoreCompletedDeliveries();
  assert.equal(h.node("rider-recent-list").children[0].dataset.orderId, completed.id); assert.equal(h.node("rider-recent-list").hidden, false);
  assert.equal(h.node("rider-restore-completed").hidden, true);
  assert.deepEqual(JSON.parse([...h.storage.values()][0]), []);
});
test("Minimizing survives live list refreshes and preserves accessible expanded state", () => {
  const h = harness(); h.state.orders = [completed]; h.toggleCompletedDeliveries(); h.renderDashboard();
  assert.equal(h.node("rider-recent-list").hidden, true); assert.equal(h.node("rider-toggle-completed").attrs["aria-expanded"], "false");
  h.toggleCompletedDeliveries(); assert.equal(h.node("rider-recent-list").hidden, false);
});
test("Malformed or blocked local preferences do not stop delivery work", () => {
  for (const saved of ["bad-json", '{"not":"an array"}', '[1,null,"valid-id"]']) {
    const h = harness(new Map([["ssupertea-rider-cleared-completed-v1:rider-a", saved]])); h.loadClearedCompletedDeliveries();
    assert.ok([...h.state.clearedCompletedIds].every(id => typeof id === "string")); h.state.orders = [completed]; h.renderDashboard();
  }
  const h = harness({ get() { throw new Error("Blocked"); }, set() { throw new Error("Blocked"); } });
  h.loadClearedCompletedDeliveries(); h.state.orders = [completed]; h.clearCompletedDeliveries(); assert.equal(h.state.clearedCompletedIds.size, 1);
});
test("More details opens the current completed order with contact, prices, extras and Google Maps", () => {
  const h = harness(); h.state.orders = [completed]; h.openDeliveryDetails(completed.id);
  assert.equal(h.node("rider-details-dialog").open, true);
  const content = h.node("rider-details-content");
  assert.match(content.textContent, /Milk Tea.*Medium.*Less sugar.*Crushed cookies.*₱45.00 each.*₱90.00 total/);
  assert.match(content.textContent, /Items subtotal.*₱90.00.*Delivery fee.*₱20.00.*Order reference.*completed-a/);
  const links = content.all(node => node.tag === "a");
  assert.equal(links.find(node => node.textContent === "Open in Google Maps").href, "https://www.google.com/maps/dir/?api=1&destination=14.5%2C121&travelmode=driving");
  assert.equal(links.find(node => node.href.startsWith("tel:")).href, "tel:+639171234567");
});
test("Modal opening ignores unknown, active or unauthenticated deliveries", () => {
  const h = harness(); h.state.orders = [completed, active]; h.openDeliveryDetails("unknown"); h.openDeliveryDetails(active.id);
  assert.equal(h.node("rider-details-dialog").open, false);
  h.state.session = null; h.openDeliveryDetails(completed.id); assert.equal(h.node("rider-details-dialog").open, false);
});
test("Closing, clearing, or losing access to the order removes modal content", () => {
  const h = harness(); h.state.orders = [completed]; h.openDeliveryDetails(completed.id); h.node("rider-details-dialog").close();
  assert.equal(h.state.detailOrderId, null); assert.equal(h.node("rider-details-content").children.length, 0);
  h.openDeliveryDetails(completed.id); h.clearCompletedDeliveries(); assert.equal(h.node("rider-details-dialog").open, false);
  h.openDeliveryDetails(completed.id); h.state.orders = []; h.renderDashboard(); assert.equal(h.node("rider-details-content").children.length, 0);
});
test("Backdrop taps dismiss the modal while inside taps leave it open", () => {
  const h = harness(); h.state.orders = [completed]; h.openDeliveryDetails(completed.id);
  const dialog = h.node("rider-details-dialog"); dialog.emit("click", { clientX: 100, clientY: 200 }); assert.equal(dialog.open, true);
  dialog.emit("click", { clientX: 5, clientY: 50 }); assert.equal(dialog.open, false);
});
test("Missing pins use the address in Maps instead of inventing a zero coordinate", () => {
  const h = harness();
  assert.match(h.getGoogleMapsUrl({ delivery_lat: null, delivery_lng: null, delivery_address: "Sample street" }), /destination=Sample%20street/);
  assert.equal(h.getGoogleMapsUrl({ delivery_lat: null, delivery_lng: null }), "");
  assert.match(h.getGoogleMapsUrl({ delivery_lat: 1000, delivery_lng: 0, delivery_address: "Sample street" }), /destination=Sample%20street/);
});
test("Customer and item strings are text rather than executable modal markup", () => {
  const h = harness(); h.state.orders = [{ ...completed, customer_name: "<img onerror=alert(1)>", items: [{ name: "<script>alert(1)</script>", quantity: 1 }] }]; h.openDeliveryDetails(completed.id);
  const content = h.node("rider-details-content"); assert.match(content.textContent, /<img onerror=alert\(1\)>/);
  assert.equal(content.all(node => node.tag === "img" || node.tag === "script").length, 0);
});
