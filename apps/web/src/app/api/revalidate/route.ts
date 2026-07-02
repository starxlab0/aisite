import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

/**
 * 用于 webhook 触发 ISR 相关页面刷新。
 *
 * 支持批量按 path 触发 ISR 刷新。
 */
export async function POST(req: Request) {
  const secret = new URL(req.url).searchParams.get("secret");
  if (!process.env.REVALIDATE_SECRET || secret !== process.env.REVALIDATE_SECRET) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { paths?: string[] } | null = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const paths = Array.from(
    new Set(
      (Array.isArray(body?.paths) ? body.paths : [])
        .filter((path): path is string => typeof path === "string")
        .map((path) => path.trim())
        .filter(Boolean),
    ),
  );

  if (!paths.length) {
    return NextResponse.json({ ok: false, error: "paths required" }, { status: 400 });
  }

  paths.forEach((path) => revalidatePath(path));

  return NextResponse.json({ ok: true, revalidated: paths });
}
