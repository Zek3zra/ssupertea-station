"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname,"..");
async function run() {
  const source = fs.readFileSync(path.join(root,"js/catalog.js"),"utf8");
  const helpers = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));
  const seed = JSON.parse(fs.readFileSync(path.join(root,"data/menu-catalog.json"),"utf8"));
  const menu = seed.map(helpers.normalizeCatalogProduct);
  const get = id => menu.find(product => product.id === id);
  let saved = null;
  const appSource = fs.readFileSync(path.join(root,"js/app.js"),"utf8")
    .replace(/^import[\s\S]*?from\s+["'][^"']+["'];\s*/gm, "");
  const context = { ...helpers,
    document: { addEventListener() {} },
    localStorage: { getItem: () => saved, removeItem() {} },
    console: { warn() {} },
  };
  const app = new Function(...Object.keys(context),appSource + `\nreturn {
    loadCart, normalizeStoredCartItem, getItemOptionSummary, calculateUnitPrice,
    setMenu(products) { MENU_ITEMS = products; }
  };`)(...Object.values(context));
  app.setMenu(menu);
  let count = 0;
  function test(name, fn) { fn(); count++; console.log("PASS " + name); }
  const tea = get("milk-tea-taro-milk-tea");
  const meal = get("silog-meals-tocino-silog");
  const combo = get("combos-chicken-burger-and-special-drink");
  const item = (product,size,addons=[]) => ({ productId: product.id, size:{id:size}, sugar:{id:product.customizable ? "50" : "standard"}, ice:{id:product.customizable ? "regular-ice" : "not-applicable"}, addons:addons.map(id=>({id,price:999})), unitPrice:1, quantity:1, name:"Untrusted saved name" });
  test("The complete poster inventory has 78 unique products in 11 categories", () => {
    assert.equal(menu.length,78); assert.equal(new Set(menu.map(p=>p.id)).size,78);
    assert.equal(new Set(menu.map(p=>p.category)).size,11);
    assert.equal(menu.reduce((n,p)=>n+p.variants.length,0),123);
  });
  test("Classic and premium milk tea use their actual three poster prices", () => {
    assert.deepEqual(tea.variants.map(v=>v.price),[39,45,65]);
    assert.deepEqual(get("milk-tea-matcha-milk-tea").variants.map(v=>v.price),[49,55,75]);
  });
  test("Special drinks, soda, and milkshakes keep their distinct size prices", () => {
    assert.deepEqual(get("special-drinks-iced-coffee").variants.map(v=>v.price),[45,75]);
    assert.deepEqual(get("fruit-soda-lychee-fruit-soda").variants.map(v=>v.price),[49,55]);
    assert.deepEqual(get("milkshakes-avocado-milkshake").variants.map(v=>v.price),[49,55]);
  });
  test("Single-priced coffee and food do not invent size surcharges", () => {
    assert.deepEqual(get("iced-coffee-biscoff-latte").variants.map(v=>v.price),[145]);
    assert.deepEqual(get("sandwiches-toast-bread").variants.map(v=>v.price),[35]);
  });
  test("Budget milk tea combos contain only the four confirmed classic flavors", () => {
    for (const product of menu.filter(p=>p.id.startsWith("budget-meals-m"))) {
      assert.deepEqual(product.variants.map(v=>v.id),["cookies-and-cream","okinawa","taro","wintermelon"]);
    }
  });
  test("Silog extras and combo choices price a mixed basket correctly", () => {
    assert.equal(app.calculateUnitPrice(meal,{sizeId:"regular",addonIds:["extra-egg","extra-rice"]}),120);
    assert.equal(app.calculateUnitPrice(combo,{sizeId:"iced-choco",addonIds:[]}),89);
    assert.equal(app.calculateUnitPrice(tea,{sizeId:"large",addonIds:[]})*2+120+89,339);
  });
  test("Invalid variants and extras cannot silently receive a base price", () => {
    assert.throws(()=>app.calculateUnitPrice(tea,{sizeId:"regular",addonIds:[]}));
    assert.throws(()=>app.calculateUnitPrice(tea,{sizeId:"small",addonIds:["extra-rice"]}));
  });
  test("Restored carts use catalog names and prices instead of saved customer values", () => {
    const restored=app.normalizeStoredCartItem(item(tea,"large"));
    assert.equal(restored.name,"Taro Milk Tea"); assert.equal(restored.unitPrice,65);
    const updated={...tea,variants:tea.variants.map(v=>({...v,price:v.price+5}))};
    app.setMenu([updated,...menu.filter(p=>p.id!==tea.id)]);
    assert.equal(app.normalizeStoredCartItem(item(tea,"large")).unitPrice,70);
    app.setMenu(menu);
  });
  test("Food summaries show extras without redundant serving, sugar, or ice labels", () => {
    const restored=app.normalizeStoredCartItem(item(meal,"regular",["extra-rice"]));
    assert.equal(app.getItemOptionSummary(restored),"Extra rice");
    assert.equal(restored.unitPrice,100);
  });
  test("Cart recovery removes retired products and clamps excessive quantities", () => {
    assert.equal(app.normalizeStoredCartItem({...item(tea,"small"),productId:"retired"}),null);
    assert.equal(app.normalizeStoredCartItem({...item(tea,"small"),quantity:500}).quantity,20);
    saved=JSON.stringify([item(meal,"regular"),{productId:"retired"}]);
    assert.equal(app.loadCart().length,1);
  });
  test("Repeated stored extras are charged and displayed once", () => {
    const restored=app.normalizeStoredCartItem(item(meal,"regular",["extra-egg","extra-egg"]));
    assert.equal(restored.addons.length,1); assert.equal(restored.unitPrice,105);
  });
  test("Inactive options disappear and invalid database prices fail visibly", () => {
    assert.equal(helpers.normalizeCatalogProduct({...seed[0],variants:seed[0].variants.map((v,i)=>({...v,active:i!==0}))}).basePrice,45);
    assert.throws(()=>helpers.normalizeCatalogProduct({...seed[0],variants:[{id:"small",label:"Small",price:null}]}));
  });
  test("Photo placeholders reject executable URLs and keep a safe fallback icon", () => {
    assert.equal(helpers.safeImageUrl("javascript:alert(1)"),"");
    assert.equal(helpers.safeImageUrl("data:text/html,test"),"");
    assert.equal(helpers.safeImageUrl("https://example.com/food.jpg"),"https://example.com/food.jpg");
    assert.equal(helpers.safeImageUrl("/assets/food.jpg"),"/assets/food.jpg");
    assert.equal(helpers.catalogIcon("unknown"),helpers.catalogIcon("cup"));
  });
  test("Sugar choices use recipe labels and recover older carts", () => {
    assert.deepEqual(helpers.SUGAR_OPTIONS.map(option=>option.label),["Less sugar","More sugar","Original recipe"]);
    for (const option of helpers.SUGAR_OPTIONS) {
      const restored=app.normalizeStoredCartItem({...item(tea,"small"),sugar:{id:option.id}});
      assert.equal(restored.sugar.label,option.label);
      assert.equal(app.getItemOptionSummary(restored),`Small · ${option.label} · Regular`);
    }
    assert.equal(app.normalizeStoredCartItem(item(tea,"small")).sugar.id,"original-recipe");
    assert.equal(helpers.getSugarOption("25").id,"less-sugar");
    assert.equal(helpers.getSugarOption("100").id,"more-sugar");
    assert.equal(helpers.getSugarOption("invalid"),null);
  });
  test("Only the three hot drinks use the steaming icon", () => {
    assert.deepEqual(menu.filter(p=>p.icon==="coffee").map(p=>p.name).sort(),["Coffee with Milk","Milo","Plain Coffee"]);
    assert.ok(menu.filter(p=>p.category==="Iced Coffee").every(p=>p.icon==="cup"));
    assert.notEqual(helpers.catalogIcon("cup"),helpers.catalogIcon("coffee"));
  });
  console.log(`${count} menu catalog tests passed`);
}
run().catch(error=>{console.error(error);process.exitCode=1;});
