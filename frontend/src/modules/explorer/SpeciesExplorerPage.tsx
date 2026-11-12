/** Module 2 — Species Explorer: search, combine filters, sort, paginate. */
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { apiGet } from "../../lib/api";
import { useMeta } from "../../hooks/useMeta";
import { useDebounce } from "../../hooks/useDebounce";
import { FilterBar } from "../../components/FilterBar";
import { DataTable, type Column } from "../../components/DataTable";
import { ExportMenu } from "../../components/ExportMenu";
import { IucnBadge, Missing, PageHeader, Pill, Section } from "../../components/ui";
import { fmtNum } from "../../lib/theme";
import { type SpeciesRow } from "../../types";
import { useApp } from "../../state/store";

const SORTS = [
  { value: "seq", label: "AviList sequence" },
  { value: "en", label: "English name" },
  { value: "sci", label: "Scientific name" },
  { value: "order", label: "Order" },
  { value: "family", label: "Family" },
  { value: "massG", label: "Body mass" },
  { value: "subspeciesCount", label: "Subspecies count" },
];

const SORT_KEY_TO_BACKEND: Record<string, string> = {
  name: "en",
  order: "order",
  family: "family",
  iucn: "iucnRank",
  massG: "massG",
  sub: "subspeciesCount",
};

interface ListResponse {
  total: number;
  page: number;
  pageSize: number;
  pages: number;
  rows: SpeciesRow[];
}

