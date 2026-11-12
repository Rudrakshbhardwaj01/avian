/** Module 7 — Geography Lab: IOC breeding-region codes and searchable range
 *  text. The source has NO coordinates or polygons; nothing is fabricated. */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import type { Data } from "plotly.js-dist-min";
import { apiGet, apiPost, downloadJson } from "../../lib/api";
import { useDebounce } from "../../hooks/useDebounce";
import { useMeta } from "../../hooks/useMeta";
import { FilterBar } from "../../components/FilterBar";
import { DataTable, type Column } from "../../components/DataTable";
import { EmptyState, Loading, MethodNote, PageHeader, Section } from "../../components/ui";
import { Plot, baseLayout } from "../../components/Plot";
import { fmtNum, palette, REGION_LABELS } from "../../lib/theme";
import { useApp } from "../../state/store";

interface RegionStats {
  n: number;
  nWithRegion: number;
  regions: { code: string; label: string; nSpecies: number; pct: number; documented: boolean }[];
  combinations: { code: string; nSpecies: number }[];
  note: string;
}
interface RegionByTaxon {
  taxonLevel: string;
  regionCodes: string[];
  rows: { taxon: string; n: number; regions: Record<string, number> }[];
}
interface ShortRanges { thresholdChars: number | null; species: { id: string; sci: string; en: string | null; rangeText: string; len: number }[] }
interface RangeSearch { q: string; nMatches: number; results: { id: string; sci: string; en: string | null; rangeText: string; breedingRegion: string | null }[] }

