const http = require("http");
const path = require("path");
const { URL } = require("url");
const { createCmsAdapter } = require("./cms-adapters");
const { createMonitoringLoop } = require("./ops/monitoring-loop");
const { handleOpsRoute } = require("./ops/router");
const { handleSignalsRoute } = require("./signals/router");

const PORT = Number(process.env.PORT || 4200);
const cmsAdapter = createCmsAdapter();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || `localhost:${PORT}`}`);

  if (await handleSignalsRoute(req, res, url)) {
    return;
  }

  if (await handleOpsRoute(req, res, url, cmsAdapter.mode)) {
    return;
  }

  if (url.pathname === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        service: "control-plane",
        status: "ok",
        cmsAdapter: cmsAdapter.mode,
      }),
    );
    return;
  }

  if (url.pathname === "/") {
    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Control Plane</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 0; padding: 2rem; background: #111827; color: #f9fafb; }
      .card { max-width: 680px; margin: 3rem auto; background: rgba(17,24,39,0.92); border: 1px solid rgba(255,255,255,0.08); border-radius: 18px; padding: 2rem; }
      h1 { margin-top: 0; font-size: 2rem; }
      code { background: rgba(255,255,255,0.08); padding: 0.125rem 0.375rem; border-radius: 6px; }
      a { color: #93c5fd; }
    </style>
  </head>
  <body>
    <div class="card">
      <p>AI-native Site System</p>
      <h1>Control Plane</h1>
      <p>The control plane is running. Use <code>/ops</code> for content workflows and <code>/signals</code> for telemetry ingestion.</p>
      <p>CMS adapter: <strong>${cmsAdapter.mode}</strong></p>
      <p>Health check: <a href="/health">/health</a></p>
    </div>
  </body>
</html>`;
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }

  res.writeHead(404, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      service: "control-plane",
      status: "not_found",
      path: url.pathname,
      cmsAdapter: cmsAdapter.mode,
    }),
  );
});

server.listen(PORT, () => {
  console.log(`[control-plane] listening on http://localhost:${PORT} (cms=${cmsAdapter.mode})`);
});

createMonitoringLoop();
