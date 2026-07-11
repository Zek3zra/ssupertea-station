"use strict";

const ORS_DIRECTIONS_URL =
  "https://api.heigit.org/openrouteservice/v2/directions/driving-car/geojson";

const DELIVERY_FEE_BLOCK_METERS = 300;
const DELIVERY_FEE_PER_BLOCK = 10;
const MAX_ITEM_LINES = 50;
const MAX_DELIVERY_ADDRESS_LENGTH = 500;
const ORS_TIMEOUT_MS = 15000;

const PHILIPPINES_BOUNDS = Object.freeze({
  minimumLatitude: 4.2,
  maximumLatitude: 21.5,
  minimumLongitude: 116.0,
  maximumLongitude: 127.5,
});

module.exports = async function createOrderHandler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");

  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");

    return response.status(405).json({
      code: "METHOD_NOT_ALLOWED",
      message: "Use POST to create an order.",
    });
  }

  if (!isSameOriginBrowserRequest(request)) {
    return response.status(403).json({
      code: "CROSS_ORIGIN_REQUEST_BLOCKED",
      message: "Cross-origin order requests are not allowed.",
    });
  }

  const configuration = getConfiguration();

  if (!configuration.ok) {
    return response.status(503).json({
      code: "ORDER_API_NOT_CONFIGURED",
      message: configuration.message,
    });
  }

  try {
    const accessToken = getBearerToken(request);

    if (!accessToken) {
      return response.status(401).json({
        code: "CUSTOMER_SESSION_REQUIRED",
        message: "A valid customer session is required.",
      });
    }

    const user = await verifyCustomerUser(
      configuration,
      accessToken
    );

    const body = parseRequestBody(request.body);
    const orderInput = validateOrderInput(body);

    const pricedOrder = await priceItems(
      configuration,
      orderInput.items
    );

    let routeDistanceMeters = null;
    let routeDurationSeconds = null;
    let deliveryFee = 0;

    if (orderInput.orderType === "delivery") {
      const route = await calculateRoute(
        configuration,
        orderInput.deliveryLatitude,
        orderInput.deliveryLongitude
      );

      routeDistanceMeters = Math.round(route.distance);
      routeDurationSeconds = Math.round(route.duration);
      deliveryFee = calculateDeliveryFee(
        routeDistanceMeters
      );
    }

    const itemsSubtotal = roundCurrency(
      Number(pricedOrder.total_price)
    );

    const totalPrice = roundCurrency(
      itemsSubtotal + deliveryFee
    );

    const databaseOrder = {
      id: orderInput.id,
      customer_name: orderInput.customerName,
      order_type: orderInput.orderType,
      items: pricedOrder.items,
      items_subtotal: itemsSubtotal,
      delivery_fee: deliveryFee,
      total_price: totalPrice,
      status: "pending",
      delivery_address: orderInput.deliveryAddress,
      delivery_lat: orderInput.deliveryLatitude,
      delivery_lng: orderInput.deliveryLongitude,
      route_distance_m: routeDistanceMeters,
      route_duration_s: routeDurationSeconds,
      customer_session_token: user.id,
    };

    const order = await insertOrder(
      configuration,
      databaseOrder,
      user.id
    );

    return response.status(201).json({
      order,
      fee_rule: {
        block_meters: DELIVERY_FEE_BLOCK_METERS,
        fee_per_block: DELIVERY_FEE_PER_BLOCK,
      },
    });
  } catch (error) {
    console.error("Create-order endpoint failed:", error);

    return response.status(
      Number(error?.statusCode) || 500
    ).json({
      code: error?.code || "CREATE_ORDER_FAILED",
      message:
        error?.publicMessage ||
        "The order could not be created.",
    });
  }
};

function getConfiguration() {
  const supabaseUrl = String(
    process.env.SUPABASE_URL || ""
  )
    .trim()
    .replace(/\/+$/, "");

  const publishableKey = String(
    process.env.SUPABASE_PUBLISHABLE_KEY || ""
  ).trim();

  const serviceRoleKey = String(
    process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  ).trim();

  const orsKey = String(
    process.env.OPENROUTESERVICE_API_KEY || ""
  ).trim();

  if (
    !supabaseUrl ||
    !publishableKey ||
    !serviceRoleKey ||
    !orsKey
  ) {
    return {
      ok: false,
      message:
        "SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY, and OPENROUTESERVICE_API_KEY must be configured in Vercel.",
    };
  }

  return {
    ok: true,
    supabaseUrl,
    publishableKey,
    serviceRoleKey,
    orsKey,
  };
}

function getBearerToken(request) {
  const authorization = String(
    request.headers?.authorization || ""
  ).trim();

  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || "";
}

