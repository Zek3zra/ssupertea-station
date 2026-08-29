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

## Planned Improvements

Future work may include:

- customer profile management
- improved email verification and account onboarding UX
- saved customer addresses
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
