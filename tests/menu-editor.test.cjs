"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "../js/menu-editor-data.js"), "utf8").replace(/^export /gm, "");
const { createMenuEditorRepository, validateMenuProduct, validateMenuOption, menuItemAvailable, validateMenuPhoto } = new Function(source + ";return {createMenuEditorRepository,validateMenuProduct,validateMenuOption,menuItemAvailable,validateMenuPhoto};")();
const product = { id: "sample-tea", name: "Sample Tea", category: "Milk Tea", description: "Sample", icon: "cup", image_url: null, variant_label: "Size", active: true, customizable: true, featured: false, sort_order: 0, updated_at: "v1" };
const option = { id: "small", product_id: product.id, label: "Small", price: 39, active: true, sort_order: 0, updated_at: "v1" };
test("All 78 existing official products remain editable with their existing icons and fields", () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/menu-catalog.json"), "utf8"));
  for (const item of catalog) assert.doesNotThrow(() => validateMenuProduct(item), item.name);
  assert.equal(menuItemAvailable({ active: true }), false);
});
function harness({ permission = true, anonymous = false } = {}) {
  const tables = { menu_catalog: [structuredClone(product)], menu_catalog_variants: [structuredClone(option)], menu_catalog_addons: [], orders: [{ total_price: 39 }] };
  const calls = [], writes = [], uploads = [];
  let userId = "manager-a", version = 1, failTable = null, switchDuringPermission = false, switchAfterInsert = false, switchAfterUpload = false, uploadError = false;
  const client = { storage: { from(bucket) { return {
    async upload(path, file, options) { uploads.push({ bucket, path, file, options }); if (switchAfterUpload) userId = "manager-b"; return { error: uploadError ? { message: "Upload quota reached" } : null }; },
    getPublicUrl(path) { return { data: { publicUrl: "https://photos.test/" + path } }; }
  }; } }, async rpc() { if (switchDuringPermission) userId = "manager-b"; return { data: { active: true, can_manage_orders: permission } }; }, from(table) {
    let action = "read", payload, filters = [], single = false, limit = Infinity, start = 0, end = Infinity, columns = "";
    const q = { select(value) { columns = value; return q; }, eq(k, v) { filters.push(row => row[k] === v); return q; }, order() { return q; }, range(a, b) { start = a; end = b; return q; }, limit(value) { limit = value; return q; }, abortSignal() { return q; }, maybeSingle() { single = true; return q; }, single() { single = true; return q; }, insert(value) { action = "insert"; payload = value; return q; }, update(value) { action = "update"; payload = value; return q; }, then(resolve, reject) {
      return Promise.resolve().then(() => {
        calls.push({ table, action, payload });
        if (action !== "read" && failTable === table) return { data: null, error: { message: "Simulated write failure" } };
        let rows = tables[table].filter(row => filters.every(f => f(row)));
        if (action === "insert") { const row = { ...structuredClone(payload), updated_at: `v${++version}` }; tables[table].push(row); rows = [row]; writes.push({ table, row: structuredClone(row) }); if (switchAfterInsert) userId = "manager-b"; }
        if (action === "update") for (const row of rows) { Object.assign(row, structuredClone(payload), { updated_at: `v${++version}` }); writes.push({ table, row: structuredClone(row) }); }
        rows = rows.slice(start, Math.min(end + 1, start + limit)).map(row => {
          const result = structuredClone(row);
          if (table === "menu_catalog" && columns.includes("menu_catalog_variants(")) { result.menu_catalog_variants = structuredClone(tables.menu_catalog_variants.filter(v => v.product_id === row.id)); result.menu_catalog_addons = structuredClone(tables.menu_catalog_addons.filter(v => v.product_id === row.id)); }
          return result;
        });
        return { data: single ? rows[0] || null : rows, error: null };
      }).then(resolve, reject);
    } }; return q;
  } };
  const getSession = async () => ({ user: { id: userId, is_anonymous: anonymous } });
  return { repo: createMenuEditorRepository(client, getSession), tables, calls, writes, uploads,
    fail(table) { failTable = table; }, switchDuringPermission() { switchDuringPermission = true; }, switchAfterInsert() { switchAfterInsert = true; }, switchAfterUpload() { switchAfterUpload = true; }, failUpload() { uploadError = true; } };
}
test("Validation rejects invalid prices and unsafe image URLs; editable fields are allowlisted", () => {
  for (const price of ["", -1, "NaN", "1e3", "3.999", 100000.01]) assert.throws(() => validateMenuOption({ label: "Small", price, active: true }));
  for (const image_url of ["javascript:alert(1)", "http://photos.test/image.jpg", "//other.test/a", "/assets/../secret", "https://name:pass@photos.test/a"]) assert.throws(() => validateMenuProduct({ ...product, image_url }));
  assert.equal(validateMenuOption({ label: "Extra egg", price: "20.50", active: true }).price, 20.5);
  const clean = validateMenuProduct({ ...product, user_id: "forged", can_manage_orders: true, updated_at: "forged", image_url: "HTTPS://photos.test/a.jpg" });
  assert.equal(clean.image_url, "https://photos.test/a.jpg"); assert.equal(clean.updated_at, undefined); assert.equal(clean.can_manage_orders, undefined);
});
test("Anonymous and non-manager accounts cannot write catalog records", async () => {
  for (const settings of [{ anonymous: true }, { permission: false }]) {
    const h = harness(settings); await assert.rejects(h.repo.saveProduct(product, { ...product, active: false }));
    assert.equal(h.writes.length, 0);
  }
});
test("Changing account during the permission check prevents writes", async () => {
  const h = harness(); h.switchDuringPermission(); await assert.rejects(h.repo.saveProduct(product, product), /account changed/); assert.equal(h.writes.length, 0);
});
test("Editor reads include hidden products/options and continue beyond one API page", async () => {
  const h = harness(); h.tables.menu_catalog.push(...Array.from({ length: 500 }, (_, i) => ({ ...product, id: `hidden-${i}`, active: false })));
  h.tables.menu_catalog_variants[0].active = false;
  const result = await h.repo.load(); assert.equal(result.products.length, 501); assert.equal(result.products[0].menu_catalog_variants[0].active, false);
  assert.equal(h.calls.filter(c => c.table === "menu_catalog").length, 2);
});
test("Saving item details updates only its row and returns the new version", async () => {
  const h = harness(); h.tables.menu_catalog.push({ ...product, id: "other-item" });
  const saved = await h.repo.saveProduct(product, { ...product, name: "New Tea", active: false });
  assert.equal(saved.name, "New Tea"); assert.notEqual(saved.updated_at, product.updated_at);
  assert.equal(h.tables.menu_catalog[1].name, "Sample Tea"); assert.equal(h.writes.length, 1);
});
test("Items without an available price cannot be published", async () => {
  const h = harness(); h.tables.menu_catalog_variants[0].active = false;
  await assert.rejects(h.repo.saveProduct(product, product), /at least one available price/); assert.equal(h.writes.length, 0);
});
test("A price edit targets both product and option IDs and preserves recorded order prices", async () => {
  const h = harness(); h.tables.menu_catalog_variants.push({ ...option, product_id: "other-item" });
  await h.repo.saveOption("variants", product.id, option, { ...option, price: "45.50" });
  assert.equal(h.tables.menu_catalog_variants[0].price, 45.5); assert.equal(h.tables.menu_catalog_variants[1].price, 39);
  assert.equal(h.tables.orders[0].total_price, 39); assert.ok(h.calls.every(c => c.table !== "orders"));
});
test("Conflicting edits fail instead of overwriting another admin's update", async () => {
  const h = harness(); h.tables.menu_catalog_variants[0].updated_at = "newer-version";
  await assert.rejects(h.repo.saveOption("variants", product.id, option, { ...option, price: 55 }), /changed on another device/);
  assert.equal(h.tables.menu_catalog_variants[0].price, 39); assert.equal(h.writes.length, 0);
});
test("New items are unavailable until their price exists, then become available", async () => {
  const h = harness(); const saved = await h.repo.createProduct("new-item", product, { label: "Regular", price: 75 });
  assert.deepEqual(h.writes.map(w => [w.table, w.row.active]), [["menu_catalog", false], ["menu_catalog_variants", true], ["menu_catalog", true]]);
  assert.equal(menuItemAvailable(saved), true); assert.equal(saved.menu_catalog_variants[0].price, 75);
});
test("A failed initial price leaves an unavailable draft; retry does not duplicate it", async () => {
  const h = harness(); h.fail("menu_catalog_variants");
  await assert.rejects(h.repo.createProduct("new-item", product, { label: "Regular", price: 75 }));
  assert.equal(h.tables.menu_catalog.find(p => p.id === "new-item").active, false);
  assert.equal(h.tables.menu_catalog.find(p => p.id === "new-item").published, false);
  h.fail(null); await h.repo.createProduct("new-item", product, { label: "Regular", price: 75 });
  assert.equal(h.tables.menu_catalog.filter(p => p.id === "new-item").length, 1); assert.equal(h.tables.menu_catalog_variants.filter(v => v.product_id === "new-item").length, 1);
});
test("Retrying an already published new item never creates a duplicate", async () => {
  const h = harness(); await h.repo.createProduct("new-item", product, { label: "Regular", price: 75 }); const before = h.writes.length;
  await assert.rejects(h.repo.createProduct("new-item", product, { label: "Regular", price: 75 }), /already created/);
  assert.equal(h.writes.length, before);
});
test("Account changes after draft insertion stop subsequent writes", async () => {
  const h = harness(); h.switchAfterInsert();
  await assert.rejects(h.repo.createProduct("new-item", product, { label: "Regular", price: 75 }), /account changed/);
  assert.equal(h.writes.length, 1); assert.equal(h.writes[0].row.active, false);
});
test("Extra prices and availability save independently; repeated new-option requests reuse their ID", async () => {
  const h = harness(), draft = { label: "Extra egg", price: 20, active: true, sort_order: 0 };
  await h.repo.addOption("addons", product.id, "new-extra", draft);
  const saved = await h.repo.addOption("addons", product.id, "new-extra", { ...draft, price: 25, active: false });
  assert.equal(h.tables.menu_catalog_addons.length, 1); assert.equal(saved.price, 25); assert.equal(saved.active, false);
  assert.equal(h.tables.menu_catalog_variants[0].price, 39);
});

