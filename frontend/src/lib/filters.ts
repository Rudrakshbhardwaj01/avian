/** Small client-side helpers for the global filter object. */
import { type Filters } from "../types";

/** Short stable hash for displaying/attaching the current filter state. */
export function filterHash(f: Filters): string {
  const s = JSON.stringify(f, Object.keys(f).sort());
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36).slice(0, 6);
}
