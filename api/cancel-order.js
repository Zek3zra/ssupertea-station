"use strict";

module.exports = async function cancelOrderHandler(
  request,
  response
) {
  response.setHeader(
    "Cache-Control",
    "no-store"
  );
  response.setHeader(
    "X-Content-Type-Options",
    "nosniff"
  );

  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({
      code: "METHOD_NOT_ALLOWED",
      message: "Use POST to cancel an order.",
    });
  }

  if (!isSameOriginBrowserRequest(request)) {
    return response.status(403).json({
      code: "CROSS_ORIGIN_REQUEST_BLOCKED",
      message: "Cross-origin cancellation requests are not allowed.",
    });
  }

  const configuration =
    getConfiguration();

  if (!configuration.ok) {
    return response.status(503).json({
      code:
        "CANCEL_API_NOT_CONFIGURED",
      message:
        configuration.message,
    });
  }

  try {
    const accessToken =
      getBearerToken(request);

    if (!accessToken) {
      throw publicError(
        "CUSTOMER_ACCOUNT_REQUIRED",
        401,
        "Sign in before cancelling an order."
      );
    }

    const user =
      await verifyPermanentUser(
        configuration,
        accessToken
      );

    const body =
      parseRequestBody(request.body);

    const orderId =
      String(
        body?.order_id || ""
      ).trim();

    if (!isUuid(orderId)) {
      throw publicError(
        "INVALID_ORDER_ID",
        400,
        "The order identifier is invalid."
      );
    }

    const rpcResponse = await fetch(
      `${configuration.supabaseUrl}/rest/v1/rpc/cancel_customer_order`,
      {
        method: "POST",
        headers:
          serviceHeaders(
            configuration
          ),
        body: JSON.stringify({
          p_order_id: orderId,
          p_customer_user_id:
            user.id,
        }),
      }
    );

    const payload =
      await rpcResponse
        .json()
        .catch(() => null);

    if (
      rpcResponse.ok &&
      payload
    ) {
      const order =
        Array.isArray(payload)
          ? payload[0]
          : payload;

      return response.status(200).json({
        order,
      });
    }

    const message =
      payload?.message ||
      payload?.details ||
      "The order could not be cancelled.";

    if (
      /waiting period|10 minutes|not yet available/i
        .test(message)
    ) {
      throw publicError(
        "ORDER_CANCELLATION_WAIT",
        409,
        "Cancellation becomes available only after the order has remained pending for 10 minutes."
      );
    }

    if (
      /preparing|dispatched|completed|cancelled|cancellation locked/i
        .test(message)
    ) {
      throw publicError(
        "ORDER_CANCELLATION_LOCKED",
        409,
        "This order can no longer be cancelled because the store has already confirmed it."
      );
    }

    if (
      /not found|owner/i.test(message)
    ) {
      throw publicError(
        "ORDER_NOT_FOUND",
        404,
        "The order could not be found."
      );
    }

    throw publicError(
      "ORDER_CANCEL_FAILED",
      502,
      message
    );
  } catch (error) {
    console.error(
      "Cancel-order endpoint failed:",
      error
    );

    return response.status(
      Number(error?.statusCode) ||
      500
    ).json({
      code:
        error?.code ||
        "CANCEL_ORDER_FAILED",
      message:
        error?.publicMessage ||
        "The order could not be cancelled.",
    });
  }
};

function getConfiguration() {
  const supabaseUrl =
    String(
      process.env.SUPABASE_URL || ""
    )
      .trim()
      .replace(/\/+$/, "");

  const serverKey =
    String(
      process.env.SUPABASE_SECRET_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      ""
    ).trim();

  if (
    !supabaseUrl ||
    !serverKey
  ) {
    return {
      ok: false,
      message:
        "SUPABASE_URL and a Supabase server key are required.",
    };
  }

  return {
    ok: true,
    supabaseUrl,
    serverKey,
  };
}

function getBearerToken(request) {
  const authorization =
    String(
      request.headers?.authorization ||
      ""
    ).trim();

  const match =
    authorization.match(
      /^Bearer\s+(.+)$/i
    );

  return match?.[1] || "";
}

async function verifyPermanentUser(
  configuration,
  accessToken
) {
  const authResponse =
    await fetch(
      `${configuration.supabaseUrl}/auth/v1/user`,
      {
        headers: {
          apikey:
            configuration.serverKey,
          Authorization:
            `Bearer ${accessToken}`,
        },
      }
    );

  const user =
    await authResponse
      .json()
      .catch(() => null);

  if (
    !authResponse.ok ||
    !user?.id
  ) {
    throw publicError(
      "CUSTOMER_SESSION_INVALID",
      401,
      "Your account session could not be verified."
    );
  }

  if (user.is_anonymous === true) {
    throw publicError(
      "CUSTOMER_ACCOUNT_REQUIRED",
      403,
      "A permanent Ssupertea account is required."
    );
  }

  return user;
}

function serviceHeaders(configuration) {
  const headers = {
    apikey:
      configuration.serverKey,
    "Content-Type":
      "application/json",
  };

  if (
    configuration.serverKey
      .startsWith("eyJ")
  ) {
    headers.Authorization =
      `Bearer ${configuration.serverKey}`;
  }

  return headers;
}

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
      return {};
    }
  }

  return {};
}

function isSameOriginBrowserRequest(request) {
  const origin =
    String(
      request.headers?.origin || ""
    ).trim();

  if (!origin) {
    return true;
  }

  const host =
    String(
      request.headers?.["x-forwarded-host"] ||
      request.headers?.host ||
      ""
    )
      .split(",")[0]
      .trim();

  if (!host) {
    return false;
  }

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function publicError(
  code,
  statusCode,
  publicMessage
) {
  const error =
    new Error(publicMessage);

  error.code = code;
  error.statusCode =
    statusCode;
  error.publicMessage =
    publicMessage;

  return error;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}