async function verifyCustomerUser(configuration, accessToken) {
  const authResponse = await fetch(
    `${configuration.supabaseUrl}/auth/v1/user`,
    {
      headers: {
        apikey: configuration.publishableKey,
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  const user = await authResponse.json().catch(() => null);

  if (!authResponse.ok || !user?.id) {
    const error = new Error("Invalid customer session.");
    error.code = "CUSTOMER_SESSION_INVALID";
    error.statusCode = 401;
    error.publicMessage =
      "Your customer session expired. Refresh the page and try again.";
    throw error;
  }

  if (user.is_anonymous !== true) {
    const error = new Error("Customer session is not anonymous.");
    error.code = "CUSTOMER_SESSION_TYPE_INVALID";
    error.statusCode = 403;
    error.publicMessage =
      "This checkout requires an anonymous customer session.";
    throw error;
  }

  return user;
}

function validateOrderInput(value) {
  const id = String(value?.id || "").trim();
  const customerName = String(
    value?.customer_name || ""
  )
    .trim()
    .replace(/\s+/g, " ");

  const orderType =
    value?.order_type === "delivery"
      ? "delivery"
      : value?.order_type === "pickup"
        ? "pickup"
        : "";

  const items = Array.isArray(value?.items)
    ? value.items
    : [];

  if (!isUuid(id)) {
    throw publicError(
      "INVALID_ORDER_ID",
      400,
      "The order identifier is invalid."
    );
  }

  if (
    customerName.length < 2 ||
    customerName.length > 120
  ) {
    throw publicError(
      "INVALID_CUSTOMER_NAME",
      400,
      "Enter a customer name between 2 and 120 characters."
    );
  }

  if (!orderType) {
    throw publicError(
      "INVALID_ORDER_TYPE",
      400,
      "Choose pickup or delivery."
    );
  }

  if (
    items.length < 1 ||
    items.length > MAX_ITEM_LINES
  ) {
    throw publicError(
      "INVALID_ORDER_ITEMS",
      400,
      "The cart must contain between 1 and 50 customized items."
    );
  }

  let deliveryAddress = null;
  let deliveryLatitude = null;
  let deliveryLongitude = null;

  if (orderType === "delivery") {
    deliveryAddress = String(
      value?.delivery_address || ""
    )
      .trim()
      .replace(/\s+/g, " ");

    deliveryLatitude = Number(value?.delivery_lat);
    deliveryLongitude = Number(value?.delivery_lng);

    if (
      deliveryAddress.length < 5 ||
      deliveryAddress.length >
        MAX_DELIVERY_ADDRESS_LENGTH
    ) {
      throw publicError(
        "INVALID_DELIVERY_ADDRESS",
        400,
        "Enter a complete delivery address under 500 characters."
      );
    }

    if (
      !isPhilippineCoordinate(
        deliveryLatitude,
        deliveryLongitude
      )
    ) {
      throw publicError(
        "INVALID_DELIVERY_COORDINATES",
        400,
        "Select a valid delivery point within the Philippines."
      );
    }
  }

  return {
    id,
    customerName,
    orderType,
    items,
    deliveryAddress,
    deliveryLatitude,
    deliveryLongitude,
  };
}

async function priceItems(configuration, rawItems) {
  const response = await fetch(
    `${configuration.supabaseUrl}/rest/v1/rpc/price_customer_order`,
    {
      method: "POST",
      headers: serviceHeaders(configuration),
      body: JSON.stringify({
        raw_items: rawItems,
      }),
    }
  );

  const payload = await response.json().catch(() => null);

  if (
    !response.ok ||
    !payload ||
    !Array.isArray(payload.items) ||
    !Number.isFinite(Number(payload.total_price))
  ) {
    const error = new Error(
      payload?.message ||
      payload?.details ||
      "Unable to verify menu prices."
    );

    error.code = "ORDER_PRICING_FAILED";
    error.statusCode = 422;
    error.publicMessage =
      "One of the drinks or options is no longer available. Refresh the menu and try again.";
    throw error;
  }

  return payload;
}

async function calculateRoute(
  configuration,
  destinationLatitude,
  destinationLongitude
) {
  const shop = getShopLocation();
  const maximumRouteKm = parsePositiveNumber(
    process.env.SSUPERTEA_MAX_ROUTE_KM,
    50
  );

  const straightLineDistanceKm = haversineDistanceKm(
    shop.latitude,
    shop.longitude,
    destinationLatitude,
    destinationLongitude
  );

  if (straightLineDistanceKm > maximumRouteKm) {
    throw publicError(
      "DESTINATION_TOO_FAR",
      422,
      `The selected point is outside the ${maximumRouteKm} km delivery area.`
    );
  }

  const abortController = new AbortController();
  const timeoutId = setTimeout(
    () => abortController.abort(),
    ORS_TIMEOUT_MS
  );

  let response;

  try {
    response = await fetch(ORS_DIRECTIONS_URL, {
      method: "POST",
      headers: {
        Authorization: configuration.orsKey,
        "Content-Type": "application/json",
        Accept: "application/geo+json, application/json",
      },
      body: JSON.stringify({
        coordinates: [
          [shop.longitude, shop.latitude],
          [destinationLongitude, destinationLatitude],
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

  const payload = await response.json().catch(() => ({}));
  const summary =
    payload?.features?.[0]?.properties?.summary;

  if (
    !response.ok ||
    !Number.isFinite(Number(summary?.distance)) ||
    !Number.isFinite(Number(summary?.duration))
  ) {
    throw publicError(
      response.status === 429
        ? "ORS_RATE_LIMITED"
        : "ORS_ROUTE_FAILED",
      response.status === 429 ? 429 : 502,
      response.status === 429
        ? "The delivery route service is busy. Try again shortly."
        : "The delivery route could not be calculated."
    );
  }

  return {
    distance: Number(summary.distance),
    duration: Number(summary.duration),
  };
}

async function insertOrder(
  configuration,
  databaseOrder,
  customerUserId
) {
  const columns = [
    "id",
    "customer_name",
    "order_type",
    "items",
    "items_subtotal",
    "delivery_fee",
    "total_price",
    "status",
    "delivery_address",
    "delivery_lat",
    "delivery_lng",
    "route_distance_m",
    "route_duration_s",
    "customer_session_token",
    "created_at",
  ].join(",");

  const response = await fetch(
    `${configuration.supabaseUrl}/rest/v1/orders?select=${encodeURIComponent(columns)}`,
    {
      method: "POST",
      headers: {
        ...serviceHeaders(configuration),
        Prefer: "return=representation",
      },
      body: JSON.stringify(databaseOrder),
    }
  );

  const payload = await response.json().catch(() => null);

  if (response.ok && Array.isArray(payload) && payload[0]) {
    return payload[0];
  }

  if (response.status === 409) {
    const recovered = await recoverOrder(
      configuration,
      databaseOrder.id,
      customerUserId,
      columns
    );

    if (recovered) {
      return recovered;
    }
  }

  throw publicError(
    "ORDER_INSERT_FAILED",
    502,
    payload?.message ||
      payload?.details ||
      "The database rejected the order."
  );
}

async function recoverOrder(
  configuration,
  orderId,
  customerUserId,
  columns
) {
  const query = new URLSearchParams({
    select: columns,
    id: `eq.${orderId}`,
    customer_session_token: `eq.${customerUserId}`,
    limit: "1",
  });

  const response = await fetch(
    `${configuration.supabaseUrl}/rest/v1/orders?${query.toString()}`,
    {
      headers: serviceHeaders(configuration),
    }
  );

  const payload = await response.json().catch(() => null);

  return response.ok &&
    Array.isArray(payload) &&
    payload[0]
    ? payload[0]
    : null;
}

function serviceHeaders(configuration) {
  return {
    apikey: configuration.serviceRoleKey,
    Authorization:
      `Bearer ${configuration.serviceRoleKey}`,
    "Content-Type": "application/json",
  };
}

function getShopLocation() {
  const latitude = Number(
    process.env.SSUPERTEA_SHOP_LAT
  );

  const longitude = Number(
    process.env.SSUPERTEA_SHOP_LNG
  );

  if (!isPhilippineCoordinate(latitude, longitude)) {
    throw publicError(
      "INVALID_SHOP_LOCATION",
      503,
      "The Ssupertea shop coordinates are not configured correctly."
    );
  }

  return {
    latitude,
    longitude,
  };
}

function calculateDeliveryFee(distanceMeters) {
  if (
    !Number.isFinite(distanceMeters) ||
    distanceMeters <= 0
  ) {
    return 0;
  }

  return (
    Math.ceil(
      distanceMeters / DELIVERY_FEE_BLOCK_METERS
    ) * DELIVERY_FEE_PER_BLOCK
  );
}

function roundCurrency(value) {
  return Math.round(
    (Number(value) + Number.EPSILON) * 100
  ) / 100;
}

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

function publicError(code, statusCode, publicMessage) {
  const error = new Error(publicMessage);
  error.code = code;
  error.statusCode = statusCode;
  error.publicMessage = publicMessage;
  return error;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
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

  return Number.isFinite(numericValue) &&
    numericValue > 0
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
