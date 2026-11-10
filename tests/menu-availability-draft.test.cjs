"use strict";
const { test } = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const dataSource = fs.readFileSync(path.join(__dirname, "../js/menu-editor-data.js"), "utf8").replace(/^export /gm, "");
const { createMenuEditorRepository, createMenuAvailabilityDraft, setMenuAvailabilityDraft, menuAvailabilityChanges } = new Function(dataSource + ";return {createMenuEditorRepository,createMenuAvailabilityDraft,setMenuAvailabilityDraft,menuAvailabilityChanges};")();
const product = () => ({ id: "test-tea", name: "Test tea", active: true, updated_at: "v1", menu_catalog_variants: [
  { id: "small", active: true, price: 39, updated_at: "s1" }, { id: "large", active: true, price: 65, updated_at: "l1" }
], menu_catalog_addons: [{ id: "egg", active: true, price: 20, updated_at: "e1" }] });
function harness({ permission = true, anonymous = false, failure = false, switchDuringPermission = false, switchAfterSave = false } = {}) {
  const calls = []; let userId = "admin-a";
  const client = { async rpc(name, args) {
    calls.push({ name, args: structuredClone(args) });
    if (name === "get_my_staff_permissions") { if (switchDuringPermission) userId = "admin-b"; return { data: { active: true, can_manage_orders: permission } }; }
    if (switchAfterSave) userId = "admin-b";
    return failure ? { error: { message: "Conflict: refresh before saving.", code: "40001" } } : { data: { ...product(), active: args.p_active, updated_at: "v2" } };
  } };
  return { calls, repo: createMenuEditorRepository(client, async () => ({ user: { id: userId, is_anonymous: anonymous } })) };
}
test("Overall availability checks or clears every size and extra without changing saved data before Done", () => {
  const p = product(), original = structuredClone(p), draft = createMenuAvailabilityDraft(p);
  setMenuAvailabilityDraft(draft, false);
  assert.equal(draft.active, false); assert.equal(menuAvailabilityChanges(p, draft).changes.length, 3);
  assert.deepEqual(p, original); assert.ok(Object.values(draft.variants).every(value => value === false)); assert.equal(draft.addons.egg, false);
  setMenuAvailabilityDraft(draft, true); assert.equal(menuAvailabilityChanges(p, draft).pending, false);
});
test("One unavailable variant keeps the overall checkbox checked while another remains available", () => {
  const draft = createMenuAvailabilityDraft(product());
  setMenuAvailabilityDraft(draft, false, "variants", "small");
  assert.equal(draft.active, true); assert.equal(draft.variants.small, false); assert.equal(draft.variants.large, true);
});
test("Unchecking the last variant clears the overall checkbox and extras; checking one restores only that variant", () => {
  const draft = createMenuAvailabilityDraft(product());
  setMenuAvailabilityDraft(draft, false, "variants", "small");
  setMenuAvailabilityDraft(draft, false, "variants", "large");
  assert.equal(draft.active, false); assert.equal(draft.addons.egg, false);
  setMenuAvailabilityDraft(draft, true, "variants", "small");
  assert.equal(draft.active, true); assert.equal(draft.variants.small, true); assert.equal(draft.variants.large, false);
  assert.equal(draft.addons.egg, false);
});
test("Optional extras do not determine whether an item with available sizes is available", () => {
  const draft = createMenuAvailabilityDraft(product());
  setMenuAvailabilityDraft(draft, false, "addons", "egg");
  assert.equal(draft.active, true); assert.equal(draft.variants.small, true); assert.equal(draft.variants.large, true);
});
test("Size and extra drafts are isolated and retain their individual concurrency versions", () => {
  const p = product(), draft = createMenuAvailabilityDraft(p);
  draft.variants.small = false; draft.addons.egg = false;
  assert.deepEqual(menuAvailabilityChanges(p, draft).changes, [
    { kind: "variants", id: "small", active: false, expected_updated_at: "s1" },
    { kind: "addons", id: "egg", active: false, expected_updated_at: "e1" }
  ]);
  assert.equal(p.menu_catalog_variants[0].active, true);
  draft.variants.small = true; draft.addons.egg = true;
  assert.equal(menuAvailabilityChanges(p, draft).pending, false);
});
test("Saving a price first keeps pending availability and uses the updated price version on Done", () => {
  const p = product(), draft = createMenuAvailabilityDraft(p); draft.variants.small = false;
  Object.assign(p.menu_catalog_variants[0], { price: 45, updated_at: "s2" });
  assert.equal(menuAvailabilityChanges(p, draft).changes[0].expected_updated_at, "s2");
  assert.equal(draft.variants.small, false); assert.equal(p.menu_catalog_variants[0].active, true);
});
test("Done sends one availability-only transaction for the item, size and extra", async () => {
  const h = harness(), p = product(), draft = createMenuAvailabilityDraft(p);
  draft.active = false; draft.variants.small = false; draft.addons.egg = false;
  const saved = await h.repo.saveAvailability(p, draft), writes = h.calls.filter(c => c.name === "save_menu_availability");
  assert.equal(writes.length, 1); assert.equal(writes[0].args.p_product_id, p.id);
  assert.equal(writes[0].args.p_expected_updated_at, "v1"); assert.equal(writes[0].args.p_changes.length, 2);
  assert.doesNotMatch(JSON.stringify(writes[0].args), /price|name|orders|image_url/); assert.equal(saved.updated_at, "v2");
});
test("Done without availability changes does not write anything", async () => {
  const h = harness(), p = product(); await h.repo.saveAvailability(p, createMenuAvailabilityDraft(p));
  assert.equal(h.calls.filter(c => c.name === "save_menu_availability").length, 0);
});
test("An active item cannot be saved without an available size; pausing it allows all sizes off", async () => {
  const h = harness(), p = product(), draft = createMenuAvailabilityDraft(p);
  draft.variants.small = false; draft.variants.large = false;
  await assert.rejects(h.repo.saveAvailability(p, draft), /available size/); assert.equal(h.calls.length, 0);
  draft.active = false; await assert.doesNotReject(h.repo.saveAvailability(p, draft));
});
test("Anonymous users, customers and changed accounts never send the availability transaction", async () => {
  for (const config of [{ anonymous: true }, { permission: false }, { switchDuringPermission: true }]) {
    const h = harness(config), p = product(), draft = createMenuAvailabilityDraft(p); draft.active = false;
    await assert.rejects(h.repo.saveAvailability(p, draft)); assert.equal(h.calls.filter(c => c.name === "save_menu_availability").length, 0);
  }
});
test("Conflict errors retain checkbox drafts and leave saved product state unchanged", async () => {
  const h = harness({ failure: true }), p = product(), original = structuredClone(p), draft = createMenuAvailabilityDraft(p); draft.variants.small = false;
  await assert.rejects(h.repo.saveAvailability(p, draft), { code: "40001" });
  assert.equal(draft.variants.small, false); assert.deepEqual(p, original);
});
test("A result arriving after account switching cannot be presented as saved", async () => {
  const h = harness({ switchAfterSave: true }), p = product(), draft = createMenuAvailabilityDraft(p); draft.active = false;
  await assert.rejects(h.repo.saveAvailability(p, draft), /account changed/);
});
