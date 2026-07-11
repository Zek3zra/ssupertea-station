# Ssupertea Station — Phase 5

Phase 5 adds secure distance-based delivery fees, automatic city/province
lookup, a cart rendering fix, and customer Realtime order tracking.

## Delivery fee rule

```text
Every started 300 meters of the ORS driving route = ₱10
```

Examples:

```text
1–300 m       = ₱10
301–600 m     = ₱20
601–900 m     = ₱30
1,201–1,500 m = ₱50
```

Both `/api/route` and `/api/create-order` calculate this rule. The secure order
endpoint recalculates the route and fee before inserting the order, so changing
the browser display does not change the database total.

## Files added

```text
api/create-order.js
api/reverse-geocode.js
sql/PHASE_5_DELIVERY_FEE_TRACKING.sql
sql/VERIFY_PHASE_5.sql
```

## Files replaced

```text
index.html
css/style.css
js/app.js
api/route.js
sw.js
vercel.json
.env.example
```

## Required Supabase step

Run:

```text
sql/PHASE_5_DELIVERY_FEE_TRACKING.sql
```

The migration adds:

```text
items_subtotal
delivery_fee
route_distance_m
route_duration_s
```

It removes direct customer inserts. Customers place orders through the secure
Vercel endpoint and retain read access to their own rows for Realtime tracking.

## Required Vercel variables

Keep the ORS and shop variables already configured, then add:

```text
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
```

Use the same Supabase Project URL and browser publishable key already present in
`js/supabase-config.js`.

Get the service-role key from Supabase Project Settings → API. Store it only in
Vercel. Never put it in browser JavaScript or commit it to Git.

Apply variables to Production, Preview, and Development, then redeploy.

## Automatic address behavior

After the customer:

- presses `Use current location`, or
- clicks/drags the map pin,

the app calls `/api/reverse-geocode` and fills:

```text
City or municipality
Province
```

The customer normally enters only:

```text
House number and purok
Optional landmark
```

If ORS cannot identify the city/province, the two fields unlock as a manual
fallback.

## Cart fix

The cart now uses both the HTML `hidden` property and an explicit `.is-hidden`
class. The service worker also loads `app.js` and `style.css` network-first so a
previous cached cart interface cannot remain active after deployment.

## Realtime tracking

Customers can track:

```text
Pending
Preparing
Dispatched / Ready for pickup
Completed
Cancelled
```

The tracking dialog:

- fetches the latest row through customer RLS
- subscribes to Supabase Postgres Changes for the saved order ID
- reconnects after network interruption
- restores tracking after reopening the PWA
- shows items, delivery fee, total, address, distance, and Google Maps route

Until the admin dashboard is built in Phases 6–7, update an order's `status`
manually in Supabase Table Editor to test live tracking.
