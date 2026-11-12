/** Module 5 — Ecology Lab: ecological distributions, categorical
 *  cross-tabulations (χ², Cramér's V), habitat→migration flow. */
import { useEffect, useMemo, useState } from "react";
import type { Data } from "plotly.js-dist-min";
import { apiGet, apiPost } from "../../lib/api";
import { useMeta } from "../../hooks/useMeta";
import { FilterBar } from "../../components/FilterBar";
import { Loading, MethodNote, PageHeader, Pill, Section } from "../../components/ui";
import { Plot, baseLayout } from "../../components/Plot";
import { fmtNum, palette } from "../../lib/theme";
import { useApp } from "../../state/store";

const ECO_VARS = [
  { value: "habitat", label: "Habitat" },
  { value: "migration", label: "Migration" },
  { value: "trophicLevel", label: "Trophic level" },
  { value: "trophicNiche", label: "Trophic niche" },
  { value: "lifestyle", label: "Primary lifestyle" },
];

interface Contingency {
  varA: string;
  varB: string;
  nTotal: number;
  nValid: number;
  nMissing: number;
  rowLabels: string[];
  colLabels: string[];
  counts: number[][];
  chiSquare: { statistic: number; dof: number; p: number };
  cramersV: number | null;
  pctCellsExpectedBelow5: number;
  warning: string | null;
  note: string;
}

export default function EcologyPage() {
  const meta = useMeta();
  const dark = useApp((s) => s.theme === "dark");
  const p = palette(dark);
  const filters = useApp((s) => s.filters);
  const setFilter = useApp((s) => s.setFilter);

  const [varA, setVarA] = useState("habitat");
  const [varB, setVarB] = useState("migration");
  const [ct, setCt] = useState<Contingency | null>(null);
  const [loading, setLoading] = useState(false);

  const [dists, setDists] = useState<Record<string, { value: string | null; count: number }[]> | null>(null);

  useEffect(() => {
    apiGet<{ distributions: Record<string, { value: string | null; count: number }[]> }>("/api/overview")
      .then((r) => setDists(r.distributions))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    setLoading(true);
    apiPost<Contingency>("/api/ecology/contingency", { filters, varA, varB, maxLevels: 12 })
      .then(setCt)
      .finally(() => setLoading(false));
  }, [filters, varA, varB]);

  const heatData: Data[] = useMemo(() => {
    if (!ct) return [];
    return [
      {
        type: "heatmap",
        z: ct.counts,
        x: ct.colLabels,
        y: ct.rowLabels,
        colorscale: [[0, p.paper], [1, p.accent]],
        hovertemplate: "%{y} × %{x}: %{z:,} species<extra></extra>",
        colorbar: { title: { text: "species" }, thickness: 12 },
      },
    ];
  }, [ct, p]);

  const sankeyData: Data[] = useMemo(() => {
    if (!ct || ct.varA !== "habitat" || ct.varB !== "migration") return [];
    const nodes = [...ct.rowLabels, ...ct.colLabels];
    const links = [] as { source: number; target: number; value: number }[];
    ct.counts.forEach((row, i) => {
      row.forEach((v, j) => {
        if (v > 0) links.push({ source: i, target: ct.rowLabels.length + j, value: v });
      });
    });
    return [
      {
        type: "sankey",
        node: { label: nodes, pad: 8, thickness: 14, color: p.accent, line: { color: p.line, width: 0.5 } },
        link: { ...links.length ? links : { source: [], target: [], value: [] } },
        textfont: { color: p.ink, size: 11 },
      } as unknown as Data,
    ];
  }, [ct, p]);

  return (
    <div>
      <PageHeader
        title="Ecology Lab"
        subtitle="Habitat, migration, trophic roles and lifestyle — how ecological categories are distributed and how they associate with each other."
      />

      <Section className="mb-4">
        <FilterBar meta={meta} />
      </Section>

      <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        {ECO_VARS.slice(0, 2).map((v) => (
          <Section key={v.value} title={`${v.label} distribution`}>
            {dists ? (
              <Plot
                height={260}
                data={[{
                  type: "bar",
                  x: (dists[v.value] ?? []).map((d) => d.value ?? "(missing)"),
                  y: (dists[v.value] ?? []).map((d) => d.count),
                  marker: { color: p.accent },
                  hovertemplate: "%{x}: %{y:,}<extra></extra>",
                }]}
                layout={{
                  ...baseLayout(dark),
                  margin: { l: 50, r: 20, t: 10, b: 70 },
                  xaxis: { tickangle: -25, tickfont: { size: 10.5 } },
                  yaxis: { title: { text: "species" } },
                }}
                onClick={(ev) => {
                  const label = (ev as { points?: { x?: string }[] }).points?.[0]?.x;
                  if (label && label !== "(missing)") setFilter({ [v.value]: [label] });
                }}
              />
            ) : <Loading />}
          </Section>
        ))}
      </div>

      <Section title="Cross-tabulation" className="mb-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <select value={varA} onChange={(e) => setVarA(e.target.value)} className="rounded-sm border border-line bg-bg px-2 py-1.5 text-sm">
            {ECO_VARS.map((v) => <option key={v.value} value={v.value}>rows: {v.label}</option>)}
          </select>
          <select value={varB} onChange={(e) => setVarB(e.target.value)} className="rounded-sm border border-line bg-bg px-2 py-1.5 text-sm">
            {ECO_VARS.map((v) => <option key={v.value} value={v.value}>columns: {v.label}</option>)}
          </select>
          {ct && <span className="tnum text-xs text-ink3">n = {fmtNum(ct.nValid)} species with both fields · {fmtNum(ct.nMissing)} excluded (missing)</span>}
        </div>
        {loading || !ct ? <Loading /> : (
          <>
            <Plot height={Math.max(280, 30 * ct.rowLabels.length + 90)} data={heatData} layout={{ ...baseLayout(dark) }} />
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
              <Pill tone="accent">χ² = {ct.chiSquare.statistic.toFixed(1)}, df = {ct.chiSquare.dof}, p = {ct.chiSquare.p.toExponential(1)}</Pill>
              <Pill tone="accent">Cramér's V = {ct.cramersV?.toFixed(3) ?? "—"}</Pill>
              <Pill>{ct.pctCellsExpectedBelow5}% cells with expected &lt; 5</Pill>
            </div>
            {ct.warning && <div className="mt-2 text-sm text-warn">{ct.warning}</div>}
            <MethodNote>{ct.note}</MethodNote>
          </>
        )}
      </Section>

      {varA === "habitat" && varB === "migration" && ct && (
        <Section title="Habitat → migration flow (Sankey)">
          <Plot height={460} data={sankeyData} layout={{ ...baseLayout(dark), margin: { l: 10, r: 10, t: 10, b: 10 } }} />
          <MethodNote>
            Link thickness shows how habitat use and migratory behavior co-occur in the checklist. This is association in the source data, not a causal or life-history claim.
          </MethodNote>
        </Section>
      )}
    </div>
  );
}
