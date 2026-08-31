# Ssupertea Station

A production-ready Progressive Web App for Ssupertea Station that handles customer ordering, staff order management, rider delivery workflows, realtime GPS tracking, and live delivery maps.

**Live production:** https://ssupertea-station.vercel.app

## Overview

Ssupertea Station is built as a lightweight web application using vanilla HTML, CSS, and JavaScript. Supabase provides authentication, PostgreSQL data storage, Row Level Security, RPC functions, and Realtime updates, while Vercel hosts the frontend and serverless API routes.

The system supports three main experiences:

- **Customer** — browse the storefront, customize items, place pickup or delivery orders, track order status, and view the rider on a live delivery map.
- **Admin** — manage orders, confirm orders, assign riders, monitor active deliveries, complete pickup orders, and view rider GPS status and live maps.
- **Rider** — view assigned deliveries, start and complete deliveries, share GPS while a delivery is active, view an in-app rider-to-customer map, and open Google Maps for turn-by-turn navigation.

> The products, menu entries, and prices currently shown in the frontend may include sample or demonstration data and should not be treated as the official Ssupertea Station menu.

## Core Features

### Customer ordering

- Public storefront can be browsed without signing in.
- Customers can customize products and build a cart before authentication.
- Sign-in is required before placing an order.
- Supports pickup and delivery orders.
- Delivery address and map location selection.
- Route-based delivery fee calculation.
- One unfinished order per customer at a time.
- Order tracking for pending, preparing, dispatched, completed, and cancelled states.

### Authentication and permissions

- Supabase Auth for customer, admin, and rider accounts.
- Email/password and Google authentication support.
- Unified account system with staff permissions controlling access.
- Staff capabilities include:
  - `can_manage_orders`
  - `can_deliver_orders`
- Protected Admin and Rider routes.
- Row Level Security protects customer, staff, assignment, order, and GPS data.

### Admin dashboard

- View and manage active orders.
- Confirm pending orders.
- Assign delivery orders to riders.
- Admin users with rider permission can assign deliveries to themselves.
- Monitor preparing and dispatched orders.
- Mark pickup orders ready and complete them.
- See rider GPS freshness and reported accuracy.
- Open an expandable live delivery map for dispatched delivery orders.

### Rider Mode

- Rider-specific workspace at `/rider.html`.
- Shows only deliveries assigned to the authenticated rider.
- Displays customer, order, delivery address, and route information.
- Start Delivery changes the delivery to `dispatched` and begins GPS sharing.
- Complete Delivery finishes the order and removes stored live GPS data.
- Google Maps remains available for turn-by-turn navigation.
- In-app Rider live map shows:
  - current rider position
  - customer destination
  - road route
  - remaining distance
  - estimated arrival time

## Realtime GPS Tracking

Realtime delivery tracking is built on Supabase Realtime and browser geolocation.

```text
Rider phone GPS
      ↓
Browser geolocation
      ↓
Secure Supabase RPC
      ↓
order_delivery_locations
      ↓
Supabase Realtime
   ↙      ↓      ↘
Customer Admin   Rider
```

Only the rider's **latest known location** is stored. The application does not keep a complete rider-location history.

### GPS update behavior

The rider client limits unnecessary writes while keeping movement responsive:

- minimum client write interval of approximately 5 seconds
- position updates when meaningful movement occurs
- periodic forced update even when movement is small
- server-side anti-flood protection

When the delivery is completed, the live GPS row is deleted automatically.

## Live Delivery Maps

Phase 8C provides live maps for all three delivery views.

### Customer map

Available while the customer's delivery is `dispatched` and rider GPS exists.

Shows:

- Ssupertea Station
- rider position
- customer destination
- road route
- remaining distance
- estimated arrival time
- GPS freshness and accuracy

### Admin map

Dispatched delivery cards provide **View live map** so maps do not permanently load inside every Admin card.

### Rider map

The Rider map focuses on:

```text
🛵 Rider
   ↓
road route
   ↓
📍 Customer
```

The rider marker can move as new GPS data arrives. Route and ETA recalculation is intentionally less frequent than GPS updates to reduce routing API usage.

## Routing and Maps

The project uses:

