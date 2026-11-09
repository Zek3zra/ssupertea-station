"use strict";

// A server-side ceiling: an old deployment variable (for example 50 km)
// must never enlarge the store's three-kilometer delivery area.
const MAX_DELIVERY_KM = 3;

function getDeliveryLimitKm(configuredKm) {
  const configured = Number(configuredKm);
  return Number.isFinite(configured) && configured > 0
    ? Math.min(configured, MAX_DELIVERY_KM) : MAX_DELIVERY_KM;
}

function isValidRouteSummary(summary) {
  return summary?.distance != null && summary?.duration != null &&
    summary.distance !== "" && summary.duration !== "" &&
    Number.isFinite(Number(summary.distance)) && Number(summary.distance) >= 0 &&
    Number.isFinite(Number(summary.duration)) && Number(summary.duration) >= 0;
}

function calculateDeliveryFee(distanceMeters) {
  return Number.isFinite(distanceMeters) && distanceMeters > 0
    ? Math.ceil(distanceMeters / 300) * 10 : 0;
}

module.exports = { getDeliveryLimitKm, isValidRouteSummary, calculateDeliveryFee };
