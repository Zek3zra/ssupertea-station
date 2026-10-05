"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const source=fs.readFileSync(path.join(__dirname,"../js/admin.js"),"utf8").replace(/^import[\s\S]*?from\s+["'][^"']+["'];\s*/gm,"");
let count=0;
function test(name,fn){fn();count++;console.log("PASS "+name);}
function harness(storage=new Map()){
  const nodes=new Map();
  const node=id=>{if(!nodes.has(id))nodes.set(id,{textContent:"",hidden:false,disabled:false});return nodes.get(id);};
  let lists={};
  const app=new Function("document","localStorage","customerSupabase",source+`\nreturn { state, cacheElements, loadClearedFinishedOrders, clearFinishedOrders, restoreFinishedOrders, renderDashboard,
    configure(render){renderOrderList=(container,orders)=>render(container,orders);showToast=()=>{};}
  };`)(
    {addEventListener(){},getElementById:node},
    {getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},
    {from(){throw new Error("Clearing must not write to Supabase");},rpc(){throw new Error("Clearing must not write to Supabase");}}
  );
  app.cacheElements();
  app.state.session={user:{id:"staff-a"}};
  app.state.permissions={can_manage_orders:true};
  app.configure((container,orders)=>{lists[[...nodes].find(([,value])=>value===container)[0]]=orders;});
  return {...app,node,storage,lists};
}
const orders=[{id:"pending",status:"pending"},{id:"preparing",status:"preparing"},{id:"dispatched",status:"dispatched"},{id:"done",status:"completed"},{id:"cancelled",status:"cancelled"}];
test("Clearing finished orders preserves active orders and original records",()=>{
  const h=harness();h.state.orders=structuredClone(orders);h.clearFinishedOrders();
  assert.equal(h.lists["admin-recent-list"].length,0);
  assert.equal(h.lists["admin-pending-list"].length,1);assert.equal(h.lists["admin-preparing-list"].length,1);assert.equal(h.lists["admin-dispatched-list"].length,1);
  assert.deepEqual(h.state.orders,orders);assert.equal(h.node("admin-clear-finished-button").disabled,true);assert.equal(h.node("admin-restore-finished-button").hidden,false);
});
test("Cleared orders stay hidden after reload but newly finished orders appear",()=>{
  const h=harness();h.state.orders=structuredClone(orders);h.clearFinishedOrders();
  const reloaded=harness(h.storage);reloaded.loadClearedFinishedOrders();reloaded.state.orders=[...orders,{id:"new-finished",status:"completed"}];reloaded.renderDashboard();
  assert.deepEqual(reloaded.lists["admin-recent-list"].map(order=>order.id),["new-finished"]);
});
test("Show cleared restores finished orders",()=>{
  const h=harness();h.state.orders=structuredClone(orders);h.clearFinishedOrders();h.restoreFinishedOrders();
  assert.equal(h.lists["admin-recent-list"].length,2);assert.equal(h.node("admin-restore-finished-button").hidden,true);
  assert.deepEqual(JSON.parse([...h.storage.values()][0]),[]);
});
test("Clear preferences belong to the signed-in staff account",()=>{
  const h=harness();h.state.orders=structuredClone(orders);h.clearFinishedOrders();h.state.session={user:{id:"staff-b"}};h.loadClearedFinishedOrders();h.renderDashboard();
  assert.equal(h.lists["admin-recent-list"].length,2);
});
test("Malformed saved preferences cannot prevent the dashboard from rendering",()=>{
  const h=harness(new Map([["ssupertea-cleared-finished-v1:staff-a","invalid json"]]));h.loadClearedFinishedOrders();h.state.orders=orders;h.renderDashboard();assert.equal(h.lists["admin-recent-list"].length,2);
});
test("Clearing includes loaded finished orders beyond the twelve-card limit",()=>{
  const h=harness();h.state.orders=Array.from({length:20},(_,i)=>({id:`finished-${i}`,status:"completed"}));h.renderDashboard();assert.equal(h.lists["admin-recent-list"].length,12);h.clearFinishedOrders();assert.equal(h.lists["admin-recent-list"].length,0);assert.equal(h.state.clearedFinishedIds.size,20);
});
console.log(`${count} admin finished-order tests passed`);
