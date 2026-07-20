"use client";

import { useEffect } from "react";
import { type AttributionContext, writeAttributionContext } from "./attribution";

export function AttributionCapture({ context }: { context: AttributionContext }) {
  useEffect(() => {
    writeAttributionContext(context);
  }, [context]);

  return null;
}

