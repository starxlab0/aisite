function requireSignalsIngest(req) {
  const expected = process.env.SIGNALS_INGEST_TOKEN || process.env.OPS_ADMIN_TOKEN;
  if (!expected) {
    return {
      ok: false,
      statusCode: 500,
      message: "SIGNALS_INGEST_TOKEN (or OPS_ADMIN_TOKEN) is not configured on server",
    };
  }

  const token = req.headers["x-signals-token"] || req.headers["x-ops-admin-token"];
  if (!token || token !== expected) {
    return {
      ok: false,
      statusCode: 401,
      message: "Unauthorized",
    };
  }

  return { ok: true };
}

module.exports = {
  requireSignalsIngest,
};

