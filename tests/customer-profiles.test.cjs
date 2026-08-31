"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const tests = [];
const test = (name, run) => tests.push({ name, run });
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
function compile(file, context, names) {
  const source = read(file).replace(/^import[\s\S]*?from\s+["'][^"']+["'];\s*/gm, "").replace(/^export /gm, "");
  return new Function(...Object.keys(context), source + "\nreturn {" + names + "};")(...Object.values(context));
}
class Element {
  constructor() { this.value = ""; this.textContent = ""; this.children = []; this.dataset = {}; this.hidden = false; this.disabled = false; this.listeners = {}; }
  append(...children) { this.children.push(...children); }
  setAttribute(key, value) { this[key] = value; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  reset() {}
}
function profileHarness() {
  const elements = new Map();
  const events = [];
  const authListeners = [];
  const calls = [];
  let session = { user: { id: "customer-a", user_metadata: { full_name: "Alice Customer" } } };
  let verify = async () => session;
  let query = async request => ({ data: request.patch ? { id: request.patch.id, ...request.patch } : { id: request.owner, full_name: "Alice Customer" } });
  const document = { getElementById(id) { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); } };
  const feature = compile("js/customer-profile.js", {
    document,
    window: { addEventListener() {}, dispatchEvent: event => events.push(event), setTimeout: fn => Promise.resolve().then(fn), confirm: () => true },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    getVerifiedAccountSession: () => verify(),
    customerSupabase: {
      auth: { onAuthStateChange: fn => authListeners.push(fn) },
      from(table) {
        const request = { table };
        return {
          select() { return this; },
          eq(column, owner) { request.filter = column; request.owner = owner; return this; },
          upsert(patch) { request.patch = patch; return this; },
          maybeSingle() { calls.push(request); return query(request); },
          single() { calls.push(request); return query(request); },
        };
      },
    },
  }, "normalizeMobileNumber, normalizeProfilePatch, formatSavedAddress, loadCustomerProfile, saveCustomerProfile, getCachedCustomerProfile, clearProfile, initializeCustomerProfile, profileState");
  return { ...feature, elements, calls, events, setQuery: fn => { query = fn; }, setVerify: fn => { verify = fn; }, setSession: value => { session = value; }, emitAuth: (event, value) => authListeners.forEach(fn => fn(event, value)) };
}
const address = { address_line1: "House 14, Purok 3", city: "La Carlota City", province: "Negros Occidental", landmark: "Blue gate", latitude: 10.42, longitude: 122.92 };

