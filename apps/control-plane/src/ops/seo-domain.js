const { productTargets, collectionTargets, guideTargets, faqTargets } = require("../data/bootstrap-content");

function createSeoDomain({
  seoMetrics,
  seoImportRuns,
  getSeoImportReplay,
  setSeoImportReplayState,
  getRepoChanges,
  findSeoTargetRegistryRepoChange,
  persist,
  nextId,
  now,
  normalizeString,
  normalizeNumber,
} = {}) {
  function normalizeDateKey(value) {
    const raw = normalizeString(value);
    if (!raw) return "";
    if (raw.length >= 10) return raw.slice(0, 10);
    return raw;
  }

  function normalizeRate(value, fallback = 0) {
    if (value == null || value === "") return fallback;
    const raw = String(value).trim();
    if (!raw) return fallback;
    if (raw.endsWith("%")) {
      const parsedPct = Number(raw.slice(0, -1));
      return Number.isFinite(parsedPct) ? parsedPct / 100 : fallback;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return fallback;
    return parsed > 1 ? parsed / 100 : parsed;
  }

  function normalizePagePath(value) {
    const raw = normalizeString(value);
    if (!raw) return "";
    try {
      const url = raw.startsWith("http://") || raw.startsWith("https://") ? new URL(raw) : new URL(raw, "https://example.local");
      const pathname = normalizeString(url.pathname || "");
      if (!pathname) return "";
      return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
    } catch {
      const pathname = raw.startsWith("/") ? raw : `/${raw}`;
      return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
    }
  }

  function parseCsvLine(line) {
    const cells = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }
      if (char === "," && !inQuotes) {
        cells.push(current);
        current = "";
        continue;
      }
      current += char;
    }
    cells.push(current);
    return cells.map((cell) => cell.trim());
  }

  function parseCsvText(text) {
    const lines = String(text || "")
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0);
    if (!lines.length) return [];
    const headers = parseCsvLine(lines[0]);
    return lines.slice(1).map((line) => {
      const values = parseCsvLine(line);
      const row = {};
      headers.forEach((header, idx) => {
        row[header] = values[idx] ?? "";
      });
      return row;
    });
  }

  function seoTargetIndex() {
    const index = new Map();
    const register = (target) => {
      const path = normalizePagePath(target?.targetPath);
      if (!path || index.has(path)) return;
      index.set(path, {
        targetType: normalizeString(target.targetType),
        targetId: normalizeString(target.targetId),
        title: normalizeString(target.title),
        targetPath: path,
      });
    };
    Object.values(productTargets || {}).forEach(register);
    Object.values(collectionTargets || {}).forEach(register);
    Object.values(guideTargets || {}).forEach(register);
    Object.values(faqTargets || {}).forEach(register);
    (Array.isArray(getRepoChanges?.()) ? getRepoChanges() : [])
      .filter((item) => item.kind === "seo_target_registry" && item.status === "merged" && item.registryTarget)
      .forEach((item) => register(item.registryTarget));
    return index;
  }

  function suggestTargetFromPagePath(pagePath) {
    const path = normalizePagePath(pagePath);
    if (!path) return null;

    const match = (re) => {
      const m = path.match(re);
      return m && m[1] ? m[1] : null;
    };

    const productSlug = match(/^\/product\/([^\/?#]+)$/);
    if (productSlug) {
      return {
        targetType: "product",
        targetId: productSlug,
        confidence: "high",
        reason: "Path matches /product/:slug",
      };
    }

    const collectionSlug = match(/^\/collection\/([^\/?#]+)$/);
    if (collectionSlug) {
      return {
        targetType: "collection",
        targetId: collectionSlug,
        confidence: "high",
        reason: "Path matches /collection/:slug",
      };
    }

    const guideSlug = match(/^\/guides\/([^\/?#]+)$/);
    if (guideSlug) {
      return {
        targetType: "guide",
        targetId: guideSlug,
        confidence: "high",
        reason: "Path matches /guides/:slug",
      };
    }

    const altGuideSlug = match(/^\/guide\/([^\/?#]+)$/);
    if (altGuideSlug) {
      return {
        targetType: "guide",
        targetId: altGuideSlug,
        confidence: "medium",
        reason: "Path matches /guide/:slug (non-canonical)",
      };
    }

    return null;
  }

  function readHeaderValue(row, aliases = []) {
    const entries = Object.entries(row || {});
    for (const alias of aliases) {
      const lowered = alias.toLowerCase();
      const hit = entries.find(([key]) => String(key).trim().toLowerCase() === lowered);
      if (hit && hit[1] != null && String(hit[1]).trim() !== "") return hit[1];
    }
    return undefined;
  }

  function normalizeSearchConsoleSeoRows({ rows, csvText, importDate, source } = {}) {
    const rawRows = Array.isArray(rows) ? rows : csvText ? parseCsvText(csvText) : [];
    const targetIndex = seoTargetIndex();
    const normalizedRows = [];
    const skipped = [];
    const unmappedPages = new Set();

    rawRows.forEach((row, idx) => {
      const pageRaw = readHeaderValue(row, ["page", "url", "top pages", "landing page", "pages"]);
      const pagePath = normalizePagePath(pageRaw);
      const target = pagePath ? targetIndex.get(pagePath) : null;
      const date = normalizeDateKey(readHeaderValue(row, ["date", "day"]) || importDate);

      if (!pagePath || !target || !date) {
        if (pagePath && !target) unmappedPages.add(pagePath);
        skipped.push({
          index: idx,
          pagePath: pagePath || null,
          reason: !date ? "missing_date" : !target ? "unmapped_path" : "missing_page",
        });
        return;
      }

      const positionValue = readHeaderValue(row, ["position", "average position"]);
      normalizedRows.push({
        date,
        targetType: target.targetType,
        targetId: target.targetId,
        pagePath,
        query: normalizeString(readHeaderValue(row, ["query", "top queries", "search query"]) || ""),
        impressions: Math.max(0, normalizeNumber(readHeaderValue(row, ["impressions", "impression"]), 0)),
        clicks: Math.max(0, normalizeNumber(readHeaderValue(row, ["clicks", "click"]), 0)),
        ctr: normalizeRate(readHeaderValue(row, ["ctr", "site ctr", "url ctr"]), 0),
        position: positionValue == null || positionValue === "" ? null : normalizeNumber(positionValue, null),
        source: normalizeString(source || "search_console"),
      });
    });

    return {
      rows: normalizedRows,
      parsedRows: rawRows.length,
      normalizedRows: normalizedRows.length,
      skippedRows: skipped.length,
      skipped,
      unmappedPages: Array.from(unmappedPages).slice(0, 20),
    };
  }

  function seoMetricKey({ date, targetType, targetId, pagePath, query } = {}) {
    const d = normalizeDateKey(date);
    const parts = [d, normalizeString(targetType), normalizeString(targetId), normalizeString(pagePath), normalizeString(query)];
    return parts.join("|");
  }

  function upsertSeoMetricRow({ actor, row, source } = {}) {
    if (!row) return null;
    const date = normalizeDateKey(row.date || row.day || row.at);
    const targetType = normalizeString(row.targetType);
    const targetId = normalizeString(row.targetId);
    if (!date || !targetType || !targetId) return null;
    const pagePath = normalizeString(row.pagePath || row.page || "");
    const query = normalizeString(row.query || "");
    const impressions = Math.max(0, normalizeNumber(row.impressions));
    const clicks = Math.max(0, normalizeNumber(row.clicks));
    const ctr = row.ctr != null ? Math.max(0, normalizeNumber(row.ctr)) : impressions > 0 ? clicks / impressions : 0;
    const position = row.position != null ? normalizeNumber(row.position, null) : null;

    const key = seoMetricKey({ date, targetType, targetId, pagePath, query });
    const existingIdx = seoMetrics.findIndex((item) => item.key === key);
    const record = {
      id: existingIdx >= 0 ? seoMetrics[existingIdx].id : nextId("seo"),
      key,
      date,
      targetType,
      targetId,
      pagePath: pagePath || null,
      query: query || null,
      impressions,
      clicks,
      ctr,
      position,
      source: normalizeString(source || row.source || "manual"),
      ingestedBy: actor || "anonymous",
      updatedAt: now(),
      createdAt: existingIdx >= 0 ? seoMetrics[existingIdx].createdAt : now(),
    };
    if (existingIdx >= 0) seoMetrics[existingIdx] = record;
    else seoMetrics.unshift(record);
    return record;
  }

  function ingestSeoMetrics({ actor, rows, source } = {}) {
    const items = Array.isArray(rows) ? rows : [];
    const created = [];
    items.forEach((row) => {
      const saved = upsertSeoMetricRow({ actor, row, source });
      if (saved) created.push(saved);
    });
    if (created.length) persist();
    return { ingested: created.length };
  }

  function recordSeoImportRun(run = {}) {
    const record = {
      id: nextId("seoimport"),
      createdAt: now(),
      source: normalizeString(run.source || "search_console"),
      actor: normalizeString(run.actor || "anonymous") || "anonymous",
      parsedRows: normalizeNumber(run.parsedRows, 0),
      normalizedRows: normalizeNumber(run.normalizedRows, 0),
      ingested: normalizeNumber(run.ingested, 0),
      skippedRows: normalizeNumber(run.skippedRows, 0),
      importDate: normalizeDateKey(run.importDate) || null,
      unmappedPages: Array.isArray(run.unmappedPages) ? run.unmappedPages.slice(0, 50) : [],
    };
    seoImportRuns.unshift(record);
    seoImportRuns.splice(20);
    persist();
    return record;
  }

  function setSeoImportReplay(payload = null) {
    const next = payload
      ? {
          source: normalizeString(payload.source || "search_console"),
          importDate: normalizeDateKey(payload.importDate) || null,
          csvText: typeof payload.csvText === "string" ? payload.csvText : "",
          rows: Array.isArray(payload.rows) ? payload.rows.slice(0, 500) : [],
          updatedAt: now(),
        }
      : null;
    setSeoImportReplayState(next);
    persist();
    return next;
  }

  function importSeoMetricsFromSearchConsole({ actor, rows, csvText, importDate, source } = {}) {
    const normalized = normalizeSearchConsoleSeoRows({ rows, csvText, importDate, source: source || "search_console" });
    const result = ingestSeoMetrics({ actor, rows: normalized.rows, source: source || "search_console" });
    const payload = {
      ...result,
      parsedRows: normalized.parsedRows,
      normalizedRows: normalized.normalizedRows,
      skippedRows: normalized.skippedRows,
      unmappedPages: normalized.unmappedPages,
      importDate: normalizeDateKey(importDate) || null,
    };
    recordSeoImportRun({
      actor,
      source: source || "search_console",
      ...payload,
    });
    setSeoImportReplay({
      source: source || "search_console",
      importDate,
      csvText,
      rows,
    });
    return payload;
  }

  function replayLatestSeoImport({ actor = "system:seo_replay" } = {}) {
    const replay = getSeoImportReplay();
    if (!replay || (!replay.csvText && !(Array.isArray(replay.rows) && replay.rows.length))) {
      return {
        status: "missing_replay",
        message: "No replayable SEO import payload is available yet.",
      };
    }
    const result = importSeoMetricsFromSearchConsole({
      actor,
      source: replay.source || "search_console_replay",
      importDate: replay.importDate || undefined,
      csvText: replay.csvText || undefined,
      rows: Array.isArray(replay.rows) ? replay.rows : undefined,
    });
    return {
      status: "ok",
      replayedAt: now(),
      ...result,
    };
  }

  function getSeoImportDiagnostics() {
    const latestRun = seoImportRuns[0] ?? null;
    const recentRuns = seoImportRuns.slice(0, 5);
    const recentUnmapped = new Map();
    const latestUnmappedSet = new Set((latestRun?.unmappedPages || []).map((pagePath) => normalizePagePath(pagePath)).filter(Boolean));

    recentRuns.forEach((run) => {
      (run.unmappedPages || []).forEach((pagePath) => {
        const key = normalizePagePath(pagePath);
        if (!key) return;
        const existing = recentUnmapped.get(key) || { pagePath: key, count: 0, lastSeenAt: run.createdAt, suggestion: null };
        existing.count += 1;
        if (!existing.lastSeenAt || Date.parse(run.createdAt) > Date.parse(existing.lastSeenAt)) existing.lastSeenAt = run.createdAt;
        if (!existing.suggestion) existing.suggestion = suggestTargetFromPagePath(key);
        if (existing.suggestion && !existing.repoChange) {
          const matched = findSeoTargetRegistryRepoChange({
            targetType: existing.suggestion.targetType,
            targetId: existing.suggestion.targetId,
          });
          existing.repoChange = matched
            ? {
                id: matched.id,
                status: matched.status,
                prUrl: matched.prUrl ?? null,
                prNumber: matched.prNumber ?? null,
                branchName: matched.branchName ?? null,
                updatedAt: matched.updatedAt ?? matched.createdAt ?? null,
              }
            : null;
        }
        existing.resolutionStatus = existing.repoChange?.status === "merged" ? "registered_pending_refresh" : "unresolved";
        recentUnmapped.set(key, existing);
      });
    });

    const allUnmapped = Array.from(recentUnmapped.values())
      .filter((item) => (latestRun ? latestUnmappedSet.has(normalizePagePath(item.pagePath)) : true))
      .sort((a, b) => b.count - a.count);
    const activeUnmappedPages = allUnmapped.filter((item) => item.resolutionStatus !== "registered_pending_refresh");
    const resolvedRecentUnmappedPages = allUnmapped.filter((item) => item.resolutionStatus === "registered_pending_refresh");
    const latestResolvedCount = latestRun
      ? latestRun.unmappedPages.filter((pagePath) => {
          const item = recentUnmapped.get(normalizePagePath(pagePath));
          return item?.resolutionStatus === "registered_pending_refresh";
        }).length
      : 0;
    const latestActiveCount = latestRun ? Math.max(0, latestRun.unmappedPages.length - latestResolvedCount) : 0;

    return {
      latestRun: latestRun
        ? {
            ...latestRun,
            activeUnmappedPages: latestActiveCount,
            resolvedUnmappedPages: latestResolvedCount,
            status: latestActiveCount ? (latestActiveCount >= 5 || latestRun.normalizedRows === 0 ? "warning" : "partial") : "healthy",
          }
        : null,
      recentRuns,
      recentUnmappedPages: activeUnmappedPages.slice(0, 10),
      resolvedRecentUnmappedPages: resolvedRecentUnmappedPages.slice(0, 10),
    };
  }

  function listSeoMetrics(filters = {}) {
    const targetType = normalizeString(filters.targetType);
    const targetId = normalizeString(filters.targetId);
    const sinceDays = normalizeNumber(filters.sinceDays, 30);
    const untilTs = Date.now();
    const sinceTs = untilTs - Math.max(1, sinceDays) * 24 * 60 * 60 * 1000;
    const limit = Math.min(500, Math.max(1, normalizeNumber(filters.limit, 200)));

    const items = seoMetrics
      .filter((row) => (targetType ? row.targetType === targetType : true))
      .filter((row) => (targetId ? row.targetId === targetId : true))
      .filter((row) => {
        const ts = Date.parse(String(row.date || ""));
        return Number.isFinite(ts) ? ts >= sinceTs && ts <= untilTs : true;
      })
      .slice(0, limit);
    return { items, total: items.length };
  }

  function aggregateSeoWindow({ targetType, targetId, sinceTs, untilTs } = {}) {
    let impressions = 0;
    let clicks = 0;
    let weightedPosition = 0;
    let positionWeight = 0;
    seoMetrics.forEach((row) => {
      const ts = Date.parse(String(row.date || ""));
      if (!Number.isFinite(ts) || ts < sinceTs || ts > untilTs) return;
      if (row.targetType !== targetType || row.targetId !== targetId) return;
      impressions += row.impressions || 0;
      clicks += row.clicks || 0;
      if (row.position != null && row.impressions) {
        weightedPosition += row.position * row.impressions;
        positionWeight += row.impressions;
      }
    });
    const ctr = impressions > 0 ? clicks / impressions : 0;
    const position = positionWeight > 0 ? weightedPosition / positionWeight : null;
    return { impressions, clicks, ctr, position };
  }

  function getSeoMetricsWindowSummary({ targetType, targetId, windowDays } = {}) {
    const w = Math.max(1, normalizeNumber(windowDays, 7));
    const untilTs = Date.now();
    const windowMs = w * 24 * 60 * 60 * 1000;
    const current = aggregateSeoWindow({ targetType, targetId, sinceTs: untilTs - windowMs, untilTs });
    const previous = aggregateSeoWindow({ targetType, targetId, sinceTs: untilTs - windowMs * 2, untilTs: untilTs - windowMs });
    return {
      windowDays: w,
      current,
      previous,
      delta: {
        impressions: current.impressions - previous.impressions,
        clicks: current.clicks - previous.clicks,
        ctr: current.ctr - previous.ctr,
        position: current.position != null && previous.position != null ? current.position - previous.position : null,
      },
    };
  }

  function getSeoMetricsFreshnessSummary({ warningDays = 3, criticalDays = 7 } = {}) {
    const items = Array.isArray(seoMetrics) ? seoMetrics : [];
    const targetKeys = new Set();
    const recentTargetKeys = new Set();
    const recentTs = Date.now() - 7 * 24 * 60 * 60 * 1000;
    let latest = null;
    let latestTs = null;

    items.forEach((row) => {
      const key = `${row.targetType}:${row.targetId}`;
      targetKeys.add(key);
      const ts = Date.parse(String(row.date || ""));
      if (Number.isFinite(ts) && ts >= recentTs) recentTargetKeys.add(key);
      if (!Number.isFinite(ts)) return;
      if (latestTs == null || ts > latestTs) {
        latestTs = ts;
        latest = row;
      }
    });

    if (!latest || latestTs == null) {
      return {
        status: "not_configured",
        latestDate: null,
        latestUpdatedAt: null,
        latestSource: null,
        daysSinceLatest: null,
        totalRows: items.length,
        targetsTracked: targetKeys.size,
        targetsWithRecentData: recentTargetKeys.size,
        thresholds: {
          warningDays,
          criticalDays,
        },
      };
    }

    const daysSinceLatest = Math.max(0, Math.floor((Date.now() - latestTs) / (24 * 60 * 60 * 1000)));
    const status = daysSinceLatest > criticalDays ? "critical" : daysSinceLatest > warningDays ? "warning" : "healthy";

    return {
      status,
      latestDate: latest.date,
      latestUpdatedAt: latest.updatedAt ?? null,
      latestSource: latest.source ?? null,
      daysSinceLatest,
      totalRows: items.length,
      targetsTracked: targetKeys.size,
      targetsWithRecentData: recentTargetKeys.size,
      thresholds: {
        warningDays,
        criticalDays,
      },
    };
  }

  function metaForSeoTarget(targetType, targetId) {
    if (targetType === "product") return productTargets[targetId] ?? null;
    if (targetType === "collection") return collectionTargets[targetId] ?? null;
    if (targetType === "guide") return guideTargets[`guide:${targetId}`] ?? null;
    if (targetType === "faq") return faqTargets[targetId] ?? null;
    return null;
  }

  function buildSeoMonitoringAlerts({ seoFreshness, seoImportDiagnostics } = {}) {
    const alerts = [];
    if (seoFreshness?.status === "critical") {
      alerts.push({
        level: "critical",
        title: "SEO metrics are stale",
        detail: `Latest SEO metric date is ${seoFreshness.latestDate}; ${seoFreshness.daysSinceLatest} day(s) old, beyond the ${seoFreshness.thresholds.criticalDays}-day critical threshold.`,
      });
    } else if (seoFreshness?.status === "warning") {
      alerts.push({
        level: "warning",
        title: "SEO metrics freshness is slipping",
        detail: `Latest SEO metric date is ${seoFreshness.latestDate}; ${seoFreshness.daysSinceLatest} day(s) old, beyond the ${seoFreshness.thresholds.warningDays}-day warning threshold.`,
      });
    } else if (seoFreshness?.status === "not_configured") {
      alerts.push({
        level: "warning",
        title: "SEO metrics are not configured",
        detail: "No SEO metric rows have been ingested yet.",
      });
    }
    if ((seoImportDiagnostics?.latestRun?.activeUnmappedPages ?? 0) > 0) {
      alerts.push({
        level: "warning",
        title: "SEO import has unmapped pages",
        detail: `Latest SEO import still has ${seoImportDiagnostics.latestRun.activeUnmappedPages} active unmapped page(s); register them as tracked targets before relying on their metrics.`,
      });
    }
    return alerts;
  }

  function getSeoGeoRecommendationSummary() {
    const contentGaps = [];
    const thinContent = [];
    const internalLinkGaps = [];

    Object.values(faqTargets).forEach((target) => {
      const faqCount = Array.isArray(target.existingFaqs) ? target.existingFaqs.length : 0;
      if (faqCount < 5) {
        contentGaps.push({
          key: `faq:${target.targetType}:${target.targetId}`,
          targetType: "faq",
          targetId: `${target.targetType}:${target.targetId}`,
          title: `${target.title} FAQ`,
          targetPath: target.targetPath,
          observedCount: faqCount,
          threshold: 5,
          missingAssetType: "faq_cluster",
        });
      }
    });

    Object.values(productTargets).forEach((target) => {
      const descLength = String(target.currentShortDescription || "").trim().length;
      const benefitCount = Array.isArray(target.currentKeyBenefits) ? target.currentKeyBenefits.length : 0;
      if (descLength < 48 || benefitCount < 4) {
        thinContent.push({
          key: `product:${target.targetId}`,
          targetType: "product",
          targetId: target.targetId,
          title: target.title,
          targetPath: target.targetPath,
          observedCount: Math.min(descLength, benefitCount * 12),
          threshold: 48,
          reason: `${target.title} still has a short explanation layer for SEO/GEO. Expand buyer intent, objections, and next-step guidance beyond the basic hero copy.`,
        });
      }
    });

    Object.values(collectionTargets).forEach((target) => {
      const moduleCount = Array.isArray(target.currentModules) ? target.currentModules.length : 0;
      const heroLength = String(target.currentHeroSummary || "").trim().length;
      if (moduleCount < 4 || heroLength < 90) {
        thinContent.push({
          key: `collection:${target.targetId}`,
          targetType: "collection",
          targetId: target.targetId,
          title: target.title,
          targetPath: target.targetPath,
          observedCount: moduleCount,
          threshold: 4,
          reason: `${target.title} needs more structured buying help and richer topic coverage before it can act as a strong organic hub.`,
        });
      }
      if (!target.currentModules?.includes("guide-links")) {
        internalLinkGaps.push({
          key: `collection:${target.targetId}`,
          targetType: "collection",
          targetId: target.targetId,
          title: target.title,
          targetPath: target.targetPath,
          observedCount: moduleCount,
          threshold: 4,
          reason: `${target.title} is not linking strongly enough into adjacent guides, FAQs, or narrower decision pages.`,
        });
      }
    });

    Object.values(guideTargets).forEach((target) => {
      const excerptLength = String(target.currentExcerpt || "").trim().length;
      if (excerptLength < 36) {
        thinContent.push({
          key: `guide:${target.targetId}`,
          targetType: "guide",
          targetId: target.targetId,
          title: target.title,
          targetPath: target.targetPath,
          observedCount: excerptLength,
          threshold: 36,
          reason: `${target.title} needs a stronger answer-first excerpt and clearer summary structure for GEO-style answer extraction.`,
        });
      }
    });

    return { contentGaps, thinContent, internalLinkGaps };
  }

  function getSeoMonitoringSnapshot({ warningDays = 3, criticalDays = 7, sinceDays = 14, limit = 500, windowDays = 7 } = {}) {
    const seoRows = listSeoMetrics({ sinceDays, limit }).items;
    const seoFreshness = getSeoMetricsFreshnessSummary({ warningDays, criticalDays });
    const seoImportDiagnostics = getSeoImportDiagnostics();
    const seoTargets = Array.from(
      new Map(seoRows.map((row) => [`${row.targetType}:${row.targetId}`, { targetType: row.targetType, targetId: row.targetId }])).values(),
    );
    const seoPerformance = {
      windowDays,
      targets: seoTargets
        .map((target) => {
          const meta = metaForSeoTarget(target.targetType, target.targetId);
          const summary = getSeoMetricsWindowSummary({ targetType: target.targetType, targetId: target.targetId, windowDays });
          const lowCtr = summary.current.impressions >= 80 && summary.current.ctr < 0.02;
          const posDrop = summary.delta.position != null && summary.delta.position > 3 && summary.current.impressions >= 50;
          const issueTypes = [lowCtr ? "low_ctr" : null, posDrop ? "position_drop" : null].filter(Boolean);
          const scoreLowCtr = lowCtr ? (0.02 - summary.current.ctr) * 10000 + summary.current.impressions / 10 : 0;
          const scorePosDrop = posDrop ? summary.delta.position * 120 + summary.current.impressions / 10 : 0;
          const issueScore = Math.max(scoreLowCtr, scorePosDrop);
          return {
            ...target,
            title: meta?.title ?? `${target.targetType}:${target.targetId}`,
            targetPath: meta?.targetPath ?? null,
            summary,
            issueTypes,
            issueScore,
          };
        })
        .sort((a, b) => (b.issueScore || 0) - (a.issueScore || 0))
        .slice(0, 50),
    };
    const seoRecommendationCandidates = {
      lowCtr: seoPerformance.targets
        .filter((target) => target.summary.current.impressions >= 80 && target.summary.current.ctr < 0.02)
        .map((target) => ({
          targetType: target.targetType,
          targetId: target.targetId,
          title: target.title,
          targetPath: target.targetPath,
          impressions: target.summary.current.impressions,
          clicks: target.summary.current.clicks,
          ctr: target.summary.current.ctr,
          threshold: 0.02,
          windowDays: target.summary.windowDays,
        })),
      positionDrop: seoPerformance.targets
        .filter((target) => target.summary.delta.position != null && target.summary.delta.position > 3 && target.summary.current.impressions >= 50)
        .map((target) => ({
          targetType: target.targetType,
          targetId: target.targetId,
          title: target.title,
          targetPath: target.targetPath,
          impressions: target.summary.current.impressions,
          currentPosition: target.summary.current.position,
          previousPosition: target.summary.previous.position,
          deltaPosition: target.summary.delta.position,
          threshold: 3,
          windowDays: target.summary.windowDays,
        })),
    };

    return {
      seoFreshness,
      seoImportDiagnostics,
      seoPerformance,
      seoAlerts: buildSeoMonitoringAlerts({ seoFreshness, seoImportDiagnostics }),
      seoRecommendationCandidates,
    };
  }

  return {
    ingestSeoMetrics,
    importSeoMetricsFromSearchConsole,
    replayLatestSeoImport,
    listSeoMetrics,
    getSeoMetricsWindowSummary,
    getSeoMetricsFreshnessSummary,
    getSeoImportDiagnostics,
    getSeoGeoRecommendationSummary,
    getSeoMonitoringSnapshot,
  };
}

module.exports = {
  createSeoDomain,
};
