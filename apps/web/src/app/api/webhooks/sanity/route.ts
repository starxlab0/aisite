import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { envServer } from "@/lib/env/server";

type SanityWebhookBody = {
  _id?: string;
  _type?: string;
  slug?: string | { current?: string | null } | null;
  productSlug?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  paths?: string[] | null;
};

function getSecret(req: Request) {
  const url = new URL(req.url);
  return (
    url.searchParams.get("secret") ||
    req.headers.get("x-webhook-secret") ||
    req.headers.get("x-sanity-secret") ||
    ""
  );
}

function resolveSlug(value: SanityWebhookBody["slug"]) {
  if (!value) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value.current === "string") return value.current.trim() || null;
  return null;
}

function resolveFaqTargetPath(targetType?: string | null, targetId?: string | null) {
  if (!targetType || !targetId) return null;
  if (targetType === "product") return `/product/${targetId}`;
  if (targetType === "collection") return `/collection/${targetId}`;
  return null;
}

function derivePaths(body: SanityWebhookBody) {
  const explicitPaths = Array.isArray(body.paths)
    ? body.paths.map((path) => String(path || "").trim()).filter(Boolean)
    : [];
  if (explicitPaths.length) return explicitPaths;

  const slug = resolveSlug(body.slug);
  const productSlug = String(body.productSlug || "").trim() || slug;
  const paths = new Set<string>();

  switch (body._type) {
    case "productContent":
      if (productSlug) paths.add(`/product/${productSlug}`);
      break;
    case "collectionPage":
      if (slug) paths.add(`/collection/${slug}`);
      break;
    case "guideArticle":
      paths.add("/guides");
      if (slug) paths.add(`/guides/${slug}`);
      break;
    case "faqItem":
      paths.add("/faq");
      {
        const targetPath = resolveFaqTargetPath(body.targetType, body.targetId);
        if (targetPath) paths.add(targetPath);
      }
      break;
    case "bundlePage":
      paths.add("/bundles");
      break;
    default:
      break;
  }

  return Array.from(paths);
}

export async function POST(req: Request) {
  const secret = getSecret(req);
  if (!envServer.revalidateSecret || secret !== envServer.revalidateSecret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as SanityWebhookBody | null;
  const paths = derivePaths(body ?? {});

  if (!paths.length) {
    return NextResponse.json({ ok: true, skipped: "no_paths_resolved" });
  }

  paths.forEach((path) => revalidatePath(path));
  return NextResponse.json({ ok: true, revalidated: paths });
}