- **Leaflet 1.9.4** for interactive maps
- **OpenStreetMap** for street tiles
- **Esri** satellite basemap support
- **OpenRouteService** for driving routes and estimated travel time

The server-side routing API supports two separate purposes:

### Checkout routing

```text
Ssupertea Station → Customer
```

Used to calculate delivery distance, travel estimate, and delivery fee.

### Live tracking routing

```text
Current Rider Position → Customer
```

Used only for remaining distance and ETA. Tracking calculations do **not** recalculate or change the customer's original delivery fee.

## Delivery Workflow

```text
Customer places delivery order
            ↓
         Pending
            ↓
Admin confirms order
            ↓
        Preparing
            ↓
Admin assigns rider
            ↓
Rider taps Start Delivery
            ↓
       Dispatched
            ↓
Realtime GPS + live maps
            ↓
Rider completes delivery
            ↓
        Completed
            ↓
Stored live GPS is deleted
```

## Customer Cancellation Rules

- New pending orders have an initial cancellation lock period.
- Admin confirmation changes the order to preparing and locks customer cancellation.
- Pending orders can become customer-cancellable after the configured waiting period.
- Preparing and dispatched orders cannot be cancelled by the customer.

## Technology Stack

| Layer | Technology |
| --- | --- |
| Frontend | HTML5, CSS3, Vanilla JavaScript |
| Authentication | Supabase Auth |
| Database | Supabase PostgreSQL |
| Security | Supabase Row Level Security + SECURITY DEFINER RPCs |
| Realtime | Supabase Realtime |
| Maps | Leaflet + OpenStreetMap + Esri |
| Routing | OpenRouteService |
| API | Vercel Serverless Functions |
| Hosting | Vercel |
| PWA | Service Worker + Web App Manifest |

## Important Project Files

```text
/
├── index.html
├── admin.html
├── rider.html
├── auth-callback.html
├── manifest.json
├── sw.js
│
├── css/
│   ├── style.css
│   ├── account.css
│   └── staff.css
│
├── js/
│   ├── app.js
│   ├── account.js
│   ├── admin.js
│   ├── rider.js
│   ├── live-gps.js
│   ├── live-map.js
│   ├── rider-live-map.js
│   ├── staff-gate.js
│   ├── supabase-config.js
│   └── openstreetmap-config.js
│
├── api/
│   ├── route.js
│   ├── reverse-geocode.js
│   └── map-config.js
│
└── sql/
    └── database migrations and verification queries
```

## Environment Variables

Production secrets are configured in Vercel and are **not committed to the repository**.

Server-side environment variable names used by the project include:

```text
SUPABASE_URL
SUPABASE_SECRET_KEY
OPENROUTESERVICE_API_KEY
ARCGIS_API_KEY
SSUPERTEA_SHOP_LAT
SSUPERTEA_SHOP_LNG
SSUPERTEA_SHOP_NAME
SSUPERTEA_MAX_ROUTE_KM
```

Never commit secret keys, service-role credentials, OAuth client secrets, or private API credentials.

The Supabase browser publishable key and project URL are designed for client-side use; authorization of protected data is enforced by authentication and Row Level Security.

## Local Development

Because the project uses browser modules, PWA functionality, authentication callbacks, and serverless API endpoints, running it through a proper local web server is recommended instead of opening HTML files directly from the filesystem.

For full local behavior, configure the required environment variables and use a development environment compatible with the Vercel API routes.

## Security Design

The project follows several security rules:

- sensitive API credentials remain server-side
- staff access is permission-based
- direct browser writes to live GPS storage are blocked
- GPS updates go through a validated rider RPC
- only authorized customer, rider, and admin sessions can read applicable delivery location data
- GPS data exists only while required for an active dispatched delivery
- completion automatically removes the rider's stored live location
- routing endpoints validate request origin and geographic input

## Production Status

Current production functionality includes:

- customer storefront and cart
- authenticated ordering
- pickup and delivery workflows
- customer order tracking
- Admin order management
- rider assignment
- Rider Mode
- realtime GPS sharing
- Customer live delivery map
- Admin live delivery map
- Rider live delivery map
- remaining distance and ETA
- privacy cleanup on delivery completion
- PWA support

## Final Account and Staff Update

The account update adds the latest 20 orders to **My Orders**, a password recovery flow, and clearer Admin/Rider mode switching.

