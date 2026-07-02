function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractTagContent(html, tagName) {
  const match = html.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return match?.[1]?.trim() ?? "";
}

function extractMetaDescription(html) {
  const match = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["'][^>]*>/i);
  return match?.[1]?.trim() ?? "";
}

function extractCanonicalHref(html) {
  const match = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["'][^>]*>/i);
  return match?.[1]?.trim() ?? "";
}

function extractRobotsContent(html) {
  const match = html.match(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']*)["'][^>]*>/i);
  return match?.[1]?.trim() ?? "";
}

function extractJsonLdTypes(html) {
  const matches = Array.from(
    html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi),
  );
  return matches.flatMap((match) => {
    try {
      const parsed = JSON.parse(match[1]);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => item?.["@type"]).filter(Boolean);
      }
      return [parsed?.["@type"]].filter(Boolean);
    } catch {
      return [];
    }
  });
}

function hasHref(html, href) {
  return new RegExp(`href=["'][^"']*${escapeRegExp(href)}["']`, "i").test(html);
}

function classifyVerification(results = [], options = {}) {
  if (options.skipped) {
    return {
      level: "skipped",
      summary: options.reason || "verification skipped",
    };
  }

  if (!results.length) {
    return {
      level: "warning",
      summary: "no verification results",
    };
  }

  const hasBlocked = results.some(
    (item) =>
      item.statusCode >= 400 ||
      item.checks?.statusOk === false ||
      item.checks?.titlePresent === false ||
      item.checks?.descriptionPresent === false,
  );

  if (hasBlocked) {
    return {
      level: "blocked",
      summary: "page unavailable or critical metadata missing",
    };
  }

  const hasWarning = results.some(
    (item) =>
      item.ok === false ||
      item.checks?.titleMatched === false ||
      item.checks?.descriptionMatched === false ||
      item.checks?.contentMatched === false,
  );

  if (hasWarning) {
    return {
      level: "warning",
      summary: "page rendered but content or metadata does not fully match publish payload",
    };
  }

  return {
    level: "pass",
    summary: "page rendered with expected metadata and key content",
  };
}

function buildDocumentExpectations(document) {
  if (!document?._type) return { titleCandidates: [], descriptionCandidates: [], contentChecks: [] };

  if (document._type === "productContent") {
    return {
      titleCandidates: [document.seo?.title, document.title].filter(Boolean),
      descriptionCandidates: [document.seo?.description, document.shortDescription].filter(Boolean),
      contentChecks: [document.title, document.shortDescription, document.hero?.headline].filter(Boolean),
      schemaTypes: ["Product"],
      internalLinks: [
        "/faq",
        ...(document.relatedProducts ?? []).slice(0, 2).map((slug) => `/product/${slug}`),
        ...(document.relatedGuides ?? []).slice(0, 2).map((slug) =>
          String(slug).startsWith("/") ? String(slug) : `/guides/${slug}`,
        ),
      ].filter(Boolean),
    };
  }

  if (document._type === "collectionPage") {
    return {
      titleCandidates: [document.seo?.title, document.title].filter(Boolean),
      descriptionCandidates: [document.seo?.description, document.description, document.subtitle].filter(Boolean),
      contentChecks: [document.title, document.description, ...(document.introBlocks ?? [])].filter(Boolean),
      schemaTypes: ["CollectionPage"],
      internalLinks: [
        ...((document.guideIds ?? []).slice(0, 2).map((id) => (id === "guides" ? "/guides" : `/guides/${id}`))),
        ...((document.faqIds ?? []).slice(0, 1).map(() => "/faq")),
      ].filter(Boolean),
    };
  }

  if (document._type === "guideArticle") {
    return {
      titleCandidates: [document.seo?.title, document.title].filter(Boolean),
      descriptionCandidates: [document.seo?.description, document.excerpt, document.heroSummary].filter(Boolean),
      contentChecks: [document.title, document.excerpt, ...(document.body ?? []).slice(0, 2)].filter(Boolean),
      schemaTypes: ["Article"],
      internalLinks: [
        ...(document.relatedProductSlugs ?? []).slice(0, 2).map((slug) => `/product/${slug}`),
        ...(document.relatedCollectionSlugs ?? []).slice(0, 2).map((slug) => `/collection/${slug}`),
        ...((document.faqIds ?? []).slice(0, 1).map(() => "/faq")),
      ].filter(Boolean),
    };
  }

  if (document._type === "faqItem") {
    return {
      titleCandidates: ["FAQ"],
      descriptionCandidates: [],
      contentChecks: [document.question, document.answer].filter(Boolean),
      schemaTypes: ["FAQPage"],
      internalLinks: [
        document.targetType === "product" ? `/product/${document.targetId}` : null,
        document.targetType === "collection" ? `/collection/${document.targetId}` : null,
      ].filter(Boolean),
    };
  }

  if (document._type === "guideIndex") {
    return {
      titleCandidates: ["Guides"],
      descriptionCandidates: ["购买指南", "Guides"],
      contentChecks: [document.highlightTitle].filter(Boolean),
      schemaTypes: ["CollectionPage"],
      internalLinks: (document.guidePaths ?? []).slice(0, 2),
    };
  }

  return { titleCandidates: [], descriptionCandidates: [], contentChecks: [], schemaTypes: [], internalLinks: [] };
}

