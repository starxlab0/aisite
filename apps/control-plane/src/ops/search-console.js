const crypto = require("crypto");

function normalizeMultilineSecret(value) {
  return String(value || "").replace(/\\n/g, "\n").trim();
}

function base64UrlEncode(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function todayDateKey() {
  return new Date().toISOString().slice(0, 10);
}

function shiftDateKey(dateKey, deltaDays) {
  const base = new Date(`${dateKey}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + deltaDays);
  return base.toISOString().slice(0, 10);
}

function parsePositiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function getSearchConsoleConfig(env = process.env) {
  const siteUrl = String(env.SEARCH_CONSOLE_SITE_URL || "").trim();
  const clientEmail = String(env.SEARCH_CONSOLE_SERVICE_ACCOUNT_EMAIL || "").trim();
  const privateKey = normalizeMultilineSecret(env.SEARCH_CONSOLE_PRIVATE_KEY || "");
  const tokenUri = String(env.SEARCH_CONSOLE_TOKEN_URI || "https://oauth2.googleapis.com/token").trim();
  const missing = [
    !siteUrl ? "SEARCH_CONSOLE_SITE_URL" : null,
    !clientEmail ? "SEARCH_CONSOLE_SERVICE_ACCOUNT_EMAIL" : null,
    !privateKey ? "SEARCH_CONSOLE_PRIVATE_KEY" : null,
  ].filter(Boolean);
  const configured = Boolean(siteUrl && clientEmail && privateKey);
  return {
    siteUrl,
    clientEmail,
    privateKey,
    tokenUri,
    configured,
    missing,
  };
}

function resolveSearchConsoleRequest(overrides = {}, env = process.env) {
  const config = getSearchConsoleConfig(env);
  const lagDays = parsePositiveInt(overrides.dataLagDays ?? env.SEARCH_CONSOLE_DATA_LAG_DAYS, 2);
  const rangeDays = parsePositiveInt(overrides.rangeDays ?? env.SEARCH_CONSOLE_RANGE_DAYS, 1);
  const endDate = String(overrides.endDate || "").trim() || shiftDateKey(todayDateKey(), -lagDays);
  const startDate = String(overrides.startDate || "").trim() || shiftDateKey(endDate, -(rangeDays - 1));
  const dimensions = Array.isArray(overrides.dimensions)
    ? overrides.dimensions.filter(Boolean)
    : String(env.SEARCH_CONSOLE_DIMENSIONS || "page,query,date")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
  return {
    siteUrl: String(overrides.siteUrl || config.siteUrl || "").trim(),
    startDate,
    endDate,
    dimensions: dimensions.length ? dimensions : ["page", "query", "date"],
    rowLimit: parsePositiveInt(overrides.rowLimit ?? env.SEARCH_CONSOLE_ROW_LIMIT, 250),
    searchType: String(overrides.searchType || env.SEARCH_CONSOLE_SEARCH_TYPE || "web").trim() || "web",
    dataState: String(overrides.dataState || env.SEARCH_CONSOLE_DATA_STATE || "final").trim() || "final",
    aggregationType: String(overrides.aggregationType || env.SEARCH_CONSOLE_AGGREGATION_TYPE || "auto").trim() || "auto",
  };
}

function assertSearchConsoleConfigured(config) {
  if (!config.siteUrl) throw new Error("Missing `SEARCH_CONSOLE_SITE_URL`.");
  if (!config.clientEmail) throw new Error("Missing `SEARCH_CONSOLE_SERVICE_ACCOUNT_EMAIL`.");
  if (!config.privateKey) throw new Error("Missing `SEARCH_CONSOLE_PRIVATE_KEY`.");
}

function buildServiceAccountAssertion({ clientEmail, privateKey, tokenUri, nowSeconds } = {}) {
  const scope = "https://www.googleapis.com/auth/webmasters.readonly";
  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64UrlEncode(
    JSON.stringify({
      iss: clientEmail,
      scope,
      aud: tokenUri,
      exp: nowSeconds + 3600,
      iat: nowSeconds,
    }),
  );
  const unsigned = `${header}.${payload}`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(unsigned), privateKey);
  return `${unsigned}.${base64UrlEncode(signature)}`;
}

async function exchangeServiceAccountAccessToken(config) {
  assertSearchConsoleConfigured(config);
  const assertion = buildServiceAccountAssertion({
    clientEmail: config.clientEmail,
    privateKey: config.privateKey,
    tokenUri: config.tokenUri,
    nowSeconds: Math.floor(Date.now() / 1000),
  });
  const response = await fetch(config.tokenUri, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }).toString(),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google OAuth ${response.status}: ${text.slice(0, 200)}`);
  }
  const payload = await response.json();
  const accessToken = String(payload?.access_token || "").trim();
  if (!accessToken) {
    throw new Error("Google OAuth response did not include `access_token`.");
  }
  return accessToken;
}

function mapSearchAnalyticsRows(apiRows = [], dimensions = []) {
  const items = Array.isArray(apiRows) ? apiRows : [];
  return items.map((row) => {
    const keys = Array.isArray(row?.keys) ? row.keys : [];
    const record = {};
    dimensions.forEach((dimension, index) => {
      record[dimension] = keys[index] ?? "";
    });
    return {
      page: record.page || "",
      query: record.query || "",
      date: record.date || "",
      clicks: Number(row?.clicks || 0),
      impressions: Number(row?.impressions || 0),
      ctr: Number(row?.ctr || 0),
      position: row?.position == null ? null : Number(row.position),
    };
  });
}

async function fetchSearchConsoleRows(overrides = {}) {
  const config = getSearchConsoleConfig();
  assertSearchConsoleConfigured(config);
  const request = resolveSearchConsoleRequest(overrides);
  if (!request.siteUrl) throw new Error("Missing Search Console site URL.");
  const accessToken = await exchangeServiceAccountAccessToken(config);
  const encodedSiteUrl = encodeURIComponent(request.siteUrl);
  const response = await fetch(`https://searchconsole.googleapis.com/webmasters/v3/sites/${encodedSiteUrl}/searchAnalytics/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      startDate: request.startDate,
      endDate: request.endDate,
      dimensions: request.dimensions,
      rowLimit: request.rowLimit,
      searchType: request.searchType,
      dataState: request.dataState,
      aggregationType: request.aggregationType,
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Search Console API ${response.status}: ${text.slice(0, 200)}`);
  }
  const payload = await response.json();
  return {
    request,
    rowCount: Array.isArray(payload?.rows) ? payload.rows.length : 0,
    rows: mapSearchAnalyticsRows(payload?.rows, request.dimensions),
  };
}

module.exports = {
  getSearchConsoleConfig,
  resolveSearchConsoleRequest,
  fetchSearchConsoleRows,
};
