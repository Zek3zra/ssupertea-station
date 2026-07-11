# Ssupertea Station — Final ORS Setup

## Security first

The OpenRouteService key is intentionally not included in this package.
Store it only in Vercel Environment Variables.

Because an API credential was pasted into chat, generate a replacement key
before production and use the replacement value in Vercel.

## Exact project structure

```text
project/
├── api/
│   └── route.js
├── assets/
│   └── icons/
├── css/
│   └── style.css
├── js/
│   ├── app.js
│   ├── openstreetmap-config.js
│   └── supabase-config.js
├── sql/
│   ├── FINAL_DATABASE_SECURITY_REVIEW.sql
│   └── VERIFY_DATABASE_SETUP.sql
├── .env.example
├── .gitignore
├── index.html
├── manifest.json
├── sw.js
└── vercel.json
```

Keep your existing `assets/icons` directory.

## Vercel variables

Add these under:

```text
Vercel → Project → Settings → Environment Variables
```

```text
OPENROUTESERVICE_API_KEY=<paste the replacement ORS key>
SSUPERTEA_SHOP_LAT=10.406125231986707
SSUPERTEA_SHOP_LNG=122.9977403682195
SSUPERTEA_SHOP_NAME=Ssupertea Station
SSUPERTEA_MAX_ROUTE_KM=50
```

Apply them to Production, Preview, and Development, then redeploy.

## Supabase anonymous authentication

Enable both:

```text
Authentication → Settings
Allow new users to sign up: ON
Allow anonymous sign-ins: ON
```

Then run:

```text
sql/FINAL_DATABASE_SECURITY_REVIEW.sql
```

The SQL changes staff authorization to an explicit `staff_users` allowlist, so
turning on account creation does not make new permanent users administrators.

## Test

1. Deploy to Vercel.
2. Add a drink and choose Delivery.
3. Press `Choose location on map`.
4. Place or drag the delivery pin.
5. Confirm the route line, distance, and estimated driving time appear.
6. Press the Google Maps button to open external navigation.
7. Place the order.
8. Confirm a new row appears in `public.orders`.

Use the browser Network panel to inspect `/api/route`. A successful request
returns HTTP 200.
