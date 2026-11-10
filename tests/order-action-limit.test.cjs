"use strict";
const { test } = require("node:test"), assert = require("node:assert/strict");
const { enforceOrderActionLimit } = require("../lib/order-action-limit.cjs");
const config = { supabaseUrl: "https://test.supabase.co", serverKey: "sb_secret_test" };
test("Order limits use the verified account and a server-only RPC, without sending a raw token or IP", async () => {
  let sent;
  await enforceOrderActionLimit(config, "verified-user", "create", async (url, init) => { sent={url,init}; return {ok:true,json:async()=>({allowed:true})}; });
  assert.equal(sent.url, "https://test.supabase.co/rest/v1/rpc/consume_order_action");
  assert.deepEqual(JSON.parse(sent.init.body), { p_user_id:"verified-user", p_action:"create" });
  assert.equal(sent.init.headers.Authorization, undefined); assert.equal(sent.init.headers.apikey, config.serverKey);
});
test("Denied actions return 429 and a bounded retry interval", async () => {
  await assert.rejects(enforceOrderActionLimit(config, "verified-user", "cancel", async()=>({ok:true,json:async()=>({allowed:false,retry_after:120})})), error=>error.code==="ORDER_RATE_LIMITED" && error.statusCode===429 && error.retryAfter===60);
});
test("Network, permission and malformed limiter responses fail closed", async () => {
  for (const fetcher of [async()=>{throw Error("network");},async()=>({ok:false,json:async()=>({message:"private database detail"})}),async()=>({ok:true,json:async()=>null})]) {
    await assert.rejects(enforceOrderActionLimit(config, "verified-user", "create", fetcher), error=>error.code==="ORDER_SECURITY_UNAVAILABLE" && error.statusCode===503 && !error.publicMessage.includes("private"));
  }
});
