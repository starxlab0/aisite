const http = require("http");
const { siteProfile, assets } = require("./data/bootstrap-knowledge");
const { actionRuns } = require("./data/bootstrap-actions");
const { adapterName, getDraftById, listDrafts } = require("./cms-adapters");
const { startSeoSearchConsoleScheduler } = require("./ops/seo-search-console-sync");
const { handleOpsRoute } = require("./ops/router");
const { handleSignalsRoute } = require("./signals/router");
const {
  generateFaqDraft,
  planFaqExpansion,
  publishFaqExpansionDraft,
  rollbackFaqExpansion,
  reviewFaqExpansionDraft,
} = require("./workflows/faq-expansion");
const {
  generateCollectionRewriteDraft,
  planCollectionRewrite,
  publishCollectionRewriteDraft,
  reviewCollectionRewriteDraft,
  rollbackCollectionRewrite,
} = require("./workflows/collection-rewrite");
const {
  generateProductRewriteDraft,
  planProductRewrite,
  publishProductRewriteDraft,
  reviewProductRewriteDraft,
  rollbackProductRewrite,
} = require("./workflows/product-rewrite");
const {
  planGuideArticle,
  generateGuideArticleDraft,
  reviewGuideArticleDraft,
  publishGuideArticleDraft,
  rollbackGuideArticle,
} = require("./workflows/guide-article");

