"use strict";
const { test } = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const source=fs.readFileSync(path.join(__dirname,"../js/order-history.js"),"utf8").replace(/^export /gm,"");
const {describeOrderEvent,loadOrderHistory,createOrderHistoryPanel}=new Function(source+";return {describeOrderEvent,loadOrderHistory,createOrderHistoryPanel};")();
test("History describes real state changes and marks the start of logging without inventing earlier actions",()=>{
  assert.equal(describeOrderEvent({event_type:"status_changed",from_status:"preparing",to_status:"dispatched"}),"Preparing → On delivery / ready for pickup");
  assert.equal(describeOrderEvent({event_type:"history_started"}),"Activity logging started");
  assert.equal(describeOrderEvent({event_type:"rider_reassigned"}),"Rider reassigned");
});
function clientFor(promise,calls=[]) { const q={select(cols){calls.push(["select",cols]);return q;},eq(k,v){calls.push(["eq",k,v]);return q;},order(){return q;},limit(n){calls.push(["limit",n]);return q;},abortSignal(){return promise;}};return {from(table){calls.push(["from",table]);return q;}}; }
test("History reads are restricted to one order and omit sensitive actor and metadata fields",async()=>{
  const calls=[];await loadOrderHistory(clientFor(Promise.resolve({data:[]}),calls),"order-one");
  assert.ok(calls.some(c=>c[0]==="eq"&&c[1]==="order_id"&&c[2]==="order-one"));
  assert.ok(calls.some(c=>c[0]==="limit"&&c[1]===50));
  assert.doesNotMatch(calls.find(c=>c[0]==="select")[1],/actor_user_id|metadata|phone|address/);
});
test("Database errors become a safe, retryable activity message",async()=>{
  await assert.rejects(loadOrderHistory(clientFor(Promise.resolve({error:{message:"private details"}})),"one"),/Try Refresh activity/);
});
function element(){return {children:[],set textContent(v){this.text=v;this.children=[];},get textContent(){return (this.text||"")+this.children.map(c=>c.textContent).join(" ");},append(...v){this.children.push(...v);},replaceChildren(...v){this.children=v;this.text="";},setAttribute(){},addEventListener(){}};}
test("Closing a modal or switching accounts discards late history responses",async()=>{
  let resolve,current=true;const pending=new Promise(r=>resolve=r);
  const panel=createOrderHistoryPanel({client:clientFor(pending),orderId:"one",isCurrent:()=>current,document:{createElement:element},formatTime:()=>"now"});
  current=false;resolve({data:[{event_type:"order_created",actor_kind:"customer",occurred_at:"now"}]});
  await new Promise(r=>setImmediate(r)); assert.doesNotMatch(panel.textContent,/Order placed/);
});