- Customer history and active-order lookups explicitly filter by the signed-in customer, including accounts that also have staff access.
- Signing out or switching accounts immediately clears old history; late responses cannot replace the new account's results.
- Failed history or password requests can be retried, and repeated reset clicks cannot submit duplicate requests.
- Password fields remain disabled until the account session is verified. A changed session blocks the password update.
- The callback accepts only safe local return paths and removes authorization codes from browser history. The PWA does not cache callback URLs containing codes.
- Successful password updates return to the login dialog with a confirmation message.

No new tables, database migrations, or staff permissions are required for this update.

Password recovery uses Supabase's PKCE flow. Open the email link in the **same browser** that requested it. The production callback URL must be allowed in Supabase Auth URL Configuration. See [Supabase password recovery](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail) and [redirect URL configuration](https://supabase.com/docs/guides/auth/redirect-urls).

### Regression checks

Run with Node.js:

```sh
node tests/final-functionality.test.cjs
```

The checks execute the feature code with simulated authentication, request timing, and DOM boundaries. They cover ownership filtering, sign-out/account-switch races, request failures, duplicate submissions, session changes, callback redirects, and offline page fallback. They do not send emails, change real passwords, or write to Supabase.

A full acceptance check still requires a real customer account and staff accounts: password reset email → callback → new password → sign-in; personal order history; Admin/Rider switching; and the existing delivery/GPS workflow.

## Customer Profiles and Checkout Contacts

Customers can save their full name and Philippine mobile number from **Profile**.
Checkout uses those details as defaults, while allowing a different recipient for
an individual order. **Save name and mobile to my profile** is an explicit action;
placing an order does not silently replace the saved profile.

In delivery checkout, select a map pin, complete the address, and choose **Save
this delivery address**. This saves one default address with house/purok, city,
province, optional landmark, and coordinates without placing an order. It is
reused when delivery checkout is opened, and **Use my saved address** restores it
after changes. The route and delivery fee are recalculated each time. Customers
can remove the saved address from Profile; past orders remain unchanged.

Every new pickup/delivery order requires a valid mobile number and stores it in
`orders.customer_phone`. Admin and the assigned rider see a click-to-call contact
on the orders they are already authorized to read. Old orders display **No
contact number recorded**. Profile edits do not rewrite past order contacts.

Database migration: `supabase/migrations/20260831151830_customer_profiles_and_order_contact.sql`.
This additive migration was applied to the existing production schema using the
Supabase connector; it is not a complete database bootstrap. It creates
`public.profiles`, backfills names for existing non-anonymous accounts, and adds
the nullable historical-order phone column. New accounts create their profile on
their first save, without adding a trigger that could disrupt Auth signup.

- Profile reads/inserts/updates are restricted to the owner using RLS, including
  both `USING` and `WITH CHECK` for updates. Anonymous sessions are blocked.
- Customer grants exclude deletion and managed timestamps. Profiles contain no
  passwords or staff roles; existing order/staff/GPS policies are unchanged.
- Name/mobile saves and address saves are partial updates, so one does not erase
  the other. Saved personal details are not placed in browser local storage.
- Account changes clear checkout fields and discard stale profile, map, and order
  responses. PWA cache **v23** includes the new modules.

Verification:

```sh
node tests/final-functionality.test.cjs
node tests/customer-profiles.test.cjs
```

These run 35 automated checks without sending email or writing real orders. The
owner-run `sql/VERIFY_CUSTOMER_PROFILES.sql` checks live profile ownership,
partial upserts, constraints, and anonymous access inside a rolled-back
transaction. Production verification should also include saving a real account's
profile, reusing/changing its delivery address, and checking the new order contact
in Admin and Rider Mode.

## Planned Improvements

Future work may include:

- improved email verification and account onboarding UX
- store ordering availability and catalog synchronization
- actual business menu, sold-out controls, and branding
- additional user-interface polish
- further monitoring and operational tools
- optional Capacitor/native-app packaging for stronger background mobile behavior

## Deployment

The production branch is:

```text
main
```

Vercel automatically deploys production changes from `main`.

Production URL:

https://ssupertea-station.vercel.app

---

**Ssupertea Station** — ordering, staff operations, rider delivery, and realtime tracking in one lightweight PWA.
