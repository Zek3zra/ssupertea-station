"use strict";

const ORS_DIRECTIONS_URL =
  "https://api.heigit.org/openrouteservice/v2/directions/driving-car/geojson";

const DEFAULT_SHOP = Object.freeze({
  name: "Ssupertea Station",
  latitude: 10.406125231986707,
  longitude: 122.9977403682195,
});

const PHILIPPINES_BOUNDS = Object.freeze({
  minimumLatitude: 4.2,
  maximumLatitude: 21.5,
  minimumLongitude: 116.0,
  maximumLongitude: 127.5,
});

const DEFAULT_MAX_ROUTE_KM = 50;
const ORS_TIMEOUT_MS = 15000;
const DELIVERY_FEE_BLOCK_METERS = 300;
const DELIVERY_FEE_PER_BLOCK = 10;

module.exports = async function routeHandler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");

  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");

    return response.status(405).json({
      code: "METHOD_NOT_ALLOWED",
      message: "Use POST for route requests.",
    });
  }

  if (!isSameOriginBrowserRequest(request)) {
    return response.status(403).json({
      code: "CROSS_ORIGIN_REQUEST_BLOCKED",
      message: "Cross-origin route requests are not allowed.",
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
    const destination = parseDestination(body?.destination);
    const shop = getShopLocation();
    const maximumRouteKm = parsePositiveNumber(
      process.env.SSUPERTEA_MAX_ROUTE_KM,
      DEFAULT_MAX_ROUTE_KM
    );

    const straightLineDistanceKm = haversineDistanceKm(
      shop.latitude,
      shop.longitude,
      destination.latitude,
      destination.longitude
    );

    if (straightLineDistanceKm > maximumRouteKm) {
      return response.status(422).json({
        code: "DESTINATION_TOO_FAR",
        message:
          `The selected point is outside the ${maximumRouteKm} km delivery area.`,
      });
    }

    const abortController = new AbortController();
    const timeoutId = setTimeout(
      () => abortController.abort(),
      ORS_TIMEOUT_MS
    );

    let orsResponse;

    try {
      orsResponse = await fetch(ORS_DIRECTIONS_URL, {
        method: "POST",
        headers: {
          Authorization: apiKey,
          "Content-Type": "application/json",
          Accept: "application/geo+json, application/json",
        },
        body: JSON.stringify({
          coordinates: [
            [shop.longitude, shop.latitude],
            [destination.longitude, destination.latitude],
          ],
          instructions: false,
          elevation: false,
          radiuses: [1000, 1000],
        }),
        signal: abortController.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    const routePayload =
      await orsResponse.json().catch(() => ({}));

    if (!orsResponse.ok) {
      const upstreamMessage =
        routePayload?.error?.message ||
        routePayload?.message ||
        "OpenRouteService could not calculate the route.";

      if (orsResponse.status === 401) {
        return response.status(502).json({
          code: "ORS_INVALID_KEY",
          message:
            "OpenRouteService rejected the configured API key.",
        });
      }

      if (orsResponse.status === 403) {
        return response.status(429).json({
          code: "ORS_DAILY_QUOTA_REACHED",
          message:
            "The OpenRouteService daily quota has been reached.",
        });
      }

      if (orsResponse.status === 429) {
        return response.status(429).json({
          code: "ORS_RATE_LIMITED",
          message:
            "Too many route requests were sent. Try again shortly.",
        });
      }

      return response.status(502).json({
        code: "ORS_ROUTE_FAILED",
        message: upstreamMessage,
      });
    }

    const routeFeature = routePayload?.features?.[0];
    const summary = routeFeature?.properties?.summary;

    if (
      !routeFeature ||
      routeFeature.type !== "Feature" ||
      !Number.isFinite(Number(summary?.distance)) ||
      !Number.isFinite(Number(summary?.duration))
    ) {
      return response.status(502).json({
        code: "ORS_INVALID_RESPONSE",
        message:
          "OpenRouteService returned an incomplete route.",
      });
    }

    const distanceMeters = Number(summary.distance);
    const durationSeconds = Number(summary.duration);
    const deliveryFee = calculateDeliveryFee(distanceMeters);

    return response.status(200).json({
      shop,
      destination,
      summary: {
        distance: distanceMeters,
        duration: durationSeconds,
        delivery_fee: deliveryFee,
        fee_block_meters: DELIVERY_FEE_BLOCK_METERS,
        fee_per_block: DELIVERY_FEE_PER_BLOCK,
      },
      route: routeFeature,
      attribution:
        "Route data © openrouteservice.org by HeiGIT; map data © OpenStreetMap contributors.",
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      return response.status(504).json({
        code: "ORS_TIMEOUT",
        message:
          "OpenRouteService took too long to respond.",
      });
    }

    console.error("Route endpoint failed:", error);

    return response.status(
      Number(error?.statusCode) || 500
    ).json({
      code: error?.code || "ROUTE_ENDPOINT_FAILED",
      message:
        error?.publicMessage ||
        "The delivery route could not be calculated.",
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
    try {
      return JSON.parse(value);
    } catch {
      const error = new Error("Invalid JSON request body.");
      error.code = "INVALID_JSON";
      error.statusCode = 400;
      error.publicMessage =
        "The route request body is not valid JSON.";
      throw error;
    }
  }

  return {};
}

function isSameOriginBrowserRequest(request) {
  const origin = String(request.headers?.origin || "").trim();

  /*
   * Server-side tools and local Vercel testing may omit Origin.
   * Browser requests with an Origin must match the current deployment host.
   */
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

function getShopLocation() {
  const configuredLatitude = Number(
    process.env.SSUPERTEA_SHOP_LAT
  );

  const configuredLongitude = Number(
    process.env.SSUPERTEA_SHOP_LNG
  );

  const latitude = Number.isFinite(configuredLatitude)
    ? configuredLatitude
    : DEFAULT_SHOP.latitude;

  const longitude = Number.isFinite(configuredLongitude)
    ? configuredLongitude
    : DEFAULT_SHOP.longitude;

  if (!isPhilippineCoordinate(latitude, longitude)) {
    const error = new Error("Invalid shop coordinates.");
    error.code = "INVALID_SHOP_LOCATION";
    error.statusCode = 503;
    error.publicMessage =
      "The configured Ssupertea shop coordinates are invalid.";
    throw error;
  }

  return {
    name: String(
      process.env.SSUPERTEA_SHOP_NAME ||
      DEFAULT_SHOP.name
    ).trim(),
    latitude,
    longitude,
  };
}

function parseDestination(value) {
  const latitude = Number(value?.latitude);
  const longitude = Number(value?.longitude);

  if (!isPhilippineCoordinate(latitude, longitude)) {
    const error = new Error(
      "Invalid Philippine destination coordinates."
    );

    error.code = "INVALID_DESTINATION";
    error.statusCode = 400;
    error.publicMessage =
      "Select a valid delivery point within the Philippines.";

    throw error;
  }

  return {
    latitude,
    longitude,
  };
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

function parsePositiveNumber(value, fallback) {
  const numericValue = Number(value);

  return Number.isFinite(numericValue) && numericValue > 0
    ? numericValue
    : fallback;
}

function haversineDistanceKm(
  startLatitude,
  startLongitude,
  endLatitude,
  endLongitude
) {
  const earthRadiusKm = 6371;
  const toRadians = (degrees) =>
    (degrees * Math.PI) / 180;

  const latitudeDelta = toRadians(
    endLatitude - startLatitude
  );

  const longitudeDelta = toRadians(
    endLongitude - startLongitude
  );

  const startLatitudeRadians =
    toRadians(startLatitude);

  const endLatitudeRadians =
    toRadians(endLatitude);

  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(startLatitudeRadians) *
      Math.cos(endLatitudeRadians) *
      Math.sin(longitudeDelta / 2) ** 2;

  return (
    2 *
    earthRadiusKm *
    Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  );
}


function calculateDeliveryFee(distanceMeters) {
  const safeDistance = Number(distanceMeters);

  if (!Number.isFinite(safeDistance) || safeDistance <= 0) {
    return 0;
  }

  return (
    Math.ceil(safeDistance / DELIVERY_FEE_BLOCK_METERS) *
    DELIVERY_FEE_PER_BLOCK
  );
}
