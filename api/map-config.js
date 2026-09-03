"use strict";

module.exports = async function mapConfigHandler(
  request,
  response
) {
  response.setHeader(
    "Cache-Control",
    "private, max-age=300"
  );

  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");

    return response.status(405).json({
      code: "METHOD_NOT_ALLOWED",
      message:
        "Use GET for map configuration.",
    });
  }

  
  const key = String(
    process.env.ARCGIS_API_KEY ||
    process.env.ESRI_API_KEY ||
    ""
  ).trim();

  return response.status(200).json({
    satellite_enabled:
      Boolean(key),
    provider:
      "esri",
    arcgis_api_key:
      key || null,
  });
};