test("Mobile numbers normalize to one callable Philippine format", () => {
  const h = profileHarness();
  for (const input of ["0917 123 4567", "+63 (917) 123-4567", "639171234567"]) assert.equal(h.normalizeMobileNumber(input), "+639171234567");
  for (const input of ["", "12345", "091712345678", "tel:+639171234567", "<script>", "+12025550123"]) assert.throws(() => h.normalizeMobileNumber(input));
});
test("Profile edits cannot include identity or staff permissions", () => {
  const h = profileHarness();
  assert.deepEqual(h.normalizeProfilePatch({ id: "other-user", full_name: "  Alice   Customer ", mobile_number: "09171234567", can_manage_orders: true }), { full_name: "Alice Customer", mobile_number: "+639171234567" });
});
test("Saved addresses require a complete address and valid map pin", () => {
  const h = profileHarness();
  assert.equal(h.normalizeProfilePatch(address).latitude, 10.42);
  for (const patch of [{ ...address, latitude: null }, { ...address, latitude: "" }, { ...address, latitude: NaN }, { ...address, longitude: 0 }, { ...address, city: "" }, { address_line1: "Incomplete" }]) assert.throws(() => h.normalizeProfilePatch(patch));
  assert.throws(() => h.normalizeProfilePatch({ full_name: "A" }));
});
test("Removing a saved address clears every address field together", () => {
  const h = profileHarness();
  const cleared = Object.fromEntries(Object.keys(address).map(key => [key, null]));
  assert.deepEqual(h.normalizeProfilePatch(cleared), cleared);
});
test("Profile reads explicitly filter by the current account", async () => {
  const h = profileHarness();
  await h.loadCustomerProfile("customer-a");
  assert.equal(h.calls[0].filter, "id");
  assert.equal(h.calls[0].owner, "customer-a");
  assert.equal(h.getCachedCustomerProfile("customer-b"), null);
});
test("Saving contact details preserves address fields by sending a partial update", async () => {
  const h = profileHarness();
  await h.saveCustomerProfile({ full_name: "Alice Customer", mobile_number: "09171234567", id: "customer-b" }, "customer-a");
  assert.deepEqual(h.calls[0].patch, { id: "customer-a", full_name: "Alice Customer", mobile_number: "+639171234567" });
});
test("Changing account before a save blocks the database request", async () => {
  const h = profileHarness();
  h.setSession({ user: { id: "customer-b" } });
  await assert.rejects(h.saveCustomerProfile({ full_name: "Alice Customer" }, "customer-a"), /account changed/i);
  assert.equal(h.calls.length, 0);
});
test("Sign-out discards a profile read already in flight", async () => {
  const h = profileHarness(), pending = deferred();
  h.setQuery(() => pending.promise);
  const loading = h.loadCustomerProfile("customer-a");
  await flush();
  h.clearProfile();
  pending.resolve({ data: { id: "customer-a", mobile_number: "+639171234567" } });
  await assert.rejects(loading, /account changed/i);
  assert.equal(h.getCachedCustomerProfile("customer-a"), null);
});
test("Sign-out discards a save response without restoring private fields", async () => {
  const h = profileHarness(), pending = deferred();
  h.setQuery(() => pending.promise);
  const saving = h.saveCustomerProfile({ full_name: "Alice Customer" }, "customer-a");
  await flush();
  h.clearProfile();
  pending.resolve({ data: { id: "customer-a", full_name: "Alice Customer" } });
  await assert.rejects(saving, /account changed/i);
  assert.equal(h.getCachedCustomerProfile("customer-a"), null);
  assert.equal(h.events.filter(e => e.type === "ssupertea:profile-updated").length, 0);
});
test("Duplicate profile saves are blocked and a failed save can be retried", async () => {
  const h = profileHarness(), pending = deferred();
  h.setQuery(() => pending.promise);
  const saving = h.saveCustomerProfile({ full_name: "Alice Customer" }, "customer-a");
  await assert.rejects(h.saveCustomerProfile({ full_name: "Alice Customer" }, "customer-a"), /already saving/);
  pending.resolve({ error: new Error("Network unavailable") });
  await assert.rejects(saving, /Network unavailable/);
  h.setQuery(async request => ({ data: request.patch }));
  await h.saveCustomerProfile({ full_name: "Alice Customer" }, "customer-a");
  assert.equal(h.calls.length, 2);
});
test("An older profile read cannot overwrite a completed save", async () => {
  const h = profileHarness(), pending = deferred();
  h.setQuery(request => request.patch ? Promise.resolve({ data: request.patch }) : pending.promise);
  const loading = h.loadCustomerProfile("customer-a");
  await flush();
  await h.saveCustomerProfile({ full_name: "Updated Customer" }, "customer-a");
  pending.resolve({ data: { id: "customer-a", full_name: "Old Customer" } });
  assert.equal((await loading).full_name, "Updated Customer");
  assert.equal(h.getCachedCustomerProfile("customer-a").full_name, "Updated Customer");
});

