async function triggerRevalidate(paths = []) {
  const uniquePaths = Array.from(new Set(paths.filter(Boolean)));
  const baseUrl =
    process.env.WEB_BASE_URL ||
    process.env.SITE_BASE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "";
  const secret = process.env.REVALIDATE_SECRET;

  if (!uniquePaths.length) {
    return { ok: true, skipped: true, reason: "no-paths", revalidated: [] };
  }

  if (!baseUrl || !secret) {
    return {
      ok: false,
      skipped: true,
      reason: "missing-base-url-or-secret",
      revalidated: [],
      requested: uniquePaths,
    };
  }

  const url = `${baseUrl.replace(/\/$/, "")}/api/revalidate?secret=${encodeURIComponent(secret)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ paths: uniquePaths }),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    return {
      ok: false,
      skipped: false,
      reason: payload?.error || `http-${response.status}`,
      revalidated: [],
      requested: uniquePaths,
    };
  }

  return {
    ok: true,
    skipped: false,
    revalidated: payload?.revalidated ?? uniquePaths,
    requested: uniquePaths,
  };
}

module.exports = {
  triggerRevalidate,
};

