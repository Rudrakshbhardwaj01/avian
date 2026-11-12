/** Module 6 — Conservation Lab: IUCN composition by group, CITES, extinct-
 *  flagged species, missing-data visibility. Original categories preserved. */
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import type { Data } from "plotly.js-dist-min";
import { apiPost, downloadJson } from "../../lib/api";
import { useMeta } from "../../hooks/useMeta";
import { FilterBar } from "../../components/FilterBar";
import { IucnBadge, Loading, MethodNote, PageHeader, Section, StatTile } from "../../components/ui";
import { Plot, baseLayout } from "../../components/Plot";
import { fmtNum, iucnColor } from "../../lib/theme";
import { useApp } from "../../state/store";

const GROUP_VARS = [
  { value: "", label: "All species" },
  { value: "order", label: "by order" },
  { value: "family", label: "by family (top 15)" },
  { value: "habitat", label: "by habitat" },
  { value: "migration", label: "by migration" },
  { value: "trophicNiche", label: "by trophic niche" },
  { value: "lifestyle", label: "by lifestyle" },
];

interface Composition {
  groupVar: string | null;
  n: number;
  overall: Record<string, number>;
  overallIucn: Record<string, number>;
  iucnSequence: string[];
  broadSequence: string[];
  broadNote: string;
  rows: { group: string; n: number; nAssessed: number; threatened: number; threatenedPct: number; broad: Record<string, number>; iucn: Record<string, number>; missingIucn: number }[];
}
interface CitesResponse { n: number; nListed: number; nMissing: number; values: Record<string, number>; note: string }
interface ExtinctionResponse {
  nFlagged: number;
  values: Record<string, number>;
  species: { id: string; sci: string; en: string | null; extinctionStatus: string; iucn: string | null; order: string; family: string }[];
}