function checkoutHarness() {
  let session = { user: { id: "customer-a", user_metadata: { full_name: "Old account name" } } };
  let profile = { id: "customer-a", full_name: "Alice Customer", mobile_number: "+639171234567", ...address };
  let load = async () => profile;
  let map = async () => {};
  let orderType = "pickup";
  const selected = [], submitted = [];
  const nodes = {};
  function node(id) {
    if (!nodes[id]) {
      nodes[id] = new Element();
      nodes[id].classList = { add() {}, remove() {}, toggle() {}, contains: () => false };
      nodes[id].querySelector = () => ({ value: orderType });
      nodes[id].close = () => { nodes[id].open = false; };
      nodes[id].checkValidity = () => true;
      nodes[id].reportValidity = () => true;
      nodes[id].setCustomValidity = () => {};
      nodes[id].focus = () => {};
    }
    return nodes[id];
  }
  const h = compile("js/app.js", {
    customerSupabase: {},
    ensureCustomerAccount: async () => session,
    ensureCustomerSession: async () => session,
    getVerifiedAccountSession: async () => session,
    getActiveOrderForCurrentAccount: async () => null,
    loadCustomerProfile: id => load(id),
    getCachedCustomerProfile: id => profile?.id === id ? profile : null,
    normalizeMobileNumber: profileHarness().normalizeMobileNumber,
    normalizeProfilePatch: profileHarness().normalizeProfilePatch,
    formatSavedAddress: profileHarness().formatSavedAddress,
    saveCustomerProfile: async patch => { profile = { ...profile, ...patch }; return profile; },
    OPENSTREETMAP_CONFIG: {},
    document: { addEventListener() {}, getElementById: node, body: { classList: { add() {}, remove() {} } } },
    window: { addEventListener() {}, setTimeout() {}, dispatchEvent() {}, location: { origin: "https://shop.example", pathname: "/" } },
    localStorage: { getItem: () => null, removeItem() {}, setItem() {} },
    navigator: { onLine: true },
    requestAnimationFrame: fn => fn(),
    crypto: require("node:crypto").webcrypto,
    CustomEvent: class {},
    console: { error() {}, warn() {} },
    fetch: async () => { throw new Error("Unexpected fetch"); },
  }, `state, elements, handleCheckoutRequest, clearCheckoutCustomer, useSavedDeliveryAddress, handleCheckoutSubmit, createOrderWithSessionRecovery,
    configure(hooks) {
      renderCheckoutSummary = () => {};
      openCheckoutDialog = () => { elements['checkout-dialog'].open = true; };
      clearSelectedDeliveryLocation = () => { state.checkout.selectedLocation = null; elements['address-city'].value = ''; elements['address-province'].value = ''; };
      showDeliveryMap = hooks.map;
      selectDeliveryLocation = hooks.select;
      showToast = () => {};
      createOrderViaServer = hooks.submit;
      showOrderConfirmation = hooks.confirm;
      startOrderTracking = () => {};
      renderCart = () => {};
      closeCheckoutDialog = () => {};
      setCheckoutSubmitting = value => { state.checkout.isSubmitting = value; };
    }`);
  for (const id of ["customer-name", "customer-phone", "address-line1", "address-landmark", "address-city", "address-province", "checkout-dialog", "checkout-form", "checkout-profile-status", "checkout-saved-address", "save-checkout-contact", "save-delivery-address", "use-saved-address", "checkout-submit-button"]) h.elements[id] = node(id);
  h.state.cart = [{ productId: "classic-milk-tea", quantity: 1, unitPrice: 80, size: { id: "medium" }, sugar: { id: "50" }, ice: { id: "regular-ice" }, addons: [] }];
  const confirmations = [];
  let submit = async payload => ({ ...payload, total_price: 80, status: "pending" });
  h.configure({ map: () => map(), select: (...args) => selected.push(args), submit: async payload => { submitted.push(payload); return submit(payload); }, confirm: order => confirmations.push(order) });
  return { ...h, selected, submitted, confirmations, node, setSession: value => { session = value; }, setLoad: fn => { load = fn; }, setMap: fn => { map = fn; }, setOrderType: value => { orderType = value; }, setSubmit: fn => { submit = fn; } };
}
test("Checkout prefills account details and keeps customer edits on reopen", async () => {
  const h = checkoutHarness();
  await h.handleCheckoutRequest();
  assert.equal(h.node("customer-name").value, "Alice Customer");
  assert.equal(h.node("customer-phone").value, "+639171234567");
  h.node("customer-name").value = "Different recipient";
  await h.handleCheckoutRequest();
  assert.equal(h.node("customer-name").value, "Different recipient");
});
test("Checkout clears contact and address on account changes", async () => {
  const h = checkoutHarness();
  await h.handleCheckoutRequest();
  h.node("address-line1").value = "Private address";
  h.state.checkout.selectedLocation = { latitude: 10.42, longitude: 122.92 };
  h.clearCheckoutCustomer();
  for (const id of ["customer-name", "customer-phone", "address-line1", "address-city", "address-province"]) assert.equal(h.node(id).value, "");
  assert.equal(h.state.checkout.selectedLocation, null);
  assert.equal(h.node("checkout-dialog").open, false);
});
test("Saved address selection passes the pin through the existing routing flow", async () => {
  const h = checkoutHarness();
  await h.handleCheckoutRequest();
  h.setOrderType("delivery");
  h.state.checkout.map = {};
  await h.useSavedDeliveryAddress();
  assert.equal(h.selected[0][0], 10.42);
  assert.equal(h.selected[0][1], 122.92);
  assert.equal(h.selected[0][2].savedAddress.city, address.city);
});
test("A delayed map load cannot apply another account's saved address", async () => {
  const h = checkoutHarness(), pending = deferred();
  await h.handleCheckoutRequest();
  h.setOrderType("delivery");
  h.setMap(() => pending.promise);
  const loading = h.useSavedDeliveryAddress();
  h.clearCheckoutCustomer();
  h.setSession({ user: { id: "customer-b" } });
  pending.resolve();
  await loading;
  assert.equal(h.selected.length, 0);
});
test("A delayed checkout profile load cannot reopen checkout after sign-out", async () => {
  const h = checkoutHarness(), pending = deferred();
  h.setLoad(() => pending.promise);
  const loading = h.handleCheckoutRequest();
  await flush();
  h.clearCheckoutCustomer();
  h.setSession(null);
  pending.resolve({ full_name: "Private customer", mobile_number: "+639171234567" });
  await loading;
  assert.equal(h.node("customer-name").value, "");
  assert.equal(Boolean(h.node("checkout-dialog").open), false);
});
test("Checkout submits its edited phone without changing the saved profile", async () => {
  const h = checkoutHarness();
  await h.handleCheckoutRequest();
  h.node("customer-phone").value = "09281234567";
  await h.handleCheckoutSubmit({ preventDefault() {} });
  assert.equal(h.submitted[0].customer_phone, "+639281234567");
});
test("An order response cannot show the previous customer's details after sign-out", async () => {
  const h = checkoutHarness(), pending = deferred();
  await h.handleCheckoutRequest();
  h.setSubmit(() => pending.promise);
  const sending = h.handleCheckoutSubmit({ preventDefault() {} });
  await flush();
  h.clearCheckoutCustomer();
  h.setSession(null);
  pending.resolve({ id: "test-order", customer_name: "Alice Customer", total_price: 80 });
  await sending;
  assert.equal(h.confirmations.length, 0);
  assert.equal(h.state.cart.length, 1);
});

