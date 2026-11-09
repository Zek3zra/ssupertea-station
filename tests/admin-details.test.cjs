"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = name => fs.readFileSync(path.join(__dirname, "../js", name), "utf8");
class Element {
  constructor(tag = "div") { this.tag = tag; this.children = []; this.dataset = {}; this.attrs = {}; this.events = {}; this.style = { removeProperty() {} }; }
  set textContent(value) { this.text = String(value); this.children = []; }
  get textContent() { return (this.text || "") + this.children.map(child => child.textContent).join(" "); }
  append(...children) { this.children.push(...children.flatMap(child => child.tag === "fragment" ? child.children : [child])); }
  replaceChildren(...children) { this.children = []; this.text = ""; this.append(...children); }
  setAttribute(k, v) { this.attrs[k] = v; }
  removeAttribute(k) { delete this.attrs[k]; }
  addEventListener(name, fn) { (this.events[name] ||= []).push(fn); }
  emit(name, event = {}) { for (const fn of this.events[name] || []) fn({ target: this, ...event }); }
  showModal() { this.open = true; }
  close() { this.open = false; this.emit("close"); }
  getBoundingClientRect() { return { left: 20, right: 360, top: 100, bottom: 700 }; }
  all(predicate) { return this.children.flatMap(child => [...(predicate(child) ? [child] : []), ...child.all(predicate)]); }
}
const order = { id: "aaaaaaaa-1111-4111-8111-111111111111", status: "pending", order_type: "delivery", customer_name: "Sample customer", customer_phone: "+639171234567", items_subtotal: 90, delivery_fee: 20, total_price: 110, delivery_address: "Sample street", delivery_lat: 10.407, delivery_lng: 122.998, created_at: "2026-11-09T02:00:00Z", items: [{ name: "Taro Milk Tea", quantity: 2, size_label: "Medium", sugar_label: "Less sugar" }] };
function harness() {
  const nodes = new Map(), calls = [];
  const document = { addEventListener() {}, createElement: tag => new Element(tag), createDocumentFragment: () => new Element("fragment"), querySelectorAll: () => [],
    getElementById(id) { if (!nodes.has(id)) nodes.set(id, new Element()); return nodes.get(id); } };
  const contact = new Function("document", read("order-contact.js").replace(/^export /gm, "") + ";return createOrderContact;")(document);
  const dismiss = new Function(read("sheet-dismiss.js").replace(/^export /gm, "") + ";return bindSheetDismiss;")();
  const source = read("admin.js").replace(/^import[\s\S]*?from\s+["'][^"']+["'];\s*/gm, "");
  const app = new Function("document", "window", "createOrderContact", "bindSheetDismiss", source + `
    return { state, cacheElements, initializeOrderDetails, createOrderCard, openOrderDetails, renderOrderDetails, closeOrderDetails, handleDashboardClick,
      prepare(record){runOrderRpc=async (...args)=>record(args);refreshDashboard=async()=>{};showToast=()=>{};} };`)(document, { addEventListener() {} }, contact, dismiss);
  app.cacheElements(); app.initializeOrderDetails(); app.prepare(args => calls.push(args));
  app.state.session = { user: { id: "sample-admin" } }; app.state.permissions = { can_manage_orders: true }; app.state.orders = [structuredClone(order)];
  return { ...app, calls, node: id => document.getElementById(id) };
}
test("Admin cards are a single keyboard-accessible summary without full items, address or actions", () => {
  const h = harness(), card = h.createOrderCard(order);
  assert.equal(card.tag, "button"); assert.equal(card.attrs["aria-haspopup"], "dialog");
  assert.match(card.textContent, /Sample customer.*Delivery · 2 items.*₱110.00.*View details/);
  assert.doesNotMatch(card.textContent, /Taro|Sample street|Confirm order|63917/);
});
test("Opening a card shows contact, items, options, fees, map and existing order controls", async () => {
  const h = harness();
  await h.handleDashboardClick({ target: { closest: selector => selector === "[data-admin-details]" ? { dataset: { adminDetails: order.id } } : null } });
  assert.equal(h.node("admin-details-dialog").open, true);
  assert.match(h.node("admin-details-content").textContent, /Taro Milk Tea.*Medium.*Less sugar.*Items ₱90.00 \+ delivery ₱20.00.*Sample street.*Open map.*Confirm order/);
  assert.equal(h.calls.length, 0);
  await h.handleDashboardClick({ target: { closest: selector => selector === "[data-admin-action]" ? { dataset: { adminAction: "confirm", orderId: order.id } } : null } });
  assert.deepEqual(h.calls, [["admin_confirm_order", order.id]]);
});
test("Finished and cancelled details have no active order controls", () => {
  for (const status of ["completed", "cancelled"]) {
    const h = harness(); h.state.orders[0].status = status; h.openOrderDetails(order.id);
    assert.doesNotMatch(h.node("admin-details-content").textContent, /Confirm order|Assign rider|Complete pickup/);
  }
});
test("Unchanged updates preserve modal controls; changed order status updates the open details", () => {
  const h = harness(); h.openOrderDetails(order.id); const card = h.node("admin-details-content").children[0];
  h.renderOrderDetails(); assert.equal(h.node("admin-details-content").children[0], card);
  h.state.orders[0].status = "completed"; h.renderOrderDetails();
  assert.equal(h.node("admin-details-dialog").open, true);
  assert.doesNotMatch(h.node("admin-details-content").textContent, /Confirm order/);
});
test("Done, outside tap and native Escape closure clear the modal; inside taps keep it open", () => {
  const h = harness(), dialog = h.node("admin-details-dialog");
  h.openOrderDetails(order.id); dialog.emit("click", { clientX: 100, clientY: 200 }); assert.equal(dialog.open, true);
  dialog.emit("click", { clientX: 0, clientY: 0 }); assert.equal(dialog.open, false); assert.equal(h.state.detailOrderId, null);
  h.openOrderDetails(order.id); h.node("admin-details-done").emit("click"); assert.equal(dialog.open, false);
  h.openOrderDetails(order.id); dialog.close(); assert.equal(h.node("admin-details-content").children.length, 0);
});
test("The Admin/Rider switch keeps the current mode visible and hides unpermitted modes", () => {
  const fn = read("final-polish.js").match(/function applyStaffModeSwitch\(\) \{[\s\S]*?\n\}/)[0];
  for (const current of ["admin", "rider"]) {
    const links = { "admin-mode-link": new Element("a"), "rider-mode-link": new Element("a") };
    const body = { dataset: { canManageOrders: "true", canDeliverOrders: "true" } };
    const apply = new Function("document", "isAdminPage", "isRiderPage", fn + ";return applyStaffModeSwitch;")({ body, getElementById: id => links[id] }, () => current === "admin", () => current === "rider");
    apply(); assert.equal(links[`${current}-mode-link`].attrs["aria-current"], "page");
    assert.equal(links["admin-mode-link"].hidden, false); assert.equal(links["rider-mode-link"].hidden, false);
    body.dataset.canDeliverOrders = "false"; apply(); assert.equal(links["rider-mode-link"].hidden, true);
  }
});
