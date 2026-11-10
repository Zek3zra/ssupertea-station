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

## Admin menu editing and photos

Finished orders have a **Clear finished** action for completed orders only. The separate Cancelled section has **Clear cancelled**. Each section has its own **Show cleared** action. These controls hide loaded records for the current staff account on this browser/device and persist that preference across refreshes. They never delete database records, affect active orders, or change customer history/tracking. Admin cards use an even border without a status stripe.

Successful order submission clears the busy state and closes checkout before opening confirmation. Opening tracking also closes checkout and confirmation, so closing tracking returns to the store. Failed submissions keep the checkout and cart available for retry. Mobile menu descriptions display in full, and the price has spacing before “from.”

The local Admin page now has **Orders** and **Menu** workspaces. Order alerts continue running while Menu is open. The editor uses the signed-in staff client and existing Supabase catalog policies; no new environment variables, database migration, or secret key in browser code is needed.

1. In **Admin → Menu**, search by name/category and filter Available or Unavailable. Select **Edit item**. Sizes and prices appear first; change a price or its Available checkbox, then press that row's **Save**.
2. **Add option** adds a size, serving, or combo choice. **Add extra** adds an optional extra. Save each row separately. Existing IDs stay unchanged, and historical order names/prices are never rewritten.
3. Expand **Item details & photo** to edit the name, category, description, icon, option heading, display order, featured status, sugar/ice customization, or optional HTTPS/`/assets/` photo URL. Press **Save item details**. This version accepts an image URL; it does not upload files to Storage.
4. **Add item** creates a product with its first serving and price. New products are initially saved as unavailable; publication happens only after the price is saved. If a step fails, an unavailable draft can remain. Refresh the editor and finish that draft rather than creating another item. Repeated requests with the same draft ID do not create duplicates.
5. **Mark unavailable / Make available** controls the product's availability. Individual sizes and extras can also be unavailable. At least one price must be available before publishing a product. Items are hidden rather than deleted, preserving order history.

Saves recheck staff permissions and account identity. Ordinary customers and anonymous accounts cannot use the editor. Updates compare `updated_at` to prevent silently overwriting another admin's changes; refresh and reapply an edit if there is a conflict. Unsaved changes prompt before the modal closes. Prices must be ₱0–₱100,000 with at most two decimal places. Customers see saved changes when they refresh the menu; checkout continues checking current Supabase availability and prices.

The code is local only until committed/deployed. Saving from the real signed-in Admin editor updates the connected Supabase catalog. Automated and browser verification used isolated sample data, not live catalog writes. The separate sample-only preview runs on port 4186 and is not a production backend.

The JSON in `data/menu-catalog.json` records the original poster seed. It is not a browser fallback and changing that file alone does not change the live Supabase menu. The generator scripts rebuild the initial seed/setup SQL only; they do not connect to the database or overwrite live price edits.

The new UI uses a separate cart storage key so the deployed demo cart is preserved. Official-menu carts reload using current catalog names, choices, and prices.

## Verification

```powershell
node --test tests/*.test.cjs
```

All 154 checks passed on 10 November 2026, including 14 menu-editor tests for existing-product compatibility, validation, permission checks, account changes, targeted price edits, stale-update conflicts, unavailable drafts, and safe creation retries. The Node runner reports 94 entries: five older files wrap 65 cases, giving 94 minus 5 plus 65 = 154 checks overall. Browser verification with sample data covered search, a price save surviving refresh, availability off/on, an extra, new item creation, item-detail updates, and 320px/390px layouts. No live catalog prices or orders were changed by this update. The service-worker cache version is v32.

Earlier, `sql/VERIFY_OFFICIAL_MENU_CATALOG.sql` also passed against the connected project: all 123 variant prices and 16 extras, the three recipe sugar choices, legacy sugar compatibility, hot/cold icons, invalid quantities/options, duplicate extras, forged client prices, changed database prices, inactive items, public visibility, and customer write restrictions. Temporary test updates were rolled back. No database changes or new live SQL tests were performed for the mobile queue and delivery-limit update.

Earlier browser checks covered desktop and mobile layouts, search/category selection, milk tea sizes and sugar, automatic food servings, silog extras, combo choices, cart totals, cart recovery, downward swipe dismissal, and outside-tap dismissal. A separately approved live pickup test was subsequently submitted, and the owner confirmed it completed; Completed was also visible in Admin. A real delivery and signed-in phone GPS test remain before final deployment.

## Mobile order queues and 3 km delivery limit (local update, 9 November 2026)

Admin now has five independent sections: **Pending**, **Preparing**, **On delivery**, **Finished**, and **Cancelled**. The phone layout uses a compact Orders heading, an **Operations** menu for refresh and sound, search by customer name/mobile/order reference, newest/oldest sorting, and horizontally scrollable status tabs with counts. Only the selected section is shown. Existing ready-for-pickup orders stay in the dispatched section with their correct Ready for pickup label. Desktop uses the same sections with two card columns.