const photo = () => new Blob([new Uint8Array([255, 216, 255, 224, 0, 0, 0, 0, 0, 0, 0, 0])], { type: "image/jpeg" });
test("Photo upload rejects empty, oversized, SVG and disguised non-image files", async () => {
  for (const file of [new Blob([], { type: "image/jpeg" }), { type: "image/png", size: 5242881 }, new Blob(["<svg/>"], { type: "image/svg+xml" }), new Blob(["<script>bad</script>"], { type: "image/jpeg" })]) {
    const h = harness(); await assert.rejects(h.repo.uploadPhoto(file)); assert.equal(h.uploads.length, 0);
  }
  assert.equal((await validateMenuPhoto(photo())).extension, "jpg");
});
test("Only a non-anonymous manager can upload a menu photo", async () => {
  for (const settings of [{ anonymous: true }, { permission: false }]) { const h = harness(settings); await assert.rejects(h.repo.uploadPhoto(photo())); assert.equal(h.uploads.length, 0); }
});
test("Photos use a fresh owned path with no overwrite; the product changes only when saved", async () => {
  const h = harness(), url = await h.repo.uploadPhoto(photo());
  const upload = h.uploads[0];
  assert.equal(upload.bucket, "menu-photos"); assert.match(upload.path, /^menu\/manager-a\/[0-9a-f-]{36}\.jpg$/);
  assert.equal(upload.options.upsert, false); assert.equal(upload.options.contentType, "image/jpeg"); assert.equal(url, "https://photos.test/" + upload.path);
  assert.equal(h.writes.length, 0); assert.equal(h.tables.menu_catalog[0].image_url, null);
});
test("Upload errors and account changes cannot apply a photo URL to a product", async () => {
  const h = harness(); h.failUpload(); await assert.rejects(h.repo.uploadPhoto(photo()), /quota/); assert.equal(h.writes.length, 0);
  const switched = harness(); switched.switchAfterUpload(); await assert.rejects(switched.repo.uploadPhoto(photo()), /account changed/); assert.equal(switched.writes.length, 0);
});
test("Publishing and availability are independent: unavailable items can stay visible", async () => {
  const h = harness();
  const saved = await h.repo.saveProduct(product, { ...product, published: true, active: false });
  assert.equal(saved.published, true); assert.equal(saved.active, false); assert.equal(menuItemAvailable({ ...saved, menu_catalog_variants: [option] }), false);
});
test("Delete hides an item without deleting its prices, extras or order history; Restore leaves ordering disabled", async () => {
  const h = harness();
  const deleted = await h.repo.deleteProduct(product);
  assert.ok(deleted.deleted_at); assert.equal(deleted.active, false); assert.equal(deleted.published, false);
  assert.equal(h.tables.menu_catalog.length, 1); assert.equal(h.tables.menu_catalog_variants.length, 1); assert.equal(h.tables.orders[0].total_price, 39);
  await assert.rejects(h.repo.saveProduct(deleted, deleted), /Restore/);
  const restored = await h.repo.restoreProduct({ ...deleted, menu_catalog_variants: [option] });
  assert.equal(restored.deleted_at, null); assert.equal(restored.published, true); assert.equal(restored.active, false);
  assert.ok(h.calls.every(call => call.table !== "orders"));
});
test("Delete requires manager permission and a current version", async () => {
  const denied = harness({ permission: false }); await assert.rejects(denied.repo.deleteProduct(product)); assert.equal(denied.writes.length, 0);
  const changed = harness(); changed.tables.menu_catalog[0].updated_at = "changed";
  await assert.rejects(changed.repo.deleteProduct(product), /changed on another device/); assert.equal(changed.writes.length, 0);
});
