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
      message: "Use GET for map configuration.",
    });
  }

  const key = String(
    process.env.MAPTILER_PUBLIC_KEY || ""
  ).trim();

  return response.status(200).json({
    satellite_enabled:
      Boolean(key),
    maptiler_public_key: key || null,
    styles: {
      satellite: "satellite-v4",
      hybrid: "hybrid-v4",
    },
  });
};
