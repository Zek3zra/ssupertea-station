"use strict";
const { test } = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const { createRequire } = require("node:module"), { createHash } = require("node:crypto");
const { orderRequestFingerprint } = require("../lib/order-request.cjs");
const user = "11111111-1111-4111-8111-111111111111", id = "22222222-2222-4222-8222-222222222222";
const payload = () => ({ id, customer_name: "Test Customer", customer_phone: "09171234567", order_type: "pickup", items: [{ product_id: "test-tea", size_id: "small", quantity: 1, addon_ids: [] }] });
function harness({ saved = null, active = false, lookupFails = false, insertConflict = false, limitAllowed = true, limitFails = false } = {}) {
  const file = path.join(__dirname, "../api/create-order.js"), calls = [], orders = saved ? [structuredClone(saved)] : [];
  const reply = (data, status = 200) => ({ ok: status < 300, status, json: async () => data });
  const context = { module: { exports: {} }, require: createRequire(file), URL, URLSearchParams, console: { error() {} }, AbortController, setTimeout, clearTimeout,
    process: { env: { SUPABASE_URL: "https://test.supabase.co", SUPABASE_SECRET_KEY: "test-secret", OPENROUTESERVICE_API_KEY: "test-ors" } },
    fetch: async (url, options = {}) => {
      calls.push({ url, options });
      if (url.endsWith("/auth/v1/user")) return reply({ id: user, is_anonymous: false });
      if (url.includes("/rpc/consume_order_action")) return reply({ allowed: limitAllowed, retry_after: 30 }, limitFails ? 503 : 200);
      if (url.includes("/rpc/price_catalog_order")) return reply({ items: [{ name: "Test tea", quantity: 1 }], total_price: 39 });
      const query = new URL(url).searchParams;
      if (options.method === "POST") {
        if (insertConflict) { if (!orders.length) orders.push({ ...JSON.parse(options.body) }); return reply({}, 409); }
        const row = JSON.parse(options.body);
        if (orders.some(saved => saved.id === row.id || (saved.customer_session_token === row.customer_session_token && ["pending","preparing","dispatched"].includes(saved.status)))) return reply({},409);
        orders.push(row); return reply([row], 201);
      }
      if (lookupFails) return reply({ message: "Unavailable" }, 503);
      if (query.has("id")) return reply(orders.filter(row => `eq.${row.id}` === query.get("id") && `eq.${row.customer_session_token}` === query.get("customer_session_token")));
      return reply(active ? [{ id: "another-order", status: "preparing" }] : orders.filter(o => ["pending", "preparing", "dispatched"].includes(o.status)));
    } };
  vm.runInNewContext(fs.readFileSync(file, "utf8"), context);
  return { calls, orders, async send(body = payload()) { const result = {headers:{}}; await context.module.exports({ method: "POST", headers: { host: "shop.test", authorization: "Bearer test-customer" }, body }, { setHeader(name,value) {result.headers[name]=value;}, status(value) { result.status = value; return this; }, json(value) { result.body = value; return this; } }); return result; } };
}
test("A lost create-order response is recovered on retry, without repricing or a second insert", async () => {
  const h = harness(); const first = await h.send(); assert.equal(first.status, 201);
  h.calls.length = 0; const retry = await h.send();
  assert.equal(retry.status, 200); assert.equal(retry.body.order.id, id); assert.equal(retry.body.recovered, true); assert.equal(h.orders.length, 1);
  assert.equal(h.calls.some(c => c.url.includes("price_catalog_order") || c.options.method === "POST"), false);
});
test("The same accepted order is recoverable after completion or cancellation", async () => {
  for (const status of ["completed", "cancelled"]) {
    const h = harness({ saved: { ...payload(), status, customer_session_token: user } });
    assert.equal((await h.send()).status, 200); assert.equal(h.orders.length, 1);
  }
});
test("Reusing an accepted ID for different details is rejected without changing the saved order", async () => {
  const h = harness(); await h.send(); const result = await h.send({ ...payload(), customer_name: "Different Name" });
  assert.equal(result.status, 409); assert.equal(result.body.code, "ORDER_REQUEST_MISMATCH"); assert.equal(h.orders.length, 1);
});
test("Recovery is scoped to the verified account and cannot return another customer's order", async () => {
  const h = harness({ saved: { ...payload(), customer_session_token: "another-customer", status: "pending" }, active: true });
  const result = await h.send(); assert.equal(result.status, 409); assert.equal(result.body.order, undefined);
  assert.ok(h.calls.filter(c => c.url.includes("/orders?")).every(c => new URL(c.url).searchParams.get("customer_session_token") === `eq.${user}`));
});
test("A database lookup failure blocks checkout before pricing, routing or insertion", async () => {
  const h = harness({ lookupFails: true }); const result = await h.send();
  assert.equal(result.status, 503); assert.equal(result.body.code, "ORDER_LOOKUP_FAILED"); assert.equal(h.orders.length, 0);
});
test("A throttled checkout returns Retry-After and stops before paid routing/pricing or insertion", async () => {
  const h=harness({limitAllowed:false}), result=await h.send();
  assert.equal(result.status,429); assert.equal(result.headers['Retry-After'],'30'); assert.equal(h.orders.length,0);
  assert.equal(h.calls.some(c=>c.url.includes('price_catalog_order')||c.url.includes('/directions/')),false);
});
test("A limiter outage cannot silently permit an unprotected checkout", async () => {
  const h=harness({limitFails:true}), result=await h.send();
  assert.equal(result.status,503); assert.equal(result.body.code,'ORDER_SECURITY_UNAVAILABLE'); assert.equal(h.orders.length,0);
});
test("Oversized checkout requests are rejected before account/database/provider calls", async () => {
  const h=harness(), result=await h.send({...payload(),untrusted:'x'.repeat(110*1024)});
  assert.equal(result.status,413); assert.equal(h.calls.length,0); assert.equal(h.orders.length,0);
});
test("Concurrent inserts recover the winning order from a unique-key conflict", async () => {
  const h = harness({ insertConflict: true }); const result = await h.send(); assert.equal(result.status, 201); assert.equal(result.body.order.id, id); assert.equal(h.orders.length, 1);
});
test("Two concurrent identical submissions resolve to the same single order", async () => {
  const h=harness(), results=await Promise.all([h.send(),h.send()]);
  assert.equal(h.orders.length,1); assert.ok(results.every(r=>r.status===200||r.status===201));
  assert.ok(results.every(r=>r.body.order.id===id));
});
test("Concurrent different IDs cannot bypass the database's unfinished-order guard", async () => {
  const h=harness(), results=await Promise.all([h.send(),h.send({...payload(),id:"33333333-3333-4333-8333-333333333333"})]);
  assert.equal(h.orders.length,1); assert.equal(results.filter(r=>r.status===409&&r.body.code==="ACTIVE_ORDER_EXISTS").length,1);
});
test("Request fingerprints ignore forged client prices but distinguish customer choices", () => {
  const input = { customerName: "Test", customerPhone: "+639171234567", orderType: "pickup", items: payload().items, deliveryAddress: null, deliveryLatitude: null, deliveryLongitude: null };
  assert.equal(orderRequestFingerprint(input), orderRequestFingerprint({ ...input, items: [{ ...input.items[0], price: 1, unit_price: 999 }] }));
  assert.notEqual(orderRequestFingerprint(input), orderRequestFingerprint({ ...input, items: [{ ...input.items[0], quantity: 2 }] }));
});

