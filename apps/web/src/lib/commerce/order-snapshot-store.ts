import { envServer } from "@/lib/env/server";
import type { Order } from "@/types/order";

async function controlPlaneFetch(path: string, init?: RequestInit) {
  if (!envServer.controlPlaneUrl) {
    throw new Error("control_plane_not_configured");
  }
  const url = `${envServer.controlPlaneUrl.replace(/\/$/, "")}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(envServer.opsBearerToken ? { authorization: `Bearer ${envServer.opsBearerToken}` } : {}),
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`control_plane_http_${res.status}`);
  }
  return res.json();
}

export async function upsertOrderSnapshot(order: Order) {
  try {
    await controlPlaneFetch("/ops/order-snapshots", {
      method: "POST",
      body: JSON.stringify({ order, source: "web" }),
    });
  } catch {
    // Best-effort snapshot persistence. The order page can still fall back to cookie/session state.
  }
}

export async function getStoredOrderSnapshotById(id: string): Promise<Order | null> {
  try {
    const json = await controlPlaneFetch(`/ops/order-snapshots/${encodeURIComponent(id)}`);
    return (json?.data?.snapshot as Order | null) || null;
  } catch {
    return null;
  }
}
