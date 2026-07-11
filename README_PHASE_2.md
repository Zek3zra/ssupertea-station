# Ssupertea Station — Phase 2

Files included:

- `supabase-config.js`
- `manifest.json`
- `sw.js`
- PWA icons in `assets/icons/`

## Required configuration

Open `js/supabase-config.js` and replace:

- `https://mugcifqtacilnfotzwaa.supabase.co`
- `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11Z2NpZnF0YWNpbG5mb3R6d2FhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM3NzM1NjEsImV4cCI6MjA5OTM0OTU2MX0.95efZITZi7Zjbg84LSmeIYhGRx3XyUPOlD6S4IHR3OM`

Use the Project URL and Publishable key from Supabase Project Settings → API.
Never expose the secret key or service_role key.

## Phase boundary

The customer interface is intentionally not included here. Phase 3 will create
`index.html`, `css/style.css`, and `js/app.js`, import this configuration module,
link the manifest, and render the menu/cart interface.
