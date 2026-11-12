/** Shared /api/meta hook: fetched once, cached module-level. */
import { useEffect, useState } from "react";
import { apiGet } from "../lib/api";
import { type MetaResponse } from "../types";

let cached: MetaResponse | null = null;
let promise: Promise<MetaResponse> | null = null;

export function useMeta(): MetaResponse | null {
  const [meta, setMeta] = useState<MetaResponse | null>(cached);
  useEffect(() => {
    if (cached) return;
    if (!promise) {
      promise = apiGet<MetaResponse>("/api/meta").then((m) => {
        cached = m;
        return m;
      });
    }
    promise.then(setMeta).catch(() => undefined);
  }, []);
  return meta;
}
