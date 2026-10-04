"use strict";
const fs = require("node:fs");
const path = require("node:path");
const file = path.join(__dirname,"../sql/OFFICIAL_MENU_CATALOG.sql");
const rows = JSON.parse(fs.readFileSync(path.join(__dirname,"../data/menu-catalog.json"),"utf8"));
const schema = fs.readFileSync(file,"utf8").split("-- INITIAL_SEED")[0];
const literal = JSON.stringify(rows).replace(/'/g,"''");
fs.writeFileSync(file,schema+`-- INITIAL_SEED\ncreate temporary table official_menu_seed (data jsonb) on commit drop;\ninsert into official_menu_seed values ('${literal}'::jsonb);\n\ninsert into public.menu_catalog (id,name,category,description,icon,image_url,featured,customizable,variant_label,active,sort_order)\nselect p.id,p.name,p.category,p.description,p.icon,p.image_url,p.featured,p.customizable,p.variant_label,p.active,p.sort_order\nfrom official_menu_seed s, jsonb_to_recordset(s.data) as p(id text,name text,category text,description text,icon text,image_url text,featured boolean,customizable boolean,variant_label text,active boolean,sort_order integer);\n\ninsert into public.menu_catalog_variants(product_id,id,label,price,sort_order)\nselect p->>'id',v->>'id',v->>'label',(v->>'price')::numeric,(n-1)::integer\nfrom official_menu_seed s, jsonb_array_elements(s.data) p, jsonb_array_elements(p->'variants') with ordinality as options(v,n);\n\ninsert into public.menu_catalog_addons(product_id,id,label,price,sort_order)\nselect p->>'id',a->>'id',a->>'label',(a->>'price')::numeric,(n-1)::integer\nfrom official_menu_seed s, jsonb_array_elements(s.data) p, jsonb_array_elements(p->'addons') with ordinality as options(a,n);\n\ncommit;\n`);
console.log("Prepared official menu setup SQL with all variants and extras.");
