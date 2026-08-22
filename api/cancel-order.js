"use strict";

module.exports = async function cancelOrderHandler(request, response) {
  response.setHeader("Cache-Control", "no-store");

  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({
      error: "METHOD_NOT_ALLOWED",
      message: "Use POST for this endpoint.",
    });
  }

  return response.status(403).json({
    error: "CUSTOMER_CANCELLATION_DISABLED",
    code: "CUSTOMER_CANCELLATION_DISABLED",
    message:
      "Orders cannot be cancelled by customers after they are placed. Please contact the store if assistance is needed.",
  });
};