function orderApiHarness() {
  const requests = [];
  let storedOrder = null;
  const context = {
    module: { exports: {} }, URL, URLSearchParams, AbortController, setTimeout, clearTimeout,
    process: { env: { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SECRET_KEY: "fake-server-key", OPENROUTESERVICE_API_KEY: "fake-route-key" } },
    console: { error() {} },
    fetch: async (url, options = {}) => {
      requests.push({ url, options });
      const response = data => ({ ok: true, status: 200, json: async () => data });
      if (url.endsWith("/auth/v1/user")) return response({ id: "11111111-1111-4111-8111-111111111111", is_anonymous: false });
      if (url.includes("/rpc/price_customer_order")) return response({ items: [{ name: "Classic Milk Tea", quantity: 1 }], total_price: 80 });
      if (url.includes("/rest/v1/orders") && options.method === "POST") { storedOrder = JSON.parse(options.body); return response([storedOrder]); }
      if (url.includes("/rest/v1/orders")) return response([]);
      throw new Error("Unexpected network call: " + url);
    },
  };
  vm.runInNewContext(read("api/create-order.js"), context);
  return {
    requests, getStoredOrder: () => storedOrder,
    async submit(phone) {
      const result = { status: null, body: null };
      await context.module.exports({ method: "POST", headers: { host: "shop.example", origin: "https://shop.example", authorization: "Bearer fake-customer-token" }, body: {
        id: "22222222-2222-4222-8222-222222222222", customer_name: "Alice Customer", customer_phone: phone, order_type: "pickup", items: [{ product_id: "classic-milk-tea", quantity: 1 }],
      } }, { setHeader() {}, status(code) { result.status = code; return this; }, json(body) { result.body = body; return this; } });
      return result;
    },
  };
}
test("Order API stores the submitted normalized contact as an order snapshot", async () => {
  const h = orderApiHarness();
  const result = await h.submit("0917 123 4567");
  assert.equal(result.status, 201);
  assert.equal(h.getStoredOrder().customer_phone, "+639171234567");
  assert.equal(result.body.order.customer_phone, "+639171234567");
  assert.equal(h.requests.some(r => r.url.includes("/profiles")), false);
});
test("Order API rejects missing or malformed mobile before writing any order", async () => {
  for (const phone of [undefined, "12345", "javascript:alert(1)"]) {
    const h = orderApiHarness();
    const result = await h.submit(phone);
    assert.equal(result.status, 400);
    assert.equal(result.body.code, "INVALID_CUSTOMER_PHONE");
    assert.equal(h.getStoredOrder(), null);
  }
});
test("Staff contact links accept only validated phone values and handle old orders", () => {
  const h = compile("js/order-contact.js", { document: { createElement: () => new Element() } }, "createOrderContact");
  const link = h.createOrderContact("+639171234567").children[1];
  assert.equal(link.href, "tel:+639171234567");
  for (const phone of [null, "javascript:alert(1)"]) {
    const node = h.createOrderContact(phone).children[1];
    assert.equal(node.href, undefined);
    assert.equal(node.textContent, "No contact number recorded");
  }
});

(async () => {
  for (const { name, run } of tests) { await run(); console.log("PASS " + name); }
  console.log(tests.length + " customer profile tests passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
