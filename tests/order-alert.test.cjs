"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "../js/order-alert.js"), "utf8").replace(/^export /gm, "");
const createOrderAlert = new Function(source + "\nreturn createOrderAlert;")();
const pending = [{ id: "a", status: "pending" }, { id: "b", status: "pending" }];
function harness() {
  const timers = new Map(), voices = [], contexts = []; let sequence = 0, click;
  const button = { textContent: "", disabled: false, addEventListener: (_, fn) => { click = fn; }, removeEventListener() { click = null; } };
  const status = { textContent: "" };
  class Audio {
    constructor() { this.state = "suspended"; this.currentTime = 0; contexts.push(this); }
    async resume() { this.state = "running"; this.onstatechange?.(); }
    async close() { this.state = "closed"; }
    createOscillator() { const voice = { frequency: {}, connect() {}, disconnect() {}, start() { voice.started = true; }, stop(at) { if (at === undefined) voice.cancelled = true; } }; voices.push(voice); return voice; }
    createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
  }
  const environment = { AudioContext: Audio, setInterval: (fn, ms) => { assert.equal(ms, 4000); const id = ++sequence; timers.set(id, fn); return id; }, clearInterval: id => timers.delete(id) };
  const alert = createOrderAlert({ button, status, environment });
  return { alert, button, status, timers, voices, contexts, environment, click: () => click(), tick: () => [...timers.values()].forEach(fn => fn()) };
}
test("Pending orders cannot autoplay before a staff member enables sound", () => {
  const h = harness(); h.alert.setPending(pending); assert.equal(h.contexts.length, 0); assert.equal(h.timers.size, 0); assert.match(h.status.textContent, /2 orders/);
});
test("Enabling sound plays immediately and repeats while any pending order remains", async () => {
  const h = harness(); h.alert.setPending(pending); await h.click(); assert.equal(h.timers.size, 1); assert.equal(h.voices.length, 2);
  h.tick(); assert.equal(h.voices.length, 4);
  h.alert.setPending([{ ...pending[0], status: "preparing" }, pending[1]]); assert.equal(h.timers.size, 1); assert.match(h.status.textContent, /1 order needs/);
});
test("Confirming, cancelling, or handling the final pending order cancels timer and scheduled tones", async () => {
  const h = harness(); h.alert.setPending(pending); await h.click(); h.alert.setPending([{ id: "a", status: "preparing" }, { id: "b", status: "cancelled" }]);
  assert.equal(h.timers.size, 0); assert.ok(h.voices.every(voice => voice.cancelled)); assert.match(h.status.textContent, /No orders waiting/);
});
test("Repeated refreshes keep only one timer and a later new order restarts alerts", async () => {
  const h = harness(); h.alert.setPending(pending); await h.click(); h.alert.setPending(pending); h.alert.setPending(pending);
  assert.equal(h.timers.size, 1); assert.equal(h.voices.length, 2);
  h.alert.setPending([]); h.alert.setPending([pending[0]]); assert.equal(h.timers.size, 1); assert.equal(h.voices.length, 4);
});
test("Test sound with an empty queue plays a single chime without a repeating timer", async () => {
  const h = harness(); await h.click(); assert.equal(h.voices.length, 2); assert.equal(h.timers.size, 0);
});
test("Browser audio suspension offers Enable sound again and recovers on another tap", async () => {
  const h = harness(); h.alert.setPending(pending); await h.click(); h.contexts[0].state = "suspended"; h.contexts[0].onstatechange();
  assert.equal(h.timers.size, 0); assert.equal(h.button.textContent, "Enable order sound"); await h.click(); assert.equal(h.timers.size, 1);
});
test("Unavailable audio leaves the queue visible and permits retry", async () => {
  const h = harness(); delete h.environment.AudioContext; h.alert.setPending(pending); await h.click();
  assert.equal(h.button.disabled, false); assert.match(h.status.textContent, /2 orders need confirmation.*unavailable/); assert.equal(h.timers.size, 0);
});
test("Leaving the page or signing out stops audio and discards late activation", async () => {
  const h = harness(); h.alert.setPending(pending); const enabling = h.click(); h.alert.destroy(); await enabling;
  assert.equal(h.timers.size, 0); assert.equal(h.contexts[0].state, "closed"); assert.ok(h.voices.every(voice => voice.cancelled));
});
