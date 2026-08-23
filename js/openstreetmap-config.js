/**
 * Ssupertea Station 2D map configuration.
 *
 * Street view stays on Leaflet + OpenStreetMap.
 * Satellite and Satellite + Labels use Esri/ArcGIS World Imagery.
 *
 * The ArcGIS API key is configured in Vercel as ARCGIS_API_KEY and
 * returned to the browser through /api/map-config. Browser map keys are
 * visible by nature, so protect the ArcGIS credential with allowed
 * referrers and only the Basemaps privilege.
 *
 * No map rotation, bearing, or 3D is used.
 */
export const OPENSTREETMAP_CONFIG = Object.freeze({
  leaflet: Object.freeze({
    version: "1.9.4",
    cssUrl:
      "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
    cssIntegrity:
      "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=",
    scriptUrl:
      "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
    scriptIntegrity:
      "sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=",
  }),

  tiles: Object.freeze({
    url:
      "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
    minimumZoom: 3,
    maximumZoom: 19,
  }),


  esri: Object.freeze({
    configEndpoint:
      "/api/map-config",
    coreScriptUrl:
      "https://unpkg.com/esri-leaflet@3.0.19/dist/esri-leaflet.js",
    staticBasemapScriptUrl:
      "https://unpkg.com/esri-leaflet-static-basemap-tile@1.1.1/dist/esri-leaflet-static-basemap-tile.js",
    imageryServiceUrl:
      "https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer",
    labelsStyle:
      "arcgis/imagery/labels",
    minimumZoom:
      1,
    maximumZoom:
      20,
  }),

  defaultView: Object.freeze({
    latitude:
      10.406125231986707,
    longitude:
      122.9977403682195,
    zoom:
      15,
  }),

  selectedLocationZoom:
    17,

  routing: Object.freeze({
    endpoint:
      "/api/route",
    profile:
      "driving-car",
  }),
});
