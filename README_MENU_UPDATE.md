# White theme and official menu update

The local UI now uses white surfaces, black text and actions, light gray borders, and the supplied Ssupertea logo. Customer, account, reset, admin, and rider pages share the theme. Menu cards use category icons until product photos are available.

## Preview

Run from this project directory:

```powershell
node scripts/preview.cjs
```

Open http://127.0.0.1:4173. The menu reads the connected Supabase catalog. The preview server only serves app assets; it does not expose environment files or SQL files. Server API testing requires the existing server environment variables in an ignored `.env.local`. No credentials have been changed or added to browser code.

## What was saved to Supabase

The connected project now has 78 official products, 123 size/serving/flavor options, and 16 silog extras:

| Table | Purpose |
|---|---|
| `menu_catalog` | Names, categories, descriptions, icon, optional `image_url`, availability, display order |
| `menu_catalog_variants` | Actual price for each size, serving, or included combo drink |
| `menu_catalog_addons` | Extras allowed for a specific product |

Public visitors can read active menu entries. Only accounts with the existing staff `can_manage_orders` permission can add or edit rows, and anonymous Auth accounts cannot manage the menu. Prices have database constraints. `updated_at` is maintained automatically.

The new server-only `price_catalog_order` function verifies product availability, choices, extras, quantities, and prices. The local order API calls this function. Customer-submitted prices are ignored, and an order keeps its price and option snapshots.

The old `menu_products`, `menu_addons`, and `price_customer_order` remain intact so the currently deployed site keeps using its existing menu. Existing customer records and orders were not edited. No Git commit, push, or Vercel deployment was performed.

Applied remote migrations: `official_menu_catalog`, `official_menu_catalog_nonanonymous_managers`, and `menu_recipe_sugar_choices`. Iced coffee icons were also updated in the live catalog. The matching setup scripts are in `sql/`. They are already applied to the connected project; do not rerun the initial setup there.

## Menu choices

- Classic milk tea: ₱39 / ₱45 / ₱65. Premium: ₱49 / ₱55 / ₱75.
- Special drinks: ₱45 / ₱75. Fruit soda and milkshakes: ₱49 / ₱55.
- Items with one variant use it automatically; the redundant serving selector is hidden. Food cart summaries omit “Regular.”
- Sugar choices are Less sugar, More sugar, and Original recipe (default). Previously saved percentage choices still restore correctly.
- Only Plain Coffee, Coffee with Milk, and Milo use the steaming cup icon; iced coffee uses a cold cup.
- Every menu action says Add to cart. Product previews and the cart close by dragging their header/handle down or tapping outside; Escape remains available for keyboard users.
- Milk tea includes crushed cookies instead of pearls. No paid milk tea topping was invented.
- Silog includes rice and egg. Extra egg is ₱20; extra rice is ₱15.
- The ₱89 chicken burger combo offers Matcha Latte, Iced Coffee, or Iced Choco in 12 oz.
- M1–M4 include small classic milk tea only, as confirmed by the owner.
- Conflicting opening times in the posters are not used to restrict ordering.

## Future admin editing and photos

The catalog is ready for an admin menu editor; the editor screen itself is the next feature. Until then, edit these tables through the Supabase dashboard:

1. Change prices in `menu_catalog_variants.price`, matching the product and variant IDs. Refresh the customer menu to see changes. Checkout always verifies the current database price.
2. Add a photo by setting `menu_catalog.image_url` to an HTTPS image URL. Failed image loads fall back to the existing icon.
3. Add a menu item as inactive, add its variants and optional extras, then set the product to active. A product without any active variants is omitted from the customer menu.
4. Hide an item or option by setting `active` to false. Existing order snapshots remain readable.

The JSON in `data/menu-catalog.json` records the original poster seed. It is not a browser fallback and changing that file alone does not change the live Supabase menu. The generator scripts rebuild the initial seed/setup SQL only; they do not connect to the database or overwrite live price edits.

The new UI uses a separate cart storage key so the deployed demo cart is preserved. Official-menu carts reload using current catalog names, choices, and prices.

## Verification

```powershell
node tests/final-functionality.test.cjs
node tests/customer-profiles.test.cjs
node tests/menu-catalog.test.cjs
node tests/sheet-dismiss.test.cjs
```

All 55 tests passed. `sql/VERIFY_OFFICIAL_MENU_CATALOG.sql` also passed against the connected project: all 123 variant prices and 16 extras, the three recipe sugar choices, legacy sugar compatibility, hot/cold icons, invalid quantities/options, duplicate extras, forged client prices, changed database prices, inactive items, public visibility, and customer write restrictions. Temporary test updates were rolled back.

Browser checks covered desktop and mobile layouts, search/category selection, milk tea sizes and sugar, automatic food servings, silog extras, combo choices, cart totals, cart recovery, downward swipe dismissal, and outside-tap dismissal. No real order was placed. A real pickup/delivery order and staff fulfillment should be tested in a suitable preview environment before final deployment.
