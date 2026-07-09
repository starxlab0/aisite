"use client";

const STORAGE_KEY = "signals:attribution";

export type AttributionContext = {
  src: "ai_concierge" | string;
  experiment?: string;
  bucket?: string;
  placement?: string;
  sourceProductSlug?: string | null;
  capturedAt?: string;
};

export function readAttributionContext(): AttributionContext | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as AttributionContext) : null;
  } catch {
    return null;
  }
}

export function writeAttributionContext(ctx: AttributionContext) {
  try {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...ctx, capturedAt: ctx.capturedAt ?? new Date().toISOString() }),
    );
  } catch {}
}

