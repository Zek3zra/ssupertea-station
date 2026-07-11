"use strict";

const ORS_REVERSE_URL =
  "https://api.heigit.org/pelias/v1/reverse";

const PHILIPPINES_BOUNDS = Object.freeze({
  minimumLatitude: 4.2,
  maximumLatitude: 21.5,
  minimumLongitude: 116.0,
  maximumLongitude: 127.5,
});

module.exports = async function reverseGeocodeHandler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");

  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");

    return response.status(405).json({
      code: "METHOD_NOT_ALLOWED",
      message: "Use POST for reverse-geocoding requests.",
    });
  }

  if (!isSameOriginBrowserRequest(request)) {
    return response.status(403).json({
      code: "CROSS_ORIGIN_REQUEST_BLOCKED",
      message: "Cross-origin requests are not allowed.",
    });
  }

  const apiKey = String(
    process.env.OPENROUTESERVICE_API_KEY || ""
  ).trim();

  if (!apiKey) {
    return response.status(503).json({
      code: "ORS_NOT_CONFIGURED",
      message:
        "OPENROUTESERVICE_API_KEY is missing from the Vercel environment.",
    });
  }

  try {
    const body = parseRequestBody(request.body);
    const latitude = Number(body?.latitude);
    const longitude = Number(body?.longitude);

    if (!isPhilippineCoordinate(latitude, longitude)) {
      return response.status(400).json({
        code: "INVALID_COORDINATES",
        message: "Select a valid point within the Philippines.",
      });
    }

    const query = new URLSearchParams({
      api_key: apiKey,
      "point.lat": String(latitude),
      "point.lon": String(longitude),
      size: "1",
      "boundary.country": "PH",
    });

    const orsResponse = await fetch(
      `${ORS_REVERSE_URL}?${query.toString()}`,
      {
        headers: {
          Accept: "application/geo+json, application/json",
        },
      }
    );

    const payload = await orsResponse.json().catch(() => ({}));

    if (!orsResponse.ok) {
      return response.status(
        orsResponse.status === 429 ? 429 : 502
      ).json({
        code:
          orsResponse.status === 429
            ? "ORS_RATE_LIMITED"
            : "ORS_REVERSE_GEOCODE_FAILED",
        message:
          payload?.error?.message ||
          payload?.message ||
          "The selected location could not be identified.",
      });
    }

    const feature = payload?.features?.[0];
    const properties = feature?.properties || {};

    const city = firstText(
      properties.locality,
      properties.localadmin,
      properties.borough,
      properties.county
    );

    const province = firstText(
      properties.region,
      properties.macroregion,
      properties.county
    );

    if (!city || !province) {
      return response.status(422).json({
        code: "INCOMPLETE_ADDRESS",
        message:
          "The map service could not determine both the city and province.",
      });
    }

    return response.status(200).json({
      city,
      province,
      barangay: firstText(
        properties.neighbourhood,
        properties.borough,
        properties.localadmin
      ),
      label: firstText(properties.label, properties.name),
      source: "openrouteservice-pelias",
    });
  } catch (error) {
    console.error("Reverse-geocoding endpoint failed:", error);

    return response.status(500).json({
      code: "REVERSE_GEOCODE_ENDPOINT_FAILED",
      message: "The selected location could not be identified.",
    });
  }
};

function parseRequestBody(value) {
  if (!value) {
    return {};
  }

  if (typeof value === "object") {
    return value;
  }

  if (typeof value === "string") {
    return JSON.parse(value);
  }

  return {};
}

function firstText(...values) {
  for (const value of values) {
    const normalized = String(value || "").trim();

    if (normalized) {
      return normalized;
    }
  }

  return "";
}

function isPhilippineCoordinate(latitude, longitude) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= PHILIPPINES_BOUNDS.minimumLatitude &&
    latitude <= PHILIPPINES_BOUNDS.maximumLatitude &&
    longitude >= PHILIPPINES_BOUNDS.minimumLongitude &&
    longitude <= PHILIPPINES_BOUNDS.maximumLongitude
  );
}

function isSameOriginBrowserRequest(request) {
  const origin = String(request.headers?.origin || "").trim();

  if (!origin) {
    return true;
  }

  const forwardedHost = String(
    request.headers?.["x-forwarded-host"] ||
    request.headers?.host ||
    ""
  )
    .split(",")[0]
    .trim();

  if (!forwardedHost) {
    return false;
  }

  try {
    return new URL(origin).host === forwardedHost;
  } catch {
    return false;
  }
}
