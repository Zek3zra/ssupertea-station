# Ssupertea Station — Phase 3

This phase adds the complete customer menu and cart interface.

## Add or replace these files

- `index.html`
- `css/style.css`
- `js/app.js`
- `js/supabase-config.js`
- `sw.js`

## Important folder correction

`supabase-config.js` must be inside the `js` folder:

```text
js/
├── app.js
└── supabase-config.js
```

Delete the old root-level copy after moving it. The service worker and ES module
imports use `/js/supabase-config.js`.

## Run locally

Do not open `index.html` with a `file://` URL. Use a local HTTP server.

VS Code Live Server is suitable for development. Vercel will serve the same root
paths in deployment.

## Phase 3 features

- Mobile-first storefront
- Search and category filtering
- Drink customization
- Size, sugar, ice, and add-on pricing
- Persistent local cart
- Quantity and removal controls
- Toast notifications
- Install prompt support
- Updated service-worker app shell

Checkout submission, Google Places, delivery coordinates, and Supabase order
insertion are intentionally reserved for Phase 4.