export default function ConservationPage() {
  const meta = useMeta();
  const dark = useApp((s) => s.theme === "dark");
  const navigate = useNavigate();
  const filters = useApp((s) => s.filters);
  const [params] = useSearchParams();

  const [groupVar, setGroupVar] = useState(params.get("groupVar") ?? "");
  const [comp, setComp] = useState<Composition | null>(null);
  const [cites, setCites] = useState<CitesResponse | null>(null);
  const [ext, setExt] = useState<ExtinctionResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    apiPost<Composition>("/api/conservation/composition", { filters, groupVar: groupVar || null, maxGroups: 15 })
      .then(setComp)
      .finally(() => setLoading(false));
  }, [filters, groupVar]);

  useEffect(() => {
    apiPost<CitesResponse>("/api/conservation/cites", { filters }).then(setCites).catch(() => undefined);
    apiPost<ExtinctionResponse>("/api/conservation/extinction", { filters }).then(setExt).catch(() => undefined);
  }, [filters]);

  // overall IUCN bar
  const iucnBar: Data[] = comp ? [
    {
      type: "bar",
      x: comp.iucnSequence.filter((c) => comp.overallIucn[c] !== undefined),
      y: comp.iucnSequence.filter((c) => comp.overallIucn[c] !== undefined).map((c) => comp.overallIucn[c]),
      marker: { color: comp.iucnSequence.filter((c) => comp.overallIucn[c] !== undefined).map((c) => iucnColor(c, dark)) },
      hovertemplate: "%{x}: %{y:,}<extra></extra>",
    },
  ] : [];

  // stacked percentage composition by group
  const stacked: Data[] = comp && groupVar ? [
    {
      type: "bar",
      x: comp.rows.map((r) => `${r.group}`),
      y: comp.rows.map((r) => (100 * (r.broad["Threatened"] ?? 0)) / r.n),
      name: "Threatened (VU/EN/CR)",
      marker: { color: iucnColor("VU", dark) },
      hovertemplate: "%{y:.1f}%<extra></extra>",
    },
    {
      type: "bar",
      x: comp.rows.map((r) => `${r.group}`),
      y: comp.rows.map((r) => (100 * (r.broad["Near Threatened"] ?? 0)) / r.n),
      name: "Near Threatened",
      marker: { color: iucnColor("NT", dark) },
      hovertemplate: "%{y:.1f}%<extra></extra>",
    },
    {
      type: "bar",
      x: comp.rows.map((r) => `${r.group}`),
      y: comp.rows.map((r) => (100 * (r.broad["Least Concern"] ?? 0)) / r.n),
      name: "Least Concern",
      marker: { color: iucnColor("LC", dark) },
      hovertemplate: "%{y:.1f}%<extra></extra>",
    },
    {
      type: "bar",
      x: comp.rows.map((r) => `${r.group}`),
      y: comp.rows.map((r) => (100 * ((r.broad["Extinct"] ?? 0) + (r.broad["Possibly extinct (CR)"] ?? 0) + (r.broad["Data Deficient"] ?? 0))) / r.n),
      name: "Extinct/possibly extinct/DD",
      marker: { color: iucnColor("EX", dark) },
      hovertemplate: "%{y:.1f}%<extra></extra>",
    },
    {
      type: "bar",
      x: comp.rows.map((r) => `${r.group}`),
      y: comp.rows.map((r) => (100 * r.missingIucn) / r.n),
      name: "Not assessed (missing)",
      marker: { color: dark ? "#5c594f" : "#c4c0b6" },
      hovertemplate: "%{y:.1f}%<extra></extra>",
    },
  ] : [];

  return (
    <div>
      <PageHeader
        title="Conservation Lab"
        subtitle="IUCN Red List categories (BirdLife v10 as delivered in AviList), CITES appendices, and extinction flags. Missing categories are shown explicitly — they are never treated as Least Concern."
      />

      <Section className="mb-4">
        <FilterBar meta={meta} />
      </Section>

      <Section title="IUCN category distribution" className="mb-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <select value={groupVar} onChange={(e) => setGroupVar(e.target.value)} className="rounded-sm border border-line bg-bg px-2 py-1.5 text-sm">
            {GROUP_VARS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
          </select>
          {comp && <span className="tnum text-xs text-ink3">n = {fmtNum(comp.n)} species · {fmtNum(comp.n - (comp.rows[0]?.nAssessed ?? 0))} missing status</span>}
          {comp && (
            <button type="button" onClick={() => downloadJson("avian-conservation-composition.json", comp)} className="ml-auto rounded-sm border border-line px-2 py-1 text-xs text-ink2 hover:border-accent">
              export composition
            </button>
          )}
        </div>
        {loading || !comp ? <Loading /> : (
          <>
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
              <StatTile label="Species (filtered)" value={fmtNum(comp.n)} />
              <StatTile label="Threatened (VU+EN+CR)" value={fmtNum((comp.overall["Threatened"] ?? 0))} sub="original categories preserved" />
              <StatTile label="Extinct (EX+EW)" value={fmtNum(comp.overall["Extinct"] ?? 0)} />
              <StatTile label="Possibly extinct (CR PE/PEW)" value={fmtNum(comp.overall["Possibly extinct (CR)"] ?? 0)} />
              <StatTile label="Data Deficient" value={fmtNum(comp.overall["Data Deficient"] ?? 0)} />
              <StatTile label="Missing IUCN" value={fmtNum(Object.values(comp.overallIucn).reduce((a, b) => a + b, 0) ? comp.n - Object.values(comp.overallIucn).reduce((a, b) => a + b, 0) : comp.n)} sub="absence ≠ Least Concern" />
              <StatTile label="Extinction-flagged" value={fmtNum(ext?.nFlagged ?? 0)} sub="AviList extinction flag" />
            </div>
            {!groupVar ? (
              <Plot height={320} data={iucnBar} layout={{ ...baseLayout(dark), margin: { l: 50, r: 20, t: 10, b: 70 }, xaxis: { tickangle: -30, tickfont: { size: 10.5 } }, yaxis: { title: { text: "species" } } }} />
            ) : (
              <Plot
                height={420}
                data={stacked}
                layout={{
                  ...baseLayout(dark),
                  barmode: "stack",
                  margin: { l: 50, r: 20, t: 10, b: 110 },
                  xaxis: { tickangle: -40, tickfont: { size: 10 } },
                  yaxis: { title: { text: "% of species in group" }, ticksuffix: "%" },
                }}
                onClick={(ev) => {
                  const label = (ev as { points?: { x?: string }[] }).points?.[0]?.x;
                  if (!label) return;
                  useApp.getState().setFilter(groupVar === "family" ? { families: [label.split(" — ")[0]] } : groupVar === "order" ? { orders: [label] } : groupVar === "habitat" ? { habitat: [label] } : groupVar === "migration" ? { migration: [label] } : groupVar === "trophicNiche" ? { trophicNiche: [label] } : groupVar === "lifestyle" ? { lifestyle: [label] } : {});
                  navigate("/explorer");
                }}
              />
            )}
            {groupVar && (
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <th className="overline px-2 py-1">Group</th><th className="overline px-2 py-1 text-right">n</th>
                    <th className="overline px-2 py-1 text-right">Assessed</th><th className="overline px-2 py-1 text-right">Threatened</th>
                    <th className="overline px-2 py-1 text-right">Threatened %</th><th className="overline px-2 py-1 text-right">Missing IUCN</th>
                  </tr>
                </thead>
                <tbody>
                  {comp.rows.map((r) => (
                    <tr key={r.group} className="border-b border-line">
                      <td className="px-2 py-1">{r.group}</td>
                      <td className="tnum px-2 py-1 text-right">{fmtNum(r.n)}</td>
                      <td className="tnum px-2 py-1 text-right text-ink2">{fmtNum(r.nAssessed)}</td>
                      <td className="tnum px-2 py-1 text-right">{fmtNum(r.threatened)}</td>
                      <td className="tnum px-2 py-1 text-right">{r.threatenedPct.toFixed(1)}%</td>
                      <td className="tnum px-2 py-1 text-right text-ink2">{fmtNum(r.missingIucn)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <MethodNote>{comp.broadNote}</MethodNote>
            <MethodNote>
              This dataset records which species hold which categories — it does not establish <em>why</em> a species is threatened. Population trends, drivers, or causal factors are not present in the source and are not inferred here.
            </MethodNote>
          </>
        )}
      </Section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Section title="CITES appendices (separate from IUCN)">
          {cites ? (
            <>
              <div className="mb-2 flex gap-2">
                <StatTile label="Listed" value={fmtNum(cites.nListed)} />
                <StatTile label="No CITES field" value={fmtNum(cites.nMissing)} sub="absence ≠ unlisted" />
              </div>
              <ul className="text-sm text-ink2">
                {Object.entries(cites.values).map(([k, v]) => (
                  <li key={k} className="flex justify-between border-b border-line py-1">
                    <span>Appendix {k}</span>
                    <span className="tnum">{fmtNum(v)}</span>
                  </li>
                ))}
              </ul>
              <MethodNote>{cites.note}</MethodNote>
            </>
          ) : <Loading />}
        </Section>

        <Section title={`Extinction-flagged species (${ext?.nFlagged ?? "…"})`}>
          {ext ? (
            ext.nFlagged === 0 ? (
              <p className="text-sm text-ink2">No extinction-flagged species under the current filters.</p>
            ) : (
              <div className="max-h-80 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-line"><th className="overline px-2 py-1">Species</th><th className="overline px-2 py-1">Flag</th><th className="overline px-2 py-1">IUCN</th></tr></thead>
                  <tbody>
                    {ext.species.map((sp) => (
                      <tr key={sp.id} className="cursor-pointer border-b border-line hover:bg-panel2" onClick={() => navigate(`/species/${sp.id}`)}>
                        <td className="px-2 py-1">{sp.en ?? sp.sci} <span className="tnum text-xs italic text-ink2">{sp.sci}</span></td>
                        <td className="px-2 py-1 text-xs text-danger">{sp.extinctionStatus}</td>
                        <td className="px-2 py-1"><IucnBadge category={sp.iucn} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : <Loading />}
        </Section>
      </div>
    </div>
  );
}
