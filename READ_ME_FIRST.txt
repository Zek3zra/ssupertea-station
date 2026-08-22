# PHASE 6 MINIMAL UPDATE

This ZIP contains only the NEW or CHANGED Phase 6 files.

## Do this

1. Run:
   sql/PHASE_6_UNIFIED_ACCOUNTS.sql

2. Optional verification:
   sql/VERIFY_PHASE_6.sql

3. Copy the remaining files over your WORKING Phase 5.1 project.
   Keep unchanged files/folders such as:
   - assets/
   - css/style.css
   - api/route.js
   - api/reverse-geocode.js
   - manifest.json

4. For Satellite + Satellite with labels, add this Vercel Environment Variable:
   MAPTILER_PUBLIC_KEY

5. Redeploy Vercel.

6. Clear site data once on your test browser because Phase 6 moves customers
   from anonymous Supabase Auth to permanent Google/email accounts.

## Map modes

Street:
- Leaflet + OpenStreetMap
- no extra key

Satellite:
- Leaflet + MapTiler Satellite

Satellite + Labels:
- Leaflet + MapTiler Hybrid

The map remains 2D, north-up, and has no rotation or 3D.