Changing tabs, searching, or sorting does not silence pending-order alerts. Live refresh preserves the selected tab. Finished and Cancelled each load their latest 100 records independently and show 12 cards initially, with **Show more** for the remaining loaded matches. Active orders keep their existing unrestricted query. Clearing and restoring either history affects only that section.

Deliveries are limited to **3 km by driving route from the configured store location**, including exactly 3,000 metres. Both `/api/route` checkout quotes and `/api/create-order` enforce the limit before rounding. A nearby pin whose road route exceeds 3 km is rejected too; changing the pin immediately invalidates the previous quote and blocks submission until a new valid route arrives. The customer can choose a closer location or pickup. Quote and final-order fees now use the same unrounded distance, so a fraction of a metre above a 300 m fee block cannot produce different prices.

The server caps `SSUPERTEA_MAX_ROUTE_KM` at 3 even if an existing deployment variable still says 50; a smaller positive configured limit is respected. Pickup orders and rider tracking are unaffected. The service-worker cache version was updated to v29 for the new Admin stylesheet.

The subsequent staff UI refinement gives Admin and Rider matching headers: Sign out stays at the upper right, and a compact 196px Admin/Rider switch shows the current mode. An older mobile CSS rule hiding Admin was removed, so both buttons appear side by side for staff with both permissions. Permission checks still determine which modes are available. On phones, the compact switch sits on its own row; on desktop, it sits beside the brand. Admin cards now show only the reference, customer, status, order type, item count, age, and total. Tapping a card opens full contact, item choices, fees, address/map, and the existing confirmation/assignment/pickup controls in a modal. Done, Escape, outside tap, or a downward header swipe dismisses it. Unchanged refreshes preserve modal controls; changed orders update the open details.

Rider now uses independent **Ready to start**, **Out for delivery**, and **Completed** tabs with counts, selected states, keyboard navigation, and one visible section at a time. Refresh preserves the selected tab. The existing delivery actions, completed history controls, GPS, and live map remain available; **Operations** contains refresh and GPS controls. Opening the Out for delivery panel resizes the live map after revealing it. The 390px browser preview with isolated sample data verified both mode buttons and switching from Ready to start to Out for delivery. All 31 targeted checks in the rider completed/GPS and admin details suites passed, including two new Rider navigation checks. The service-worker version is now v31. No live services were changed for this refinement.

The new 390px sample preview was visually checked for the header, search/sort row, tab strip, and Pending/Preparing separation. Browser control then stopped because it could not reliably verify the current URL during a reload. Final visual verification of the Operations refinement and the 320px layout remains incomplete; no further browser actions were attempted after that stop.

These changes are local only. No commit, push, deployment, credentials, database schema, or live environment settings were changed. The 3 km limit will take effect on the live site only after these files are deployed. The earlier order-retry/idempotency finding remains outside this update.


## Rider and admin alerts

Rider Mode now uses readable white cards with an even border, address/contact before item details, larger touch controls, and no empty map canvas while location is unavailable. **Enable GPS** appears when location is missing, denied, timed out, or stale. It rechecks the rider’s active assignment and restarts one high-accuracy browser watch. The rider must allow browser location and turn on the phone’s location; the website cannot switch on device settings itself. Location sharing still starts only for an assigned dispatched delivery and stops when no such delivery remains. Old callbacks and pending writes cannot overwrite a newer delivery’s GPS state.

On Admin, tap **Enable order sound** once after opening the page. A short chime repeats every four seconds while one or more orders are Pending. Confirming the final pending order, or receiving a server update that it was handled/cancelled, stops the repeat. Prepared/dispatched orders do not trigger it. **Test order sound** plays a sample. Audio stops on sign-out or page exit. Browser suspension, muted tabs, or a sleeping/locked device can interrupt audio; keep the admin page open and sound enabled. Live updates plus a ten-second refresh reconcile changes on other devices. Unchanged refreshes preserve dropdowns. Successful confirmations stop their alerts even if the follow-up read fails; failed confirmations continue alerting.

Verification used actual UI modules with isolated sample orders, mocked GPS, and a mocked database boundary, at desktop and 390px phone widths. No real order or real location was sent. Read-only Supabase checks confirmed RLS and Realtime on orders, delivery assignments, and locations, and authenticated-only access to the location RPC. Its existing database permission/assignment checks remain in place; no schema or credential changes were needed. A real signed-in rider should still test GPS permissions and accuracy on their phone before deployment.

Rider Sign out stays at the upper right beside the logo on mobile and desktop. Recently completed deliveries show a compact summary; **More details** opens a modal with the customer contact, address, items and recorded prices, fees, order reference, and **Open in Google Maps**. A missing map pin falls back to the recorded address. The modal closes with Done, Escape, a downward header swipe, or an outside tap.

**Minimize** collapses the completed list. **Remove** hides one completed delivery and **Clear completed** hides all loaded completed deliveries for the current rider on this browser/device. **Show cleared** restores them. These controls preserve active deliveries and database order history; saved preferences contain only order IDs. Browser checks with sample data covered removal across refresh, restoration, minimization, modal dismissal, and the header at 320px, 390px, and desktop widths. No Supabase changes were needed for this update.
