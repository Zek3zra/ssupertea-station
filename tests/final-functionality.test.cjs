"use strict";

// Run with: node tests/final-functionality.test.cjs
// These tests execute the actual feature functions with controlled Auth/DOM
// boundaries. They do not send email, change passwords, or write to Supabase.
async function runTests(readSource) {
  const results = [];
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  async function test(name, fn) {
    await fn();
    results.push(name);
  }
  const deferred = () => {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
  };
  const flush = async () => {
    for (let i = 0; i < 24; i++) await Promise.resolve();
  };
  class Element {
    constructor() {
      this.children = [];
      this.dataset = {};
      this.listeners = {};
      this.disabled = false;
      this.value = "";
      this.hidden = false;
      this._text = "";
      this.classList = { add() {}, toggle() {} };
    }
    set textContent(value) { this._text = String(value); this.children = []; }
    get textContent() { return this._text + this.children.map(x => x.textContent).join(" "); }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this._text = ""; this.children = children; }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    querySelector() { return null; }
    setAttribute() {}
    focus() {}
    checkValidity() { return this.valid !== false; }
  }
  function compile(file, context, exports, { removeStart = false } = {}) {
    let source = readSource(file)
      .replace(/^import[\s\S]*?from\s+["'][^"']+["'];\s*/gm, "")
      .replace(/^export /gm, "");
    if (removeStart) source = source.replace(/start\(\)\.catch\([\s\S]*?\n\}\);/, "");
    return new Function(...Object.keys(context), source + "\nreturn {" + exports + "};")(...Object.values(context));
  }
  function historyHarness() {
    const list = new Element();
    const elements = {
      "account-profile-view": new Element(),
      "login-email": new Element(),
      "forgot-password-button": new Element(),
      "auth-status": new Element(),
    };
    const callbacks = {};
    const authListeners = [];
    let session = { user: { id: "customer-a" } };
    let verify = async () => session;
    let query = async () => ({ data: [], error: null });
    let reset = async () => ({ error: null });
    const calls = [];
    const window = {
      location: { pathname: "/", origin: "https://shop.example" },
      addEventListener(name, fn) { (callbacks[name] ||= []).push(fn); },
      setTimeout(fn) { Promise.resolve().then(fn); },
    };
    const supabase = {
      auth: {
        onAuthStateChange(fn) { authListeners.push(fn); },
        getSession: async () => ({ data: { session }, error: null }),
        resetPasswordForEmail: (...args) => reset(...args),
      },
      from(table) {
        const request = { table };
        return {
          select() { return this; },
          eq(column, value) { request.filter = [column, value]; return this; },
          order() { return this; },
          limit(value) { request.limit = value; calls.push(request); return query(request); },
        };
      },
    };
    const feature = compile("js/final-polish.js", {
      window,
      document: {
        readyState: "complete",
        getElementById: id => elements[id] || null,
        querySelector: selector => selector === "[data-history-list]" ? list : new Element(),
        createElement: () => new Element(),
      },
      customerSupabase: supabase,
      getVerifiedAccountSession: () => verify(),
      console: { warn() {} },
    }, "loadOrderHistory, initializeCustomerPolish, handleForgotPassword", { removeStart: true });
    return {
      feature, list, elements, calls,
      setSession(value) { session = value; },
      setVerify(fn) { verify = fn; },
      setQuery(fn) { query = fn; },
      setReset(fn) { reset = fn; },
      emitAuth(event) { authListeners.forEach(fn => fn(event)); },
      emit(name) { (callbacks[name] || []).forEach(fn => fn()); },
    };
  }
  const order = (id, total = 125) => ({
    id, total_price: total, status: "completed", order_type: "pickup",
    created_at: "2026-08-30T10:00:00Z",
  });

  await test("My Orders explicitly selects only the current customer's orders", async () => {
    const h = historyHarness();
    h.setQuery(async request => ({
      data: request.filter?.[1] === "customer-a"
        ? [order("aaaaaaaa")] : [order("aaaaaaaa"), order("bbbbbbbb")],
    }));
    await h.feature.loadOrderHistory();
    check(h.calls[0]?.filter?.[0] === "customer_session_token", "Missing owner filter");
    check(h.list.children.length === 1 && !h.list.textContent.includes("BBBBBBBB"), "Other customer's order rendered");
  });

  await test("Sign-out clears history and discards a late response", async () => {
    const h = historyHarness(), pending = deferred();
    h.setQuery(() => pending.promise);
    h.feature.initializeCustomerPolish();
    await flush();
    h.setSession(null);
    h.emitAuth("SIGNED_OUT");
    check(h.list.textContent.includes("Sign in"), "History not cleared immediately");
    pending.resolve({ data: [order("aaaaaaaa")] });
    await flush();
    check(!h.list.textContent.includes("AAAAAAAA"), "Old order returned after sign-out");
  });

  await test("Switching accounts cannot let the older request overwrite new history", async () => {
    const h = historyHarness(), pending = deferred();
    h.setQuery(request => request.filter[1] === "customer-a"
      ? pending.promise : Promise.resolve({ data: [order("bbbbbbbb")] }));
    h.feature.initializeCustomerPolish();
    await flush();
    h.setSession({ user: { id: "customer-b" } });
    h.emitAuth("SIGNED_IN");
    await flush();
    check(h.list.textContent.includes("BBBBBBBB"), "New account did not load");
    pending.resolve({ data: [order("aaaaaaaa")] });
    await flush();
    check(h.list.textContent.includes("BBBBBBBB") && !h.list.textContent.includes("AAAAAAAA"), "Stale account overwrote current account");
  });

  await test("An order change during loading triggers a fresh request", async () => {
    const h = historyHarness(), pending = deferred();
    let requests = 0;
    h.setQuery(() => ++requests === 1
      ? pending.promise : Promise.resolve({ data: [order("bbbbbbbb")] }));
    h.feature.initializeCustomerPolish();
    await flush();
    h.emit("ssupertea:order-changed");
    await flush();
    pending.resolve({ data: [order("aaaaaaaa")] });
    await flush();
    check(requests === 2 && h.list.textContent.includes("BBBBBBBB"), "Order update was dropped");
  });

  await test("History verification failures show an error and allow retry", async () => {
    const h = historyHarness();
    h.setVerify(async () => { throw new Error("offline"); });
    await h.feature.loadOrderHistory();
    check(h.list.textContent.includes("temporarily unavailable"), "No recoverable history error");
    h.setVerify(async () => ({ user: { id: "customer-a" } }));
    await h.feature.loadOrderHistory();
    check(h.list.textContent.includes("no previous orders"), "History remained stuck");
  });

  await test("Forgot password rejects invalid email without sending", async () => {
    const h = historyHarness();
    let sent = 0;
    h.setReset(async () => { sent++; return {}; });
    h.elements["login-email"].value = "bad-email";
    h.elements["login-email"].valid = false;
    await h.feature.handleForgotPassword();
    check(sent === 0, "Invalid address submitted");
  });

  await test("Forgot password prevents duplicate sends and recovers after failure", async () => {
    const h = historyHarness(), pending = deferred();
    let sent = 0;
    h.elements["login-email"].value = "test@example.com";
    h.setReset(() => { sent++; return pending.promise; });
    const first = h.feature.handleForgotPassword();
    await h.feature.handleForgotPassword();
    check(sent === 1 && h.elements["forgot-password-button"].disabled, "Duplicate reset request allowed");
    pending.reject(new Error("Network unavailable"));
    await first;
    check(!h.elements["forgot-password-button"].disabled, "Reset button remained stuck");
    h.setReset(async () => { sent++; return {}; });
    await h.feature.handleForgotPassword();
    check(sent === 2 && h.elements["auth-status"].textContent.includes("If an account exists"), "Reset retry or neutral success copy failed");
  });

  function resetHarness(initial) {
    const elements = Object.fromEntries([
      "reset-password-form", "reset-password", "reset-password-confirm",
      "reset-password-submit", "reset-password-status",
    ].map(id => [id, new Element()]));
    let verify = initial || (async () => ({ user: { id: "customer-a" } }));
    let update = async () => ({ error: null });
    let signout = async () => {};
    const redirects = [], calls = [], timers = [];
    const feature = compile("js/reset-password.js", {
      document: { getElementById: id => elements[id] },
      window: {
        location: { replace: path => redirects.push(path) },
        setTimeout: fn => timers.push(fn),
      },
      getVerifiedAccountSession: () => verify(),
      customerSupabase: { auth: { updateUser: data => { calls.push(data); return update(data); } } },
      clearCustomerSession: () => signout(),
    }, "handleSubmit");
    return {
      elements, redirects, calls, timers,
      submit: () => feature.handleSubmit({ preventDefault() {} }),
      passwords(a = "sample-test-password", b = a) {
        elements["reset-password"].value = a;
        elements["reset-password-confirm"].value = b;
      },
      setVerify(fn) { verify = fn; },
      setUpdate(fn) { update = fn; },
      setSignout(fn) { signout = fn; },
    };
  }

  await test("Reset submission stays disabled until verification finishes", async () => {
    const pending = deferred(), h = resetHarness(() => pending.promise);
    h.passwords();
    await h.submit();
    check(h.elements["reset-password-submit"].disabled && h.calls.length === 0, "Unverified form submitted");
    pending.resolve(null);
    await flush();
    check(h.elements["reset-password-submit"].disabled, "Expired session enabled reset");
  });

  await test("Reset rejects mismatched passwords and allows retry after a network error", async () => {
    const h = resetHarness();
    await flush();
    h.passwords("sample-test-password", "different-password");
    await h.submit();
    check(h.calls.length === 0, "Mismatched passwords submitted");
    h.passwords();
    h.setUpdate(async () => { throw new Error("Connection lost"); });
    await h.submit();
    check(!h.elements["reset-password-submit"].disabled, "Form stuck after network error");
    check(h.elements["reset-password-status"].textContent.includes("Connection lost"), "Network failure hidden");
    h.setUpdate(async () => ({ error: null }));
    await h.submit();
    check(h.elements["reset-password"].value === "", "Password not cleared after save");
    h.timers.forEach(fn => fn());
    check(h.redirects[0] === "/?auth=login&reset=success", "Successful reset did not return to sign-in");
  });

  await test("Changing account during reset blocks the password update", async () => {
    const h = resetHarness();
    await flush();
    h.passwords();
    h.setVerify(async () => ({ user: { id: "customer-b" } }));
    await h.submit();
    check(h.calls.length === 0 && h.elements["reset-password-submit"].disabled, "Password changed for a different session");
  });

  await test("Reset does not claim sign-out succeeded when sign-out fails", async () => {
    const h = resetHarness();
    await flush();
    h.passwords();
    h.setSignout(async () => { throw new Error("offline"); });
    await h.submit();
    check(h.elements["reset-password-status"].textContent.includes("Password updated, but sign-out"), "Partial success misreported");
    check(h.redirects.length === 0 && h.timers.length === 0, "Redirected despite failed sign-out");
  });

  await test("Repeated reset submissions produce only one password update", async () => {
    const h = resetHarness(), pending = deferred();
    await flush();
    h.passwords();
    h.setUpdate(() => pending.promise);
    const first = h.submit();
    await flush();
    await h.submit();
    check(h.calls.length === 1, "Duplicate password update");
    pending.resolve({ error: null });
    await first;
  });

  await test("Callback return paths reject external URLs and browser URL normalization tricks", async () => {
    const source = readSource("js/auth-callback.js");
    const safe = new Function(source.slice(source.indexOf("function safeNextPath(")) + "\nreturn safeNextPath;")();
    for (const path of ["https://example.com", "//example.com", "/\\example.com", "/\t/example.com", "/\n/example.com"]) {
      check(safe(path) === "/", "Unsafe return path accepted: " + JSON.stringify(path));
    }
    check(safe("/reset-password.html") === "/reset-password.html", "Valid recovery path rejected");
    check(safe("/?auth=login#menu") === "/?auth=login#menu", "Valid storefront path rejected");
  });

  await test("PWA does not cache authorization codes and uses the matching offline page", async () => {
    const source = readSource("sw.js");
    const nav = source.slice(source.indexOf("async function networkFirstNavigation("), source.indexOf("async function networkFirstAsset("));
    let puts = 0;
    const shell = { kind: "cached-reset-page" };
    const cache = { put: async () => { puts++; }, match: async () => undefined };
    const staticCache = { match: async path => path === "/reset-password.html" ? shell : undefined };
    const network = { clone() { return this; } };
    let online = true;
    const navigate = new Function("caches", "fetch", "URL", "isCacheableResponse", "createOfflineResponse",
      'const RUNTIME_CACHE = "runtime", STATIC_CACHE = "static";\n' + nav + "\nreturn networkFirstNavigation;"
    )(
      { open: async name => name === "static" ? staticCache : cache },
      async () => { if (!online) throw new Error("offline"); return network; },
      class TestURL { constructor(value) { this.pathname = value.replace(/^https?:\/\/[^/]+/, "").split("?")[0]; } },
      () => true, () => ({ kind: "offline" })
    );
    await navigate({ request: { url: "https://shop.example/auth-callback.html?code=one-time-code" } });
    check(puts === 0, "Auth code cached");
    await navigate({ request: { url: "https://shop.example/index.html" } });
    check(puts === 1, "Normal app page not cached");
    online = false;
    const response = await navigate({ request: { url: "https://shop.example/reset-password.html" } });
    check(response === shell, "Wrong page returned offline");
    const missing = await navigate({ request: { url: "https://shop.example/missing.html" } });
    check(missing?.kind === "offline", "Missing cache entry returned an unresolved or empty response");
  });

  return results;
}

module.exports = runTests;
if (require.main === module) {
  const fs = require("node:fs");
  const path = require("node:path");
  runTests(file => fs.readFileSync(path.join(__dirname, "..", file), "utf8"))
    .then(results => console.log(results.map(name => "PASS " + name).join("\n") + "\n" + results.length + " tests passed"))
    .catch(error => { console.error(error); process.exitCode = 1; });
}
