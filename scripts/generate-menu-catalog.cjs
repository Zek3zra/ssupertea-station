"use strict";
// Source: the menu posters supplied by the owner. Run only when rebuilding the initial seed.
// This does not connect to Supabase or modify existing catalog rows.
const fs = require("node:fs");
const path = require("node:path");
const products = [];
const sizes = (prices) => prices.map((price, i) => ({ id: ["small", "medium", "large"][i], label: ["Small", "Medium", "Large"][i], price }));
const regular = (price) => [{ id: "regular", label: "Regular", price }];
const slug = (name) => name.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
function add(category, name, variants, options = {}) {
  products.push({ id: `${slug(category)}-${slug(name)}`, name, category, description: options.description || "", icon: options.icon || "cup", image_url: null, featured: options.featured || false, customizable: options.customizable || false, variant_label: options.variant_label || "Size", active: true, sort_order: products.length, variants, addons: options.addons || [] });
}
for (const name of ["Cookies & Cream", "Okinawa", "Taro", "Wintermelon"]) add("Milk Tea", `${name} Milk Tea`, sizes([39,45,65]), { customizable: true, description: "Classic milk tea with crushed cookies instead of pearls.", featured: name === "Cookies & Cream" });
for (const name of ["Red Velvet", "Chocolate", "Matcha"]) add("Milk Tea", `${name} Milk Tea`, sizes([49,55,75]), { customizable: true, description: "Premium milk tea with crushed cookies instead of pearls.", featured: name === "Matcha" });
for (const [name, price] of [["Classic Iced Coffee",75],["Signature Coffee",75],["Iced Latte",75],["Americano",75],["Spanish Latte",75],["Caramel Latte",75],["Chocolate Coffee",75],["Dirty Matcha",85],["Pink Coffee",75],["Biscoff Latte",145]]) add("Iced Coffee", name, regular(price), { customizable:true, icon:"cup", description: "From our iced coffee menu.", featured:name === "Biscoff Latte", variant_label:"Serving" });
for (const name of ["Matcha Latte","Strawberry Milk","Blueberry Milk","Oreo Milk","Chocolate Milk","Iced Coffee","Iced Choco"]) add("Special Drinks", name, sizes([45,75]), { customizable:true, description:"Your choice of a small or medium special drink.", featured:["Matcha Latte","Iced Choco","Iced Coffee"].includes(name) });
for (const name of ["Lychee","Strawberry","Peach","Blueberry","Green Apple"]) add("Fruit Soda", `${name} Fruit Soda`, sizes([49,55]), { customizable:true, icon:"soda", description:"Refreshing sparkling fruit drink.", featured:["Lychee","Strawberry"].includes(name) });
for (const name of ["Avocado","Cookies & Cream","Chocolate","Strawberry","Mango"]) add("Milkshakes", `${name} Milkshake`, sizes([49,55]), { icon:"shake", description:"A creamy milkshake in your choice of size.", featured:["Cookies & Cream","Chocolate"].includes(name) });
for (const [name,price] of [["Toast Bread",35],["Cheese Melt",45],["Ham and Cheese",55],["Egg and Cheese",65],["Cheesy Tuna",75]]) add("Sandwiches",name,regular(price),{icon:"sandwich",variant_label:"Serving"});
for (const [name,price,icon] of [["Plain Coffee",20,"coffee"],["Coffee with Milk",25,"coffee"],["Milo",25,"coffee"],["Iced Tea (Glass)",20,"cup"],["Cucumber Lemonade",49,"soda"],["Iced Tea (Pitcher)",60,"pitcher"],["Cucumber Lemonade (Pitcher)",95,"pitcher"]]) add("Hot & Cold Drinks",name,regular(price),{icon,variant_label:"Serving"});
for (const [name,price,icon] of [["Fries",25,"fries"],["Lumpia",30,"snack"],["Fried Siomai",30,"snack"],["Burger",40,"burger"],["Cheese Burger",45,"burger"],["Ham Burger",50,"burger"],["Chicken Burger",55,"burger"],["Pancit Canton",45,"noodles"],["Sotanghon",75,"noodles"],["Nachos",75,"snack"],["Cheesy Fries",90,"fries"],["Nacho Fries",100,"fries"]]) add("Merienda",name,regular(price),{icon,variant_label:"Serving",featured:["Chicken Burger","Nacho Fries"].includes(name)});
for (const [name,price] of [["Hotdog",75],["Longganisa",75],["Lumpia",75],["Spam",75],["Burger Steak",75],["Tocino",85],["Corned Beef",90],["Hungarian",100]]) add("Silog Meals",`${name} Silog`,regular(price),{icon:"meal",description:"Served with rice and egg.",variant_label:"Serving",featured:["Tocino","Hungarian"].includes(name),addons:[{id:"extra-egg",label:"Extra egg",price:20},{id:"extra-rice",label:"Extra rice",price:15}]});
add("Combos","Nacho Fries & Iced Tea",regular(150),{icon:"combo",description:"Nacho fries with one pitcher of iced tea. Made to share.",variant_label:"Serving"});
add("Combos","3 Burgers & Iced Tea",regular(170),{icon:"combo",description:"Three burgers with one pitcher of iced tea.",variant_label:"Serving"});
add("Combos","Chicken Burger & Special Drink",["Matcha Latte","Iced Coffee","Iced Choco"].map(name=>({id:slug(name),label:`${name} · 12 oz`,price:89})),{icon:"combo",description:"A chicken burger with your choice of a 12 oz special drink.",variant_label:"Choose your drink",featured:true});
add("Combos","Chicken Burger & Strawberry Soda",regular(99),{icon:"combo",description:"A chicken burger with strawberry soda.",variant_label:"Serving"});
const burgers = ["Burger","Cheese Burger","Ham Burger","Chicken Burger"];
for (const [i,name] of burgers.entries()) add("Budget Meals",`B${i+1} · ${name} Meal`,regular(80+i*5),{icon:"combo",description:`${name}, fries, and iced tea.`,variant_label:"Serving"});
for (const [i,name] of burgers.entries()) add("Budget Meals",`M${i+1} · ${name} & Milk Tea`,["Cookies & Cream","Okinawa","Taro","Wintermelon"].map(flavor=>({id:slug(flavor),label:`${flavor} · Small`,price:95+i*5})),{icon:"combo",description:`${name}, fries, and a small classic milk tea.`,variant_label:"Choose your milk tea"});
if (products.length !== 78 || new Set(products.map(p=>p.id)).size !== products.length) throw new Error("Invalid seed count or duplicate IDs");
const output = path.join(__dirname,"../data/menu-catalog.json");
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,JSON.stringify(products,null,2)+"\n");
console.log(`Prepared ${products.length} menu items in data/menu-catalog.json`);
