"use strict";
const { test } = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const read = name => fs.readFileSync(path.join(__dirname, "../js", name), "utf8");
const helpersPromise = import("data:text/javascript;base64," + Buffer.from(read("catalog.js")).toString("base64"));
const row = { id: "sample-drink", name: "Sample Drink", category: "Drinks", active: false, published: true, menu_catalog_variants: [{ id: "small", label: "Small", price: 45, active: true }] };
async function harness(rows = [row]) {
  const helpers = await helpersPromise, toasts = [], filters = [];
  const query = { select() { return query; }, eq(key, value) { filters.push([key, value]); return query; }, is(key, value) { filters.push([key, value]); return query; }, order() { return query; }, abortSignal() { return Promise.resolve({ data: rows.filter(r => filters.every(([k,v]) => v === null ? r[k] == null : r[k] === v)) }); } };
  const args = { ...helpers, customerSupabase: { from() { return query; } }, document: { addEventListener() {} }, localStorage: { getItem: () => null }, console: { warn() {} } };
  const app = new Function(...Object.keys(args), read("app.js").replace(/^import[\s\S]*?from\s+["'][^"']+["'];\s*/gm, "") + `
    return { state, createProductCard, openCustomizeDialog, handleCustomizeSubmit, normalizeStoredCartItem, loadMenuCatalog,
      setMenu(items) { MENU_ITEMS=items; state.selectedProductId=items[0]?.id; }, getMenu(){return MENU_ITEMS;},
      configure(log) {showToast=log;renderMenu=()=>{};renderCategories=()=>{};renderCart=()=>{};elements['customize-form']={reportValidity:()=>true};} };`)(...Object.values(args));
  app.configure(t => toasts.push(t));
  return { ...app, helpers, toasts, filters };
}
test("Unavailable products retain their information and price but cannot be priced for a cart", async () => {
  const h = await harness(), product = h.helpers.normalizeCatalogProduct(row);
  assert.equal(product.name, row.name); assert.equal(product.basePrice, 45); assert.equal(product.available, false);
  assert.throws(() => h.helpers.calculateCatalogPrice(product, { sizeId: "small" }), /unavailable/);
});
test("Unavailable cards show a visible label and a disabled order button", async () => {
  const h = await harness(), html = h.createProductCard(h.helpers.normalizeCatalogProduct(row));
  assert.match(html, /is-unavailable/); assert.match(html, /unavailable-badge.*Unavailable/);
  assert.match(html, /disabled aria-disabled="true"/); assert.match(html, /₱45.00/);
});
test("Direct customization, submit and saved-cart restoration cannot bypass unavailability", async () => {
  const h = await harness(), product = h.helpers.normalizeCatalogProduct(row); h.setMenu([product]);
  h.openCustomizeDialog(product.id); h.handleCustomizeSubmit({ preventDefault() {} });
  assert.equal(h.toasts.length, 2); assert.equal(h.state.cart.length, 0);
  assert.equal(h.normalizeStoredCartItem({ productId: product.id, size: { id: "small" }, quantity: 1 }), null);
});
test("Products without available options stay visible without inventing a zero price; hidden items cannot be ordered", async () => {
  const h = await harness(), empty = h.helpers.normalizeCatalogProduct({ ...row, active: true, menu_catalog_variants: [] });
  assert.equal(empty.available, false); assert.equal(empty.basePrice, null);
  assert.doesNotMatch(h.createProductCard(empty), /₱0\.00/);
  assert.equal(h.helpers.normalizeCatalogProduct({ ...row, active: true, published: false }).available, false);
});
test("Catalog loading includes visible unavailable items and filters out hidden drafts", async () => {
  const h = await harness([row, { ...row, id: "ready", active: true }, { ...row, id: "draft", published: false }, { ...row, id: "deleted", active: true, deleted_at: "2026-11-10T00:00:00Z" }]);
  await h.loadMenuCatalog();
  assert.equal(h.state.catalogStatus, "ready"); assert.deepEqual(h.getMenu().map(item => item.id), ["sample-drink", "ready"]);
  assert.deepEqual(h.filters, [["published", true], ["deleted_at", null]]);
});
