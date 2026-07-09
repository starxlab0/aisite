"use client";

import { envClient } from "@/lib/env/client";

type Bucket = "A" | "B";

function safeGet(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {}
}

export function getExperimentBucket(experimentId = envClient.aiConciergeExperiment): Bucket {
  const storageKey = `exp:${experimentId}`;
  const existing = safeGet(storageKey);
  if (existing === "A" || existing === "B") return existing;
  const bucket: Bucket = Math.random() < 0.5 ? "A" : "B";
  safeSet(storageKey, bucket);
  return bucket;
}

