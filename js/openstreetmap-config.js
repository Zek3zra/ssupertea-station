/**
 * Ssupertea Station map configuration.
 *
 * Leaflet + OpenStreetMap require no browser API key.
 * OpenRouteService requests go through /api/route so the ORS key remains
 * in the Vercel environment and is never shipped to the browser.
 */
export const OPENSTREETMAP_CONFIG = Object.freeze({
  leaflet: Object.freeze({
    version: "1.9.4",
    cssUrl: "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
    cssIntegrity:
      "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=",
    scriptUrl: "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
    scriptIntegrity:
      "sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=",
  }),

  tiles: Object.freeze({
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
    minimumZoom: 3,
    maximumZoom: 19,
  }),

  /*
   * Initial map view and public shop pin.
   * The server uses the same coordinates as the route origin.
   */
  defaultView: Object.freeze({
    latitude: 10.406125231986707,
    longitude: 122.9977403682195,
    zoom: 15,
  }),

  selectedLocationZoom: 17,

  routing: Object.freeze({
    endpoint: "/api/route",
    profile: "driving-car",
  }),
});
