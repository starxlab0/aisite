const { fetchSearchConsoleRows, getSearchConsoleConfig } = require("./search-console");
const { seoOps, createEvent, getSeoSyncStatus, recordSeoSyncRun } = require("./store");

let schedulerTimer = null;
let schedulerStarted = false;

function parseBooleanEnv(value) {
  if (value == null) return false;
  const normalized = String(value).trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalized);
}

function parsePositiveInt(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function computeNextAllowedRunAt({ consecutiveFailures, baseDelayMinutes, maxDelayMinutes, nowMs = Date.now() } = {}) {
  const failures = Math.max(1, Number(consecutiveFailures) || 1);
  const base = Math.max(1, baseDelayMinutes || 15);
  const max = Math.max(base, maxDelayMinutes || 360);
  const backoffMinutes = Math.min(max, base * 2 ** Math.max(0, failures - 1));
  return {
    backoffMinutes,
    nextAllowedRunAt: new Date(nowMs + backoffMinutes * 60 * 1000).toISOString(),
  };
}

function classifySearchConsoleSyncError(error) {
  const message = String(error?.message || error || "").trim() || "Search Console sync failed.";
  if (/Missing `SEARCH_CONSOLE_/i.test(message)) {
    return {
      category: "configuration",
      code: "missing_config",
      retryable: false,
      label: "configuration error",
      recoveryHint: "Add the missing Search Console environment variables, then run a manual retry.",
    };
  }
  if (/Google OAuth response did not include `access_token`/i.test(message)) {
    return {
      category: "authentication",
      code: "oauth_missing_access_token",
      retryable: false,
      label: "authentication error",
      recoveryHint: "Check the service account credentials and Google token endpoint response, then retry the sync.",
    };
  }
  if (/DECODER routines|PEM routines|unsupported|private key/i.test(message)) {
    return {
      category: "configuration",
      code: "invalid_private_key",
      retryable: false,
      label: "credential format error",
      recoveryHint: "Replace `SEARCH_CONSOLE_PRIVATE_KEY` with a valid service account private key in PEM format.",
    };
  }
  const oauthMatch = message.match(/Google OAuth (\d{3})/i);
  if (oauthMatch) {
    const status = Number(oauthMatch[1]);
    if (status === 400) {
      return {
        category: "authentication",
        code: "oauth_invalid_grant",
        retryable: false,
        label: "authentication error",
        recoveryHint: "Check the service account email, private key, and token audience, then retry the sync.",
      };
    }
    if (status === 401 || status === 403) {
      return {
        category: "authentication",
        code: `oauth_${status}`,
        retryable: false,
        label: "authentication error",
        recoveryHint: "Re-check Search Console service account access and Google API permissions before retrying.",
      };
    }
    if (status === 429) {
      return {
        category: "quota",
        code: "oauth_429",
        retryable: true,
        label: "quota limited",
        recoveryHint: "Wait for the token quota window to recover or reduce sync frequency before retrying.",
      };
    }
    if (status >= 500) {
      return {
        category: "upstream",
        code: `oauth_${status}`,
        retryable: true,
        label: "upstream error",
        recoveryHint: "Google token service is failing upstream. Wait for backoff or retry later.",
      };
    }
  }
  const apiMatch = message.match(/Search Console API (\d{3})/i);
  if (apiMatch) {
    const status = Number(apiMatch[1]);
    if (status === 401) {
      return {
        category: "authentication",
        code: "api_401",
        retryable: false,
        label: "authentication error",
        recoveryHint: "Check the bearer token flow and Search Console property access, then retry.",
      };
    }
    if (status === 403) {
      return {
        category: "permissions",
        code: "api_403",
        retryable: false,
        label: "permissions error",
        recoveryHint: "Grant the service account access to the Search Console property, then rerun the sync.",
      };
    }
    if (status === 429) {
      return {
        category: "quota",
        code: "api_429",
        retryable: true,
        label: "quota limited",
        recoveryHint: "Search Console rate limited the request. Let backoff finish or reduce sync frequency before retrying.",
      };
    }
    if (status >= 500) {
      return {
        category: "upstream",
        code: `api_${status}`,
        retryable: true,
        label: "upstream error",
        recoveryHint: "Search Console is temporarily failing upstream. Wait for backoff or retry later.",
      };
    }
    if (status >= 400) {
      return {
        category: "request",
        code: `api_${status}`,
        retryable: false,
        label: "request error",
        recoveryHint: "Check the Search Console request window, dimensions, and site URL, then retry the sync.",
      };
    }
  }
  if (/fetch failed|network|ECONNRESET|ENOTFOUND|ETIMEDOUT/i.test(message)) {
    return {
      category: "network",
      code: "network_error",
      retryable: true,
      label: "network error",
      recoveryHint: "Check outbound network access to Google APIs and retry after connectivity is restored.",
    };
  }
  return {
    category: "unknown",
    code: "unknown_error",
    retryable: true,
    label: "unknown error",
    recoveryHint: "Inspect the latest sync error details, then retry manually once the cause is understood.",
  };
}

function getSeoSearchConsoleAutomationConfig(env = process.env) {
  const searchConsole = getSearchConsoleConfig(env);
  const intervalMinutes = parsePositiveInt(env.SEARCH_CONSOLE_SYNC_INTERVAL_MINUTES, 0);
  const enabled = parseBooleanEnv(env.SEARCH_CONSOLE_SYNC_ENABLED) || intervalMinutes > 0;
  const runOnStart = parseBooleanEnv(env.SEARCH_CONSOLE_SYNC_RUN_ON_START);
  const failureBaseDelayMinutes = parsePositiveInt(env.SEARCH_CONSOLE_SYNC_FAILURE_BASE_DELAY_MINUTES, 15);
  const failureMaxDelayMinutes = parsePositiveInt(env.SEARCH_CONSOLE_SYNC_FAILURE_MAX_DELAY_MINUTES, 360);
  return {
    enabled,
    runOnStart,
    intervalMinutes,
    failureBaseDelayMinutes,
    failureMaxDelayMinutes,
    configured: searchConsole.configured,
    siteUrl: searchConsole.siteUrl || null,
    missing: searchConsole.missing,
  };
}

function summarizeSeoSearchConsoleHealth({ config, status } = {}) {
  const automationConfig = config || getSeoSearchConsoleAutomationConfig();
  const runtimeStatus = status || getSeoSyncStatus();
  if (!automationConfig.enabled) {
    return {
      health: "disabled",
      label: "disabled",
      detail: "Search Console automation is disabled; manual sync is still available.",
      recoveryHint: "Enable automation when you want Search Console metrics to refresh on a schedule.",
    };
  }
  if (!automationConfig.configured) {
    return {
      health: "not_configured",
      label: "not configured",
      detail: automationConfig.missing?.length
        ? `Missing ${automationConfig.missing.join(", ")}.`
        : "Search Console service account configuration is missing.",
      recoveryHint: "Add the missing Search Console credentials and site settings, then run a manual retry.",
    };
  }
  if (runtimeStatus.paused) {
    return {
      health: "paused",
      label: "paused",
      detail: runtimeStatus.pausedAt
        ? `Automation paused at ${runtimeStatus.pausedAt}${runtimeStatus.pausedBy ? ` by ${runtimeStatus.pausedBy}` : ""}.`
        : "Automation is paused.",
      recoveryHint: "Resume automation or use a manual retry when you are ready to continue syncs.",
    };
  }
  if (!runtimeStatus.lastRunAt) {
    return {
      health: "warning",
      label: "not run yet",
      detail: "Automation is enabled but no sync run has been recorded yet.",
      recoveryHint: "Trigger the first sync manually or wait for the next scheduled run to confirm the setup.",
    };
  }
  if (runtimeStatus.lastRunStatus === "failure") {
    const failureLabel = runtimeStatus.lastErrorCategory
      ? `${runtimeStatus.lastErrorCategory} error`
      : runtimeStatus.consecutiveFailures >= 3
        ? "degraded"
        : "failing";
    return {
      health: runtimeStatus.consecutiveFailures >= 3 ? "degraded" : "warning",
      label: runtimeStatus.consecutiveFailures >= 3 ? "degraded" : failureLabel,
      detail: `${runtimeStatus.consecutiveFailures || 1} consecutive failure(s). Latest ${runtimeStatus.lastErrorCategory || "sync"} error: ${runtimeStatus.lastError || "unknown"}.`,
      recoveryHint: runtimeStatus.recoveryHint || "Inspect the latest sync error and retry once the cause is fixed.",
      errorCategory: runtimeStatus.lastErrorCategory || "unknown",
      errorCode: runtimeStatus.lastErrorCode || "unknown_error",
      retryable: runtimeStatus.lastErrorRetryable ?? true,
    };
  }
  if (runtimeStatus.lastRunStatus === "skipped") {
    const latestReason = runtimeStatus.recentRuns?.[0]?.reason || null;
    return {
      health: latestReason === "paused" ? "paused" : "warning",
      label: latestReason === "paused" ? "paused" : latestReason === "backoff_active" ? "backing off" : "skipped",
      detail:
        latestReason === "backoff_active" && runtimeStatus.nextAllowedRunAt
          ? `Automatic retry is paused until ${runtimeStatus.nextAllowedRunAt}.`
          : latestReason === "paused"
            ? "Automation is paused."
            : "Latest automatic sync attempt was skipped.",
      recoveryHint:
        latestReason === "backoff_active"
          ? runtimeStatus.recoveryHint || "Wait for the backoff window or clear backoff before retrying manually."
          : latestReason === "paused"
            ? "Resume automation or run a manual retry when you are ready."
            : "Inspect the latest skipped run details before retrying.",
    };
  }
  return {
    health: "healthy",
    label: "healthy",
    detail: runtimeStatus.lastSuccessAt
      ? `Last successful sync completed at ${runtimeStatus.lastSuccessAt}.`
      : "Search Console sync is healthy.",
    recoveryHint: "No recovery action is needed.",
  };
}

async function syncSeoMetricsFromSearchConsole({ actor = "system:search_console_sync", requestOverrides = {}, automated = false } = {}) {
  const automationConfig = getSeoSearchConsoleAutomationConfig();
  const previousStatus = getSeoSyncStatus();
  if (automated && previousStatus.paused) {
    const request = requestOverrides?.siteUrl
      ? {
          siteUrl: requestOverrides.siteUrl,
          startDate: requestOverrides.startDate ?? null,
          endDate: requestOverrides.endDate ?? null,
        }
      : previousStatus.lastRequest ?? null;
    recordSeoSyncRun({
      status: "skipped",
      actor,
      request,
      source: "search_console_api",
      reason: "paused",
    });
    createEvent({
      actor,
      action: "seo_metrics_sync_search_console_skipped",
      note: "skipped Search Console sync because automation is paused",
    });
    return {
      status: "skipped",
      skipped: true,
      reason: "paused",
      request: request || null,
    };
  }
  if (
    automated &&
    previousStatus.nextAllowedRunAt &&
    new Date(previousStatus.nextAllowedRunAt).getTime() > Date.now()
  ) {
    const request = requestOverrides?.siteUrl
      ? {
          siteUrl: requestOverrides.siteUrl,
          startDate: requestOverrides.startDate ?? null,
          endDate: requestOverrides.endDate ?? null,
        }
      : previousStatus.lastRequest ?? null;
    const status = recordSeoSyncRun({
      status: "skipped",
      actor,
      request,
      source: "search_console_api",
      reason: "backoff_active",
    });
    createEvent({
      actor,
      action: "seo_metrics_sync_search_console_skipped",
      note: `skipped Search Console sync until ${status.nextAllowedRunAt || "later"} because failure backoff is active`,
    });
    return {
      status: "skipped",
      skipped: true,
      reason: "backoff_active",
      nextAllowedRunAt: status.nextAllowedRunAt,
      request: request || null,
    };
  }
  try {
    const fetched = await fetchSearchConsoleRows(requestOverrides);
    const result = seoOps.importSeoMetricsFromSearchConsole({
      actor,
      rows: fetched.rows,
      importDate: fetched.request.endDate,
      source: "search_console_api",
    });
    recordSeoSyncRun({
      status: "success",
      actor,
      request: fetched.request,
      fetchedRows: fetched.rowCount,
      ingestedRows: result.ingested,
      source: "search_console_api",
    });
    createEvent({
      actor,
      action: "seo_metrics_sync_search_console",
      note: `synced seo metrics ${result.ingested}/${fetched.rowCount} rows from Search Console for ${fetched.request.siteUrl}`,
    });
    return {
      fetchedRows: fetched.rowCount,
      request: fetched.request,
      ...result,
    };
  } catch (error) {
    const classifiedError = classifySearchConsoleSyncError(error);
    const failedStatus = computeNextAllowedRunAt({
      consecutiveFailures: (previousStatus.consecutiveFailures || 0) + 1,
      baseDelayMinutes: automationConfig.failureBaseDelayMinutes,
      maxDelayMinutes: automationConfig.failureMaxDelayMinutes,
    });
    recordSeoSyncRun({
      status: "failure",
      actor,
      error: error?.message || String(error),
      errorCategory: classifiedError.category,
      errorCode: classifiedError.code,
      errorRetryable: classifiedError.retryable,
      recoveryHint: classifiedError.recoveryHint,
      source: "search_console_api",
      nextAllowedRunAt: automated ? failedStatus.nextAllowedRunAt : null,
      backoffMinutes: automated ? failedStatus.backoffMinutes : 0,
    });
    createEvent({
      actor,
      action: "seo_metrics_sync_search_console_failed",
      note: automated
        ? `${classifiedError.label}: ${error?.message || String(error)} · retry after ${failedStatus.backoffMinutes}m`
        : `${classifiedError.label}: ${error?.message || String(error)}`,
    });
    throw error;
  }
}

function startSeoSearchConsoleScheduler({ logger = console } = {}) {
  const config = getSeoSearchConsoleAutomationConfig();
  if (schedulerStarted) {
    return {
      ...config,
      started: Boolean(schedulerTimer),
    };
  }
  schedulerStarted = true;
  if (!config.enabled || config.intervalMinutes <= 0) {
    return {
      ...config,
      started: false,
    };
  }

  const run = async () => {
    try {
      await syncSeoMetricsFromSearchConsole({ automated: true });
    } catch (error) {
      if (logger && typeof logger.warn === "function") {
        logger.warn(`[control-plane] Search Console sync failed: ${error?.message || error}`);
      }
    }
  };

  if (config.runOnStart) {
    setTimeout(run, 0);
  }

  schedulerTimer = setInterval(run, config.intervalMinutes * 60 * 1000);
  if (typeof schedulerTimer.unref === "function") schedulerTimer.unref();
  return {
    ...config,
    started: true,
  };
}

module.exports = {
  computeNextAllowedRunAt,
  classifySearchConsoleSyncError,
  getSeoSearchConsoleAutomationConfig,
  summarizeSeoSearchConsoleHealth,
  syncSeoMetricsFromSearchConsole,
  startSeoSearchConsoleScheduler,
};