startSeoSearchConsoleScheduler();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");

  try {
    const handledSignals = await handleSignalsRoute(req, res, url);
    if (handledSignals) return;

    const handledOps = await handleOpsRoute(req, res, url, adapterName);
    if (handledOps) return;

    if (url.pathname === "/health") {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify(
          {
            service: "control-plane",
            status: "ok",
            cmsAdapter: adapterName,
          },
          null,
          2,
        ),
      );
      return;
    }

    if (url.pathname === "/knowledge") {
    const tag = url.searchParams.get("tag");
    const data = tag
      ? assets.filter((asset) => asset.tags.includes(tag))
      : assets;

    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(
      JSON.stringify(
        {
          service: "control-plane",
          status: "bootstrapped",
          siteProfile,
          assets: data,
          total: data.length,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (url.pathname === "/actions") {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(
      JSON.stringify(
        {
          service: "control-plane",
          status: "bootstrapped",
          items: actionRuns,
          total: actionRuns.length,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (url.pathname === "/drafts") {
    const entityType = url.searchParams.get("entityType") || undefined;
    const targetId = url.searchParams.get("targetId") || undefined;
    const status = url.searchParams.get("status") || undefined;
    const items = await listDrafts({ entityType, targetId, status });

    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(
      JSON.stringify(
        {
          service: "control-plane",
          status: "bootstrapped",
          cmsAdapter: adapterName,
          items,
          total: items.length,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (url.pathname.startsWith("/drafts/")) {
    const id = url.pathname.split("/").pop();
    const draft = await getDraftById(id);

    if (!draft) {
      res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify(
          {
            service: "control-plane",
            status: "not_found",
            message: `Draft not found: ${id}`,
          },
          null,
          2,
        ),
      );
      return;
    }

    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(
      JSON.stringify(
        {
          service: "control-plane",
          status: "bootstrapped",
          cmsAdapter: adapterName,
          item: draft,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (url.pathname === "/workflows/faq-expansion") {
    const targetType = url.searchParams.get("targetType") || "product";
    const targetId = url.searchParams.get("targetId") || "kokocang-x";
    const plan = planFaqExpansion({ targetType, targetId });

    if (!plan) {
      res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify(
          {
            service: "control-plane",
            status: "not_found",
            message: `FAQ expansion target not found: ${targetType}:${targetId}`,
          },
          null,
          2,
        ),
      );
      return;
    }

    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(
      JSON.stringify(
        {
          service: "control-plane",
          status: "planned",
          plan,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (url.pathname === "/workflows/faq-expansion/generate") {
    const targetType = url.searchParams.get("targetType") || "product";
    const targetId = url.searchParams.get("targetId") || "kokocang-x";
    const draft = generateFaqDraft({ targetType, targetId });

    if (!draft) {
      res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify(
          {
            service: "control-plane",
            status: "not_found",
            message: `FAQ generation target not found: ${targetType}:${targetId}`,
          },
          null,
          2,
        ),
      );
      return;
    }

    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(
      JSON.stringify(
        {
          service: "control-plane",
          status: "generated",
          draft,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (url.pathname === "/workflows/faq-expansion/review") {
    const targetType = url.searchParams.get("targetType") || "product";
    const targetId = url.searchParams.get("targetId") || "kokocang-x";
    const review = reviewFaqExpansionDraft({ targetType, targetId });

    if (!review) {
      res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify(
          {
            service: "control-plane",
            status: "not_found",
            message: `FAQ review target not found: ${targetType}:${targetId}`,
          },
          null,
          2,
        ),
      );
      return;
    }

    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(
      JSON.stringify(
        {
          service: "control-plane",
          status: review.status,
          review,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (url.pathname === "/workflows/faq-expansion/publish") {
    const targetType = url.searchParams.get("targetType") || "product";
    const targetId = url.searchParams.get("targetId") || "kokocang-x";
    const publishResult = await publishFaqExpansionDraft({ targetType, targetId });

    if (!publishResult) {
      res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify(
          {
            service: "control-plane",
            status: "not_found",
            message: `FAQ publish target not found: ${targetType}:${targetId}`,
          },
          null,
          2,
        ),
      );
      return;
    }

    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(
      JSON.stringify(
        {
          service: "control-plane",
          status: publishResult.status,
          result: publishResult,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (url.pathname === "/workflows/faq-expansion/rollback") {
    const targetType = url.searchParams.get("targetType") || "product";
    const targetId = url.searchParams.get("targetId") || "kokocang-x";
    const rollbackResult = await rollbackFaqExpansion({ targetType, targetId });

    if (!rollbackResult) {
      res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify(
          {
            service: "control-plane",
            status: "not_found",
            message: `FAQ rollback target not found: ${targetType}:${targetId}`,
          },
          null,
          2,
        ),
      );
      return;
    }

    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(
      JSON.stringify(
        {
          service: "control-plane",
          status: rollbackResult.status,
          result: rollbackResult,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (url.pathname === "/workflows/collection-rewrite") {
    const targetId = url.searchParams.get("targetId") || "first-time";
    const plan = planCollectionRewrite({ targetId });

    if (!plan) {
      res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify(
          {
            service: "control-plane",
            status: "not_found",
            message: `Collection rewrite target not found: ${targetId}`,
          },
          null,
          2,
        ),
      );
      return;
    }

    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ service: "control-plane", status: "planned", plan }, null, 2));
    return;
  }

  if (url.pathname === "/workflows/collection-rewrite/generate") {
    const targetId = url.searchParams.get("targetId") || "first-time";
    const draft = generateCollectionRewriteDraft({ targetId });

    if (!draft) {
      res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify(
          {
            service: "control-plane",
            status: "not_found",
            message: `Collection generation target not found: ${targetId}`,
          },
          null,
          2,
        ),
      );
      return;
    }

    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ service: "control-plane", status: "generated", draft }, null, 2));
    return;
  }

  if (url.pathname === "/workflows/collection-rewrite/review") {
    const targetId = url.searchParams.get("targetId") || "first-time";
    const review = reviewCollectionRewriteDraft({ targetId });

    if (!review) {
      res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify(
          {
            service: "control-plane",
            status: "not_found",
            message: `Collection review target not found: ${targetId}`,
          },
          null,
          2,
        ),
      );
      return;
    }

    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ service: "control-plane", status: review.status, review }, null, 2));
    return;
  }

  if (url.pathname === "/workflows/collection-rewrite/publish") {
    const targetId = url.searchParams.get("targetId") || "first-time";
    const result = await publishCollectionRewriteDraft({ targetId });

    if (!result) {
      res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify(
          {
            service: "control-plane",
            status: "not_found",
            message: `Collection publish target not found: ${targetId}`,
          },
          null,
          2,
        ),
      );
      return;
    }

    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ service: "control-plane", status: result.status, result }, null, 2));
    return;
  }

  if (url.pathname === "/workflows/collection-rewrite/rollback") {
    const targetId = url.searchParams.get("targetId") || "first-time";
    const result = await rollbackCollectionRewrite({ targetId });

    if (!result) {
      res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify(
          {
            service: "control-plane",
            status: "not_found",
            message: `Collection rollback target not found: ${targetId}`,
          },
          null,
          2,
        ),
      );
      return;
    }

    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ service: "control-plane", status: result.status, result }, null, 2));
    return;
  }

  if (url.pathname === "/workflows/product-rewrite") {
    const targetId = url.searchParams.get("targetId") || "kokocang-x";
    const plan = planProductRewrite({ targetId });

    if (!plan) {
      res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify(
          {
            service: "control-plane",
            status: "not_found",
            message: `Product rewrite target not found: ${targetId}`,
          },
          null,
          2,
        ),
      );
      return;
    }

    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ service: "control-plane", status: "planned", plan }, null, 2));
    return;
  }

  if (url.pathname === "/workflows/product-rewrite/generate") {
    const targetId = url.searchParams.get("targetId") || "kokocang-x";
    const draft = generateProductRewriteDraft({ targetId });

    if (!draft) {
      res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify(
          {
            service: "control-plane",
            status: "not_found",
            message: `Product generation target not found: ${targetId}`,
          },
          null,
          2,
        ),
      );
      return;
    }

    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ service: "control-plane", status: "generated", draft }, null, 2));
    return;
  }

  if (url.pathname === "/workflows/product-rewrite/review") {
    const targetId = url.searchParams.get("targetId") || "kokocang-x";
    const review = reviewProductRewriteDraft({ targetId });

    if (!review) {
      res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify(
          {
            service: "control-plane",
            status: "not_found",
            message: `Product review target not found: ${targetId}`,
          },
          null,
          2,
        ),
      );
      return;
    }

    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ service: "control-plane", status: review.status, review }, null, 2));
    return;
  }

  if (url.pathname === "/workflows/product-rewrite/publish") {
    const targetId = url.searchParams.get("targetId") || "kokocang-x";
    const result = await publishProductRewriteDraft({ targetId });

    if (!result) {
      res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify(
          {
            service: "control-plane",
            status: "not_found",
            message: `Product publish target not found: ${targetId}`,
          },
          null,
          2,
        ),
      );
      return;
    }

    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ service: "control-plane", status: result.status, result }, null, 2));
    return;
  }

  if (url.pathname === "/workflows/product-rewrite/rollback") {
    const targetId = url.searchParams.get("targetId") || "kokocang-x";
    const result = await rollbackProductRewrite({ targetId });

    if (!result) {
      res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify(
          {
            service: "control-plane",
            status: "not_found",
            message: `Product rollback target not found: ${targetId}`,
          },
          null,
          2,
        ),
      );
      return;
    }

    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ service: "control-plane", status: result.status, result }, null, 2));
    return;
  }

  if (url.pathname === "/workflows/guide-article") {
    const targetId = url.searchParams.get("targetId") || "how-to-choose";
    const plan = planGuideArticle({ targetId });

    if (!plan) {
      res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify(
          {
            service: "control-plane",
            status: "not_found",
            message: `Guide target not found: ${targetId}`,
          },
          null,
          2,
        ),
      );
      return;
    }

    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ service: "control-plane", status: "planned", plan }, null, 2));
    return;
  }

  if (url.pathname === "/workflows/guide-article/generate") {
    const targetId = url.searchParams.get("targetId") || "how-to-choose";
    const draft = generateGuideArticleDraft({ targetId });

    if (!draft) {
      res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify(
          {
            service: "control-plane",
            status: "not_found",
            message: `Guide generation target not found: ${targetId}`,
          },
          null,
          2,
        ),
      );
      return;
    }

    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ service: "control-plane", status: "generated", draft }, null, 2));
    return;
  }

  if (url.pathname === "/workflows/guide-article/review") {
    const targetId = url.searchParams.get("targetId") || "how-to-choose";
    const review = reviewGuideArticleDraft({ targetId });

    if (!review) {
      res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify(
          {
            service: "control-plane",
            status: "not_found",
            message: `Guide review target not found: ${targetId}`,
          },
          null,
          2,
        ),
      );
      return;
    }

    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ service: "control-plane", status: review.status, review }, null, 2));
    return;
  }

  if (url.pathname === "/workflows/guide-article/publish") {
    const targetId = url.searchParams.get("targetId") || "how-to-choose";
    const result = await publishGuideArticleDraft({ targetId });

    if (!result) {
      res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify(
          {
            service: "control-plane",
            status: "not_found",
            message: `Guide publish target not found: ${targetId}`,
          },
          null,
          2,
        ),
      );
      return;
    }

    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ service: "control-plane", status: result.status, result }, null, 2));
    return;
  }

  if (url.pathname === "/workflows/guide-article/rollback") {
    const targetId = url.searchParams.get("targetId") || "how-to-choose";
    const result = await rollbackGuideArticle({ targetId });

    if (!result) {
      res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify(
          {
            service: "control-plane",
            status: "not_found",
            message: `Guide rollback target not found: ${targetId}`,
          },
          null,
          2,
        ),
      );
      return;
    }

    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ service: "control-plane", status: result.status, result }, null, 2));
    return;
  }

  if (url.pathname.startsWith("/actions/")) {
    const id = url.pathname.split("/").pop();
    const actionRun = actionRuns.find((item) => item.id === id);

    if (!actionRun) {
      res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify(
          {
            service: "control-plane",
            status: "not_found",
            message: `Action run not found: ${id}`,
          },
          null,
          2,
        ),
      );
      return;
    }

    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(
      JSON.stringify(
        {
          service: "control-plane",
          status: "bootstrapped",
          item: actionRun,
        },
        null,
        2,
      ),
    );
    return;
  }

  const body = {
    service: "control-plane",
    status: "bootstrapped",
    message: "AI-native site control plane skeleton is ready.",
    cmsAdapter: adapterName,
    route: url.pathname,
    method: req.method,
    routes: [
      "/health",
      "/knowledge",
      "/knowledge?tag=faq",
      "/actions",
      "/actions/run-seo-001",
      "/drafts",
      "/drafts?entityType=faq",
      "/workflows/faq-expansion?targetType=product&targetId=kokocang-x",
      "/workflows/faq-expansion/generate?targetType=product&targetId=kokocang-x",
      "/workflows/faq-expansion/review?targetType=product&targetId=kokocang-x",
      "/workflows/faq-expansion/publish?targetType=product&targetId=kokocang-x",
      "/workflows/faq-expansion/rollback?targetType=product&targetId=kokocang-x",
      "/workflows/collection-rewrite?targetId=first-time",
      "/workflows/collection-rewrite/generate?targetId=first-time",
      "/workflows/collection-rewrite/review?targetId=first-time",
      "/workflows/collection-rewrite/publish?targetId=first-time",
      "/workflows/collection-rewrite/rollback?targetId=first-time",
      "/workflows/product-rewrite?targetId=kokocang-x",
      "/workflows/product-rewrite/generate?targetId=kokocang-x",
      "/workflows/product-rewrite/review?targetId=kokocang-x",
      "/workflows/product-rewrite/publish?targetId=kokocang-x",
      "/workflows/product-rewrite/rollback?targetId=kokocang-x",
      "/workflows/guide-article?targetId=how-to-choose",
      "/workflows/guide-article/generate?targetId=how-to-choose",
      "/workflows/guide-article/review?targetId=how-to-choose",
      "/workflows/guide-article/publish?targetId=how-to-choose",
      "/workflows/guide-article/rollback?targetId=how-to-choose",
    ],
  };

  res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body, null, 2));
  } catch (error) {
    res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
    res.end(
      JSON.stringify(
        {
          service: "control-plane",
          status: "error",
          message: error instanceof Error ? error.message : "Unknown server error",
          cmsAdapter: adapterName,
          route: url.pathname,
        },
        null,
        2,
      ),
    );
  }
});

const port = Number(process.env.PORT || 4300);
server.listen(port, () => {
  console.log(`control-plane listening on http://localhost:${port}`);
});