export default function SpeciesExplorerPage() {
  const navigate = useNavigate();
  const meta = useMeta();
  const filters = useApp((s) => s.filters);
  const setFilter = useApp((s) => s.setFilter);

  const [q, setQ] = useState<string>(filters.q ?? "");
  const debouncedQ = useDebounce(q, 250);
  const [sort, setSort] = useState("seq");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setFilter({ q: debouncedQ || undefined });
    setPage(1);
  }, [debouncedQ, setFilter]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const f = { ...filters, q: debouncedQ || undefined };
    const qs = new URLSearchParams();
    if (f.q) qs.set("q", f.q);
    const lists: [string, string[] | undefined][] = [
      ["orders", f.orders], ["families", f.families], ["genera", f.genera],
      ["habitat", f.habitat], ["migration", f.migration], ["trophicNiche", f.trophicNiche],
      ["trophicLevel", f.trophicLevel], ["lifestyle", f.lifestyle], ["iucn", f.iucn],
      ["breedingRegion", f.breedingRegion],
    ];
    for (const [k, v] of lists) if (v && v.length) qs.set(k, v.join(","));
    if (f.excludeImputed) qs.set("excludeImputed", "true");
    if (f.traitsOnly) qs.set("traitsOnly", "true");
    if (f.conservationOnly) qs.set("conservationOnly", "true");
    if (f.geoOnly) qs.set("geoOnly", "true");
    if (f.massMin !== undefined && f.massMin !== null) qs.set("massMin", String(f.massMin));
    if (f.massMax !== undefined && f.massMax !== null) qs.set("massMax", String(f.massMax));
    qs.set("page", String(page));
    qs.set("pageSize", "50");
    qs.set("sort", sort);
    qs.set("dir", dir);

    apiGet<ListResponse>(`/api/species?${qs.toString()}`)
      .then((r) => {
        if (!cancelled) setData(r);
      })
      .catch((e) => setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [filters, debouncedQ, sort, dir, page]);

  const columns: Column<SpeciesRow>[] = [
    {
      key: "name",
      header: "Species",
      render: (r) => (
        <div>
          <div className="font-medium text-ink">
            {r.en}
            {r.enIsFallback && <span className="ml-1.5 text-[10px] italic text-ink3">scientific fallback</span>}
          </div>
          <div className="tnum text-xs italic text-ink2">
            {r.sci} · {r.genus}
            {r.traitsInferred && <span className="ml-1 not-italic text-warn" title="AVONET imputed some traits">◈</span>}
          </div>
        </div>
      ),
      sortable: true,
    },
    { key: "order", header: "Order", render: (r) => <span className="text-ink2">{r.order}</span>, sortable: true },
    { key: "family", header: "Family", render: (r) => <span className="text-ink2">{r.family}</span>, sortable: true },
    { key: "iucn", header: "IUCN", render: (r) => <IucnBadge category={r.iucn} />, sortable: true },
    {
      key: "habitat",
      header: "Habitat / Migration",
      render: (r) => (
        <span className="text-xs text-ink2">
          {r.habitat ?? <Missing>no habitat</Missing>} · {r.migration ?? <Missing>no migration</Missing>}
        </span>
      ),
    },
    { key: "massG", header: "Mass (g)", numeric: true, render: (r) => <span className="tnum text-ink">{r.massG !== null ? fmtNum(r.massG, 1) : <Missing>—</Missing>}</span>, sortable: true },
    { key: "sub", header: "Subsp.", numeric: true, render: (r) => <span className="tnum text-ink2">{r.subspeciesCount || "·"}</span>, sortable: true },
    { key: "concept", header: "Concept", render: (r) => (r.taxonConcept !== "same" ? <Pill tone="warn">{r.taxonConcept}</Pill> : null) },
  ];

  const onSort = useCallback(
    (key: string) => {
      const target = SORT_KEY_TO_BACKEND[key] ?? "seq";
      if (sort === target) setDir((d) => (d === "asc" ? "desc" : "asc"));
      else {
        setSort(target);
        setDir("asc");
      }
      setPage(1);
    },
    [sort],
  );

  const tableSortKey = Object.entries(SORT_KEY_TO_BACKEND).find(([, backend]) => backend === sort)?.[0];

  return (
    <div>
      <PageHeader
        title="Species Explorer"
        subtitle="Search 11,011 species by any name or identifier and combine filters. Search covers English, scientific, genus, family, order, species IDs and all 45 translated languages."
      >
        <ExportMenu />
      </PageHeader>

      <Section className="mb-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g. Somali Ostrich, Struthio, Struthio_molybdophanes, 鸵鸟, Buse…" 
            className="w-96 max-w-full rounded-sm border border-line bg-bg px-3 py-1.5 text-sm text-ink outline-none focus:border-accent"
          />
          <select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }} className="rounded-sm border border-line bg-bg px-2 py-1.5 text-sm text-ink2">
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>sort: {s.label}</option>
            ))}
          </select>
          <button type="button" onClick={() => setDir((d) => (d === "asc" ? "desc" : "asc"))} className="rounded-sm border border-line bg-bg px-2 py-1.5 text-sm text-ink2" title="Toggle sort direction">
            {dir === "asc" ? "▲ asc" : "▼ desc"}
          </button>
          <span className="ml-auto text-xs text-ink3">body mass range (g)</span>
          <input
            type="number"
            placeholder="min"
            value={filters.massMin ?? ""}
            onChange={(e) => setFilter({ massMin: e.target.value === "" ? undefined : Number(e.target.value) })}
            className="tnum w-24 rounded-sm border border-line bg-bg px-2 py-1.5 text-sm"
          />
          <input
            type="number"
            placeholder="max"
            value={filters.massMax ?? ""}
            onChange={(e) => setFilter({ massMax: e.target.value === "" ? undefined : Number(e.target.value) })}
            className="tnum w-24 rounded-sm border border-line bg-bg px-2 py-1.5 text-sm"
          />
        </div>
        <FilterBar meta={meta} />
        <div className="mt-2 flex flex-wrap gap-4 text-xs text-ink2">
          <label className="flex cursor-pointer items-center gap-1.5" title="Only species with any AVONET trait data (10,423 species)">
            <input type="checkbox" className="accent-accent" checked={filters.traitsOnly ?? false} onChange={(e) => setFilter({ traitsOnly: e.target.checked })} />
            has trait data
          </label>
          <label className="flex cursor-pointer items-center gap-1.5" title="Only species with an IUCN category in the source (10,140 species)">
            <input type="checkbox" className="accent-accent" checked={filters.conservationOnly ?? false} onChange={(e) => setFilter({ conservationOnly: e.target.checked })} />
            has IUCN status
          </label>
          <label className="flex cursor-pointer items-center gap-1.5" title="Only species with IOC breeding-region codes">
            <input type="checkbox" className="accent-accent" checked={filters.geoOnly ?? false} onChange={(e) => setFilter({ geoOnly: e.target.checked })} />
            has breeding region
          </label>
        </div>
      </Section>

      <Section
        title={data ? `${fmtNum(data.total)} species match · effective sample size shown` : "Loading…"}
        aside={loading ? <span className="text-xs text-ink3">updating…</span> : undefined}
      >
        {error && <div className="text-sm text-danger">{error}</div>}
        {data && (
          <DataTable
            columns={columns}
            rows={data.rows}
            total={data.total}
            page={data.page}
            pages={data.pages}
            onPage={setPage}
            onSort={onSort}
            sort={tableSortKey}
            dir={dir}
            onRowClick={(r) => navigate(`/species/${r.id}`)}
          />
        )}
      </Section>
    </div>
  );
}