async function verifyPath({ baseUrl, path, document }) {
  const url = `${baseUrl.replace(/\/$/, "")}${path}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "user-agent": "control-plane-publish-verifier",
    },
  });

  const html = await response.text();
  const title = extractTagContent(html, "title");
  const description = extractMetaDescription(html);
  const canonicalHref = extractCanonicalHref(html);
  const robots = extractRobotsContent(html);
  const jsonLdTypes = extractJsonLdTypes(html);
  const expected = buildDocumentExpectations(document);
  const pathOnlyCanonical = canonicalHref ? canonicalHref.replace(/^https?:\/\/[^/]+/i, "") : "";

  const checks = {
    statusOk: response.ok,
    titlePresent: Boolean(title),
    descriptionPresent: Boolean(description),
    canonicalPresent: Boolean(canonicalHref),
    canonicalMatched: !path || pathOnlyCanonical === path,
    robotsPresent: Boolean(robots),
    robotsMatched: !robots || (/index/i.test(robots) && /follow/i.test(robots)),
    schemaPresent: jsonLdTypes.length > 0,
    schemaMatched:
      !expected.schemaTypes?.length ||
      expected.schemaTypes.some((schemaType) => jsonLdTypes.includes(schemaType)),
    titleMatched:
      expected.titleCandidates.length === 0 ||
      expected.titleCandidates.some((candidate) => title.includes(String(candidate))),
    descriptionMatched:
      expected.descriptionCandidates.length === 0 ||
      expected.descriptionCandidates.some((candidate) => description.includes(String(candidate))),
    contentMatched:
      expected.contentChecks.length === 0 ||
      expected.contentChecks.some((candidate) => new RegExp(escapeRegExp(String(candidate))).test(html)),
    internalLinksMatched:
      !expected.internalLinks?.length ||
      expected.internalLinks.some((href) => hasHref(html, href)),
  };

  return {
    path,
    url,
    ok: Object.values(checks).every(Boolean),
    statusCode: response.status,
    title,
    description,
    canonicalHref,
    robots,
    jsonLdTypes,
    checks,
  };
}

async function verifyPublishedDocuments(documents = [], paths = []) {
  const uniquePaths = Array.from(new Set(paths.filter(Boolean)));
  const baseUrl =
    process.env.WEB_BASE_URL ||
    process.env.SITE_BASE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "";

  if (!uniquePaths.length) {
    const classification = classifyVerification([], { skipped: true, reason: "no-paths" });
    return { ok: true, skipped: true, reason: "no-paths", level: classification.level, summary: classification.summary, results: [] };
  }

  if (!baseUrl) {
    const classification = classifyVerification([], { skipped: true, reason: "missing-base-url" });
    return {
      ok: false,
      skipped: true,
      reason: "missing-base-url",
      level: classification.level,
      summary: classification.summary,
      requested: uniquePaths,
      results: [],
    };
  }

  const docByPath = new Map();
  documents.forEach((document) => {
    if (document?._type === "productContent" && document.productSlug) {
      docByPath.set(`/product/${document.productSlug}`, document);
    }
    if (document?._type === "collectionPage" && document.slug?.current) {
      docByPath.set(`/collection/${document.slug.current}`, document);
    }
    if (document?._type === "guideArticle" && document.slug?.current) {
      docByPath.set(`/guides/${document.slug.current}`, document);
      docByPath.set("/guides", {
        _type: "guideIndex",
        highlightTitle: document.title,
        guidePaths: [`/guides/${document.slug.current}`],
      });
    }
    if (document?._type === "faqItem") {
      docByPath.set("/faq", document);
    }
  });

  const results = [];
  for (const path of uniquePaths) {
    // sequential to keep network load tiny and predictable
    // eslint-disable-next-line no-await-in-loop
    results.push(await verifyPath({ baseUrl, path, document: docByPath.get(path) ?? null }));
  }

  const classification = classifyVerification(results);

  return {
    ok: classification.level === "pass",
    skipped: false,
    level: classification.level,
    summary: classification.summary,
    requested: uniquePaths,
    results,
  };
}

module.exports = {
  buildDocumentExpectations,
  classifyVerification,
  verifyPublishedDocuments,
};
