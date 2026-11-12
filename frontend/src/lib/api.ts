/** Thin API client. All requests stay on localhost (vite proxies /api). */
import { EMPTY_FILTERS, type Filters } from "../types";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (body?.detail) detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {
      /* keep statusText */
    }
    throw new ApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

export function filtersToParams(f: Filters = EMPTY_FILTERS): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  const lists: [string, string[] | undefined][] = [
    ["orders", f.orders],
    ["families", f.families],
    ["genera", f.genera],
    ["habitat", f.habitat],
    ["migration", f.migration],
    ["trophicLevel", f.trophicLevel],
    ["trophicNiche", f.trophicNiche],
    ["lifestyle", f.lifestyle],
    ["iucn", f.iucn],
    ["breedingRegion", f.breedingRegion],
  ];
  for (const [key, value] of lists) {
    if (value && value.length) p.set(key, value.join(","));
  }
  if (f.excludeImputed) p.set("excludeImputed", "true");
  if (f.traitsOnly) p.set("traitsOnly", "true");
  if (f.conservationOnly) p.set("conservationOnly", "true");
  if (f.geoOnly) p.set("geoOnly", "true");
  if (f.massMin !== undefined && f.massMin !== null) p.set("massMin", String(f.massMin));
  if (f.massMax !== undefined && f.massMax !== null) p.set("massMax", String(f.massMax));
  return p;
}

export async function apiGet<T>(path: string, params?: URLSearchParams | Record<string, string | number | boolean | undefined>): Promise<T> {
  let qs = "";
  if (params instanceof URLSearchParams) {
    qs = params.toString();
  } else if (params) {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) p.set(k, String(v));
    }
    qs = p.toString();
  }
  const res = await fetch(`${path}${qs ? `?${qs}` : ""}`);
  return handle<T>(res);
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return handle<T>(res);
}

export function exportUrl(path: string, filters: Filters): string {
  return `${path}?${filtersToParams(filters).toString()}`;
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