const storeSource = fs.readFileSync(path.join(__dirname, "../js/checkout-attempt.js"), "utf8").replace(/^export /gm, "");
const { createCheckoutAttemptStore } = new Function(storeSource + ";return {createCheckoutAttemptStore};")();
function storeHarness(storage) { let next = 0; return createCheckoutAttemptStore({ storage: () => storage, createId: () => `attempt-${++next}`, digest: async text => createHash("sha256").update(text).digest("hex") }); }
function memoryStorage() { const map = new Map(); return { getItem: k => map.get(k) || null, setItem: (k,v) => map.set(k,v), removeItem: k => map.delete(k), map }; }
test("A checkout retry keeps its ID across page reloads and stores no raw personal data", async () => {
  const storage = memoryStorage(), first = storeHarness(storage), value = await first.idFor(payload(), user), afterReload = storeHarness(storage);
  assert.equal(await afterReload.idFor(payload(), user), value);
  assert.doesNotMatch([...storage.map.values()].join(), /Test Customer|09171234567|test-tea/);
});
test("Changed checkout details receive a new ID; a stale success cannot clear the newer attempt", async () => {
  const storage = memoryStorage(), store = storeHarness(storage), first = await store.idFor(payload(), user);
  const changed = { ...payload(), customer_name: "New name" }, second = await store.idFor(changed, user); assert.notEqual(first, second);
  store.clear(user, first); assert.equal(await store.idFor(changed, user), second);
  store.clear(user, second); assert.notEqual(await store.idFor(changed, user), second);
});
test("Checkout retries are account-scoped and work in memory if session storage is blocked", async () => {
  const store = storeHarness({ getItem() { throw Error("blocked"); }, setItem() { throw Error("blocked"); } });
  const first = await store.idFor(payload(), user); assert.equal(await store.idFor(payload(), user), first);
  assert.notEqual(await store.idFor(payload(), "different-user"), first);
});
test("A stale storage value cannot replace the in-memory retry ID when storage writes fail", async () => {
  const storage=memoryStorage(), store=storeHarness(storage); await store.idFor(payload(),user);
  storage.setItem=()=>{throw Error('quota');};
  const changed={...payload(),customer_name:'Changed cart'}, id=await store.idFor(changed,user);
  assert.equal(await store.idFor(changed,user),id);
  store.clear(user,id); assert.notEqual(await store.idFor(changed,user),id);
});