export default function GeographyPage() {
  const meta = useMeta();
  const dark = useApp((s) => s.theme === "dark");
  const p = palette(dark);
  const navigate = useNavigate();
  const filters = useApp((s) => s.filters);

  const [stats, setStats] = useState<RegionStats | null>(null);
  const [byTaxon, setByTaxon] = useState<RegionByTaxon | null>(null);
  const [taxonLevel, setTaxonLevel] = useState("order");
  const [short, setShort] = useState<ShortRanges | null>(null);
  const [q, setQ] = useState("");
  const debouncedQ = useDebounce(q, 300);
  const [search, setSearch] = useState<RangeSearch | null>(null);

  useEffect(() => {
    apiGet<RegionStats>("/api/geography/regions").then(setStats).catch(() => undefined);
    apiGet<ShortRanges>("/api/geography/short-ranges").then(setShort).catch(() => undefined);
  }, []);

  useEffect(() => {
    apiGet<RegionByTaxon>("/api/geography/region-by-taxon", { taxonLevel, maxTaxa: 12 }).then(setByTaxon).catch(() => undefined);
  }, [taxonLevel]);

  useEffect(() => {
    const query = debouncedQ.trim();
    if (!query) { setSearch(null); return; }
    apiPost<RangeSearch>("/api/geography/search", { filters, q: query }).then(setSearch).catch(() => undefined);
  }, [debouncedQ, filters]);

  const regionBar: Data[] = stats ? [
    {
      type: "bar",
      orientation: "h",
      x: stats.regions.map((r) => r.nSpecies),
      y: stats.regions.map((r) => r.label),
      marker: { color: p.info },
      hovertemplate: "%{y}: %{x:,} species<extra></extra>",
    },
  ] : [];

  const heatData: Data[] = byTaxon ? [
    {
      type: "heatmap",
      z: byTaxon.rows.map((r) => byTaxon.regionCodes.map((c) => r.regions[c] ?? 0)),
      x: byTaxon.regionCodes.map((c) => REGION_LABELS[c] ?? c),
      y: byTaxon.rows.map((r) => r.taxon),
      colorscale: [[0, p.paper], [1, p.info]],
      hovertemplate: "%{y} × %{x}: %{z}<extra></extra>",
      colorbar: { title: { text: "species" }, thickness: 12 },
    },
  ] : [];

  const searchColumns: Column<RangeSearch["results"][number]>[] = [
    { key: "species", header: "Species", render: (r) => <span>{r.en ?? r.sci} <span className="tnum text-xs italic text-ink2">{r.sci}</span></span> },
    { key: "region", header: "Region", render: (r) => <span className="tnum text-xs">{r.breedingRegion ?? "—"}</span> },
    { key: "range", header: "Range text (excerpt)", render: (r) => <span className="text-xs text-ink2">{r.rangeText.length > 160 ? r.rangeText.slice(0, 160) + "…" : r.rangeText}</span> },
  ];

  return (
    <div>
      <PageHeader
        title="Geography Lab"
        subtitle="Breeding-region codes and textual range statements from AviList and IOC 15.2. The source contains no coordinates or range polygons — this module never invents them."
      />

      <Section className="mb-4">
        <FilterBar meta={meta} />
      </Section>

      <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Section title="Species per IOC breeding region">
          {stats ? (
            <>
              <Plot
                height={420}
                data={regionBar}
                layout={{ ...baseLayout(dark), margin: { l: 160, r: 20, t: 10, b: 40 }, yaxis: { tickfont: { size: 11 } }, xaxis: { title: { text: "species" } } }}
                onClick={(ev) => {
                  const label = (ev as { points?: { y?: string }[] }).points?.[0]?.y;
                  const code = Object.entries(REGION_LABELS).find(([, v]) => v === label)?.[0];
                  if (code) {
                    useApp.getState().setFilter({ breedingRegion: [code] });
                    navigate("/explorer");
                  }
                }}
              />
              <MethodNote>{stats.note}</MethodNote>
            </>
          ) : <Loading />}
        </Section>

        <Section title={`Region composition by ${taxonLevel}`} aside={
          <select value={taxonLevel} onChange={(e) => setTaxonLevel(e.target.value)} className="rounded-sm border border-line bg-bg px-2 py-1 text-sm">
            <option value="order">order</option>
            <option value="family">family</option>
            <option value="genus">genus</option>
          </select>
        }>
          {byTaxon ? (
            <>
              <Plot height={Math.max(320, 26 * byTaxon.rows.length + 80)} data={heatData} layout={{ ...baseLayout(dark) }} />
              <MethodNote>Cell = number of species of that {taxonLevel} whose breeding-region string includes that region. Top 12 {taxonLevel}s by species count.</MethodNote>
            </>
          ) : <Loading />}
        </Section>
      </div>

      <Section title="Search range descriptions" className="mb-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g. Madagascar, Amazon, Himalaya, savanna, boreal, island…"
            className="w-96 max-w-full rounded-sm border border-line bg-bg px-3 py-1.5 text-sm outline-none focus:border-accent"
          />
          {search && <span className="tnum text-xs text-ink3">{fmtNum(search.nMatches)} species match</span>}
        </div>
        {search ? (
          search.nMatches === 0 ? (
            <EmptyState title={`No range text contains “${search.q}”`} hint="The dataset has range statements for all species; try a broader term." />
          ) : (
            <DataTable columns={searchColumns} rows={search.results} onRowClick={(r) => navigate(`/species/${r.id}`)} />
          )
        ) : (
          <p className="text-sm text-ink3">Type to search the 11,011 textual range statements (case-insensitive substring).</p>
        )}
      </Section>

      <Section title="Unusually short range descriptions (data-quality view)">
        {short ? (
          <>
            {short.thresholdChars !== null && (
              <p className="mb-2 text-sm text-ink2">
                {short.species.length} species have range text at or below the {Math.round(short.thresholdChars)}-character threshold (bottom 5% of text length). A short description may indicate a genuinely tiny range <em>or</em> sparse source text — inspect before interpreting.
              </p>
            )}
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-line"><th className="overline px-2 py-1">Species</th><th className="overline px-2 py-1">Range text</th><th className="overline px-2 py-1 text-right">chars</th></tr></thead>
                <tbody>
                  {short.species.map((r) => (
                    <tr key={r.id} className="cursor-pointer border-b border-line hover:bg-panel2" onClick={() => navigate(`/species/${r.id}`)}>
                      <td className="whitespace-nowrap px-2 py-1">{r.en ?? r.sci}</td>
                      <td className="px-2 py-1 text-xs text-ink2">{r.rangeText}</td>
                      <td className="tnum px-2 py-1 text-right text-ink3">{r.len}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <MethodNote>
              This is a view of textual completeness, not of range size. Nothing in the source supports computing range areas.
              {stats && (
                <button type="button" onClick={() => downloadJson("avian-region-stats.json", stats)} className="ml-2 text-accent hover:underline">
                  export region stats
                </button>
              )}
            </MethodNote>
          </>
        ) : <Loading />}
      </Section>
    </div>
  );
}
