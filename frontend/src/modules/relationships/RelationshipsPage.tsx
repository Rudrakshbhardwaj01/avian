/** Module 8 — Relationship Lab: free-form variable pairing, correlation
 *  matrix, and morphological similarity networks with communities. */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import type { Data } from "plotly.js-dist-min";
import { apiPost, downloadJson } from "../../lib/api";
import { useMeta } from "../../hooks/useMeta";
import { FilterBar } from "../../components/FilterBar";
import { ErrorState, Loading, MethodNote, PageHeader, Pill, Section } from "../../components/ui";
import { Plot, baseLayout } from "../../components/Plot";
import { fmtNum, palette } from "../../lib/theme";
import { useApp } from "../../state/store";

const NUM_VARS = [
  { value: "massG", label: "Body mass (g)" },
  { value: "wingMm", label: "Wing length (mm)" },
  { value: "tailMm", label: "Tail length (mm)" },
  { value: "tarsusMm", label: "Tarsus length (mm)" },
  { value: "beakCulmenMm", label: "Beak culmen (mm)" },
  { value: "beakWidthMm", label: "Beak width (mm)" },
  { value: "beakDepthMm", label: "Beak depth (mm)" },
  { value: "handWingIndex", label: "Hand-wing index" },
  { value: "habitatDensity", label: "Habitat density (1–3)" },
  { value: "bodyLengthMinCm", label: "Body length min (cm)" },
  { value: "bodyLengthMaxCm", label: "Body length max (cm)" },
  { value: "wingspanMinCm", label: "Wingspan min (cm)" },
];
const CAT_VARS = [
  { value: "habitat", label: "Habitat" },
  { value: "migration", label: "Migration" },
  { value: "trophicLevel", label: "Trophic level" },
  { value: "trophicNiche", label: "Trophic niche" },
  { value: "lifestyle", label: "Lifestyle" },
  { value: "order", label: "Order" },
  { value: "family", label: "Family" },
  { value: "genus", label: "Genus" },
  { value: "iucn", label: "IUCN category" },
  { value: "breedingRegion", label: "Breeding region" },
];
const GROUP_VARS = [
  { value: "order", label: "Order" },
  { value: "family", label: "Family" },
  { value: "habitat", label: "Habitat" },
  { value: "migration", label: "Migration" },
  { value: "trophicNiche", label: "Trophic niche" },
  { value: "lifestyle", label: "Lifestyle" },
];

interface AnalyzeResult {
  kind: "numeric_numeric" | "numeric_categorical" | "categorical_categorical";
  result: Record<string, unknown>;
}

export default function RelationshipsPage() {
  const meta = useMeta();
  const dark = useApp((s) => s.theme === "dark");
  const p = palette(dark);
  const filters = useApp((s) => s.filters);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [tab, setTab] = useState<"pair" | "matrix" | "network">(
    () => ((params.get("tab") as "pair" | "matrix" | "network") ?? "pair"),
  );

  // free-form pair
  const [x, setX] = useState("massG");
  const [y, setY] = useState("trophicNiche");
  const [group, setGroup] = useState<string>("");
  const [res, setRes] = useState<AnalyzeResult | null>(null);
  const [loading, setLoading] = useState(false);

  // correlation matrix
  const [method, setMethod] = useState<"pearson" | "spearman">("pearson");
  const [matrix, setMatrix] = useState<Record<string, unknown> | null>(null);

  // similarity network
  const [netK, setNetK] = useState(6);
  const [netMax, setNetMax] = useState(1200);
  const [net, setNet] = useState<Record<string, unknown> | null>(null);
  const [netLoading, setNetLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    apiPost<AnalyzeResult>("/api/relationships/analyze", {
      filters, x, y, group: group || null, maxLevels: 12,
      logx: x === "massG",
    })
      .then(setRes)
      .finally(() => setLoading(false));
  }, [filters, x, y, group]);

  useEffect(() => {
    if (tab !== "matrix") return;
    apiPost<Record<string, unknown>>("/api/relationships/correlation", { filters, method, minN: 10 })
      .then(setMatrix)
      .catch(() => undefined);
  }, [filters, method, tab]);

  useEffect(() => {
    if (tab !== "network") return;
    setNetLoading(true);
    apiPost<Record<string, unknown>>("/api/networks/similarity", { filters, k: netK, maxNodes: netMax })
      .then(setNet)
      .catch((e) => setNet({ error: e.message }))
      .finally(() => setNetLoading(false));
  }, [filters, tab, netK, netMax]);

  const suggestion = useMemo(() => {
    const xNum = NUM_VARS.some((v) => v.value === x);
    const yNum = NUM_VARS.some((v) => v.value === y);
    if (xNum && yNum) return "scatter + correlation + regression";
    if (!xNum && !yNum) return "heatmap + χ² + Cramér's V";
    return "box/violin + Kruskal-Wallis";
  }, [x, y]);

  // chart for numeric_numeric
  const pairChart: Data[] = useMemo(() => {
    if (!res) return [];
    if (res.kind === "numeric_numeric") {
      const points = res.result as unknown as { points: { id: string; sci: string; en: string | null; x: number; y: number }[] };
      const pts = points.points ?? [];
      return [
        {
          type: "scattergl",
          mode: "markers",
          x: pts.map((pt) => pt.x),
          y: pts.map((pt) => pt.y),
          marker: { color: p.accent, size: 5, opacity: 0.65 },
          text: pts.map((pt) => `${pt.en ?? pt.sci}<br><i>${pt.sci}</i>`),
          hovertemplate: "%{text}<br>%{x:.3g} × %{y:.3g}<extra></extra>",
        },
      ];
    }
    if (res.kind === "numeric_categorical") {
      const r = res.result as { groups: { group: string; min: number; q1: number; median: number; q3: number; max: number }[] };
      return [
        {
          type: "box",
          x: r.groups.flatMap((g) => Array.from({ length: 5 }, () => g.group)),
          y: r.groups.flatMap((g) => [g.min, g.q1, g.median, g.q3, g.max]),
          boxpoints: false,
          line: { color: p.accent },
          fillcolor: "rgba(0,0,0,0)",
          showlegend: false,
        } as unknown as Data,
      ];
    }
    const r = res.result as { rowLabels: string[]; colLabels: string[]; counts: number[][] };
    return [
      {
        type: "heatmap",
        z: r.counts,
        x: r.colLabels,
        y: r.rowLabels,
        colorscale: [[0, p.paper], [1, p.accent]],
        hovertemplate: "%{y} × %{x}: %{z}<extra></extra>",
        colorbar: { thickness: 12 },
      },
    ];
  }, [res, p]);

  const matrixChart: Data[] = useMemo(() => {
    if (!matrix) return [];
    const vars = matrix.variables as string[];
    const m = matrix.matrix as (number | null)[][];
    return [
      {
        type: "heatmap",
        z: m.map((row) => row.map((v) => (v === null ? 0 : v))),
        x: vars,
        y: [...vars].reverse(),
        zmin: -1, zmax: 1,
        colorscale: [
          [0, p.danger], [0.5, dark ? "#242219" : "#f6f4ef"], [1, p.accent],
        ],
        text: m.map((row) => row.map((v) => (v === null ? "—" : v.toFixed(2)))),
        texttemplate: "%{text}",
        hovertemplate: "%{y} × %{x}: r = %{z:.3f}<extra></extra>",
        colorbar: { thickness: 12, title: { text: method === "pearson" ? "r" : "ρ" } },
      } as unknown as Data,
    ];
  }, [matrix, p, dark, method]);

  return (
    <div>
      <PageHeader
        title="Relationship Lab"
        subtitle="Choose any two variables and investigate. The visualization adapts to the pair: scatter (num×num), box (num×cat), or heatmap (cat×cat)."
      />

      <Section className="mb-4">
        <FilterBar meta={meta} />
      </Section>

      <div className="mb-4 flex gap-1">
        {([["pair", "free-form pair"], ["matrix", "correlation matrix"], ["network", "similarity network"]] as const).map(([t, label]) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={`rounded-sm px-3 py-1.5 text-sm ${tab === t ? "bg-accent-soft font-medium text-accent-ink" : "text-ink2 hover:bg-panel2"}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "pair" && (
        <Section title="Free-form analysis" className="mb-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <select value={x} onChange={(e) => setX(e.target.value)} className="rounded-sm border border-line bg-bg px-2 py-1.5 text-sm">
              {[...NUM_VARS, ...CAT_VARS].map((v) => <option key={v.value} value={v.value}>x: {v.label}</option>)}
            </select>
            <select value={y} onChange={(e) => setY(e.target.value)} className="rounded-sm border border-line bg-bg px-2 py-1.5 text-sm">
              {[...NUM_VARS, ...CAT_VARS].map((v) => <option key={v.value} value={v.value}>y: {v.label}</option>)}
            </select>
            <select value={group} onChange={(e) => setGroup(e.target.value)} className="rounded-sm border border-line bg-bg px-2 py-1.5 text-sm">
              <option value="">no grouping</option>
              {GROUP_VARS.map((g) => <option key={g.value} value={g.value}>group: {g.label}</option>)}
            </select>
            <Pill tone="accent">suggested: {suggestion}</Pill>
          </div>
          {loading || !res ? <Loading /> : (
            <>
              <Plot
                height={440}
                data={pairChart}
                layout={{
                  ...baseLayout(dark),
                  margin: { l: 70, r: 30, t: 20, b: 110 },
                  xaxis: { tickangle: res.kind === "categorical_categorical" ? -40 : 0, tickfont: { size: 10 } },
                }}
              />
              {res.kind === "numeric_numeric" && (
                <MethodNote>
                  {(res.result as { pearson?: { r: number; p: number; n: number }; spearman?: { rho: number; p: number; n: number } }).pearson
                    ? `Pearson r = ${(res.result as { pearson: { r: number; p: number } }).pearson.r.toFixed(3)} · Spearman ρ = ${(res.result as { spearman: { rho: number; p: number } }).spearman.rho.toFixed(3)} · n = ${fmtNum((res.result as { n: number }).n)} — correlation, not causation.`
                    : "Too few paired observations for correlation."}
                </MethodNote>
              )}
              {res.kind === "numeric_categorical" && (
                <MethodNote>
                  {(res.result as { test?: { H: number; p: number; epsilonSquared: number | null } }).test
                    ? `Kruskal-Wallis H = ${(res.result as { test: { H: number } }).test.H.toFixed(1)} · p = ${(res.result as { test: { p: number } }).test.p.toExponential(1)} · ε² = ${(res.result as { test: { epsilonSquared: number | null } }).test.epsilonSquared?.toFixed(3) ?? "—"} — significance ≠ magnitude; check group sizes in the table.`
                    : "Group test unavailable for these groups."}
                </MethodNote>
              )}
              {res.kind === "categorical_categorical" && (
                <MethodNote>
                  {(res.result as { chiSquare?: { statistic: number; dof: number; p: number }; cramersV?: number | null }).chiSquare
                    ? `χ² = ${(res.result as { chiSquare: { statistic: number; dof: number } }).chiSquare.statistic.toFixed(1)} (df = ${(res.result as { chiSquare: { dof: number } }).chiSquare.dof}) · p = ${(res.result as { chiSquare: { p: number } }).chiSquare.p.toExponential(1)} · Cramér's V = ${(res.result as { cramersV: number | null }).cramersV?.toFixed(3) ?? "—"} — see the Ecology Lab for assumption warnings.`
                    : "No valid cross-tabulation."}
                </MethodNote>
              )}
              {res.kind !== "numeric_numeric" && (
                <div className="mt-2">
                  <button type="button" onClick={() => downloadJson(`avian-relationship-${x}-${y}.json`, res.result)} className="rounded-sm border border-line px-2 py-1 text-xs text-ink2 hover:border-accent">
                    export this result (JSON)
                  </button>
                </div>
              )}
            </>
          )}
        </Section>
      )}

      {tab === "network" && (
        <Section title="Morphological similarity network" className="mb-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <select value={netK} onChange={(e) => setNetK(Number(e.target.value))} className="rounded-sm border border-line bg-bg px-2 py-1.5 text-sm">
              {[4, 6, 8, 10].map((v) => <option key={v} value={v}>k = {v} neighbors</option>)}
            </select>
            <select value={netMax} onChange={(e) => setNetMax(Number(e.target.value))} className="rounded-sm border border-line bg-bg px-2 py-1.5 text-sm">
              {[600, 1200, 2000, 3000].map((v) => <option key={v} value={v}>up to {fmtNum(v)} nodes</option>)}
            </select>
            {net && !(net as { error?: string }).error && (
              <>
                <Pill tone="accent">{fmtNum((net as { nodesShown: number }).nodesShown)} nodes · {fmtNum((net as { nEdges: number }).nEdges)} edges</Pill>
                <Pill>{(net as { nCommunities: number }).nCommunities} communities</Pill>
                <button type="button" onClick={() => downloadJson("avian-network.json", net)} className="rounded-sm border border-line px-2 py-1 text-xs text-ink2 hover:border-accent">export</button>
              </>
            )}
          </div>
          {netLoading || !net ? <Loading label="Building kNN graph and detecting communities…" /> : (net as { error?: string }).error ? (
            <ErrorState message={(net as { error: string }).error} />
          ) : (
            <>
              <Plot
                height={560}
                data={[
                  // edges: one trace with None-separated segments
                  {
                    type: "scattergl",
                    mode: "lines",
                    x: (net as { edges: { a: number; b: number }[]; nodes: { x: number; y: number }[] }).edges.flatMap((e) => [
                      (net as { nodes: { x: number; y: number }[] }).nodes[e.a].x,
                      (net as { nodes: { x: number; y: number }[] }).nodes[e.b].x,
                      null,
                    ]),
                    y: (net as { edges: { a: number; b: number }[]; nodes: { x: number; y: number }[] }).edges.flatMap((e) => [
                      (net as { nodes: { x: number; y: number }[] }).nodes[e.a].y,
                      (net as { nodes: { x: number; y: number }[] }).nodes[e.b].y,
                      null,
                    ]),
                    line: { color: p.line, width: 0.6 },
                    hoverinfo: "skip",
                    showlegend: false,
                  },
                  // nodes colored by community
                  ...Array.from(new Set((net as { nodes: { community: number }[] }).nodes.map((n) => n.community))).slice(0, 12).map((c, ci) => ({
                    type: "scattergl",
                    mode: "markers",
                    name: `community ${c}`,
                    x: (net as { nodes: { community: number; x: number; y: number; en: string; sci: string }[] }).nodes.filter((n) => n.community === c).map((n) => n.x),
                    y: (net as { nodes: { community: number; x: number; y: number; en: string; sci: string }[] }).nodes.filter((n) => n.community === c).map((n) => n.y),
                    marker: { color: p.series[ci % p.series.length], size: 6, opacity: 0.85 },
                    text: (net as { nodes: { community: number; x: number; y: number; en: string; sci: string }[] }).nodes.filter((n) => n.community === c).map((n) => `${n.en ?? n.sci}<br><i>${n.sci}</i>`),
                    hovertemplate: "%{text}<extra></extra>",
                  })),
                ] as unknown as Data[]}
                layout={{ ...baseLayout(dark), margin: { l: 20, r: 20, t: 10, b: 30 }, legend: { font: { size: 10 } } }}
                onClick={(ev) => {
                  const pt = (ev as { points?: { text?: string }[] }).points?.[0];
                  const label = pt?.text?.split("<br>")[0];
                  const node = label && (net as { nodes: { id: string; en: string | null; sci: string }[] }).nodes.find((n) => (n.en ?? n.sci) === label);
                  if (node) navigate(`/species/${node.id}`);
                }}
              />
              <div className="mt-2 grid grid-cols-1 gap-4 xl:grid-cols-2">
                <div>
                  <div className="overline mb-1">Community composition (top 12 by size)</div>
                  <table className="w-full text-xs">
                    <thead><tr className="border-b border-line"><th className="px-2 py-1 text-left text-ink3">community</th><th className="px-2 py-1 text-right text-ink3">n</th><th className="px-2 py-1 text-left text-ink3">top orders</th><th className="px-2 py-1 text-left text-ink3">top habitats</th></tr></thead>
                    <tbody>
                      {(net as { communityComposition: { community: number; n: number; topOrders: Record<string, number>; topHabitats: Record<string, number> }[] }).communityComposition.map((c) => (
                        <tr key={c.community} className="border-b border-line">
                          <td className="px-2 py-1 font-medium">#{c.community}</td>
                          <td className="tnum px-2 py-1 text-right">{fmtNum(c.n)}</td>
                          <td className="px-2 py-1 text-ink2">{Object.entries(c.topOrders).slice(0, 2).map(([o, n]) => `${o} (${n})`).join(", ")}</td>
                          <td className="px-2 py-1 text-ink2">{Object.entries(c.topHabitats).slice(0, 2).map(([o, n]) => `${o} (${n})`).join(", ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div>
                  <div className="overline mb-1">Most connected species (highest degree)</div>
                  <table className="w-full text-xs">
                    <thead><tr className="border-b border-line"><th className="px-2 py-1 text-left text-ink3">species</th><th className="px-2 py-1 text-right text-ink3">degree</th></tr></thead>
                    <tbody>
                      {(net as { centralSpecies: { id: string; en: string; sci: string; degree: number }[] }).centralSpecies.slice(0, 8).map((n) => (
                        <tr key={n.id} className="cursor-pointer border-b border-line hover:bg-panel2" onClick={() => navigate(`/species/${n.id}`)}>
                          <td className="px-2 py-1">{n.en} <span className="italic text-ink2">{n.sci}</span></td>
                          <td className="tnum px-2 py-1 text-right">{n.degree}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <MethodNote>{(net as { note: string }).note}</MethodNote>
              {Boolean((net as { sampled?: boolean }).sampled) && (
                <MethodNote>
                  Scope exceeded the node cap; the {fmtNum((net as { nodesShown: number }).nodesShown)} shown nodes were prioritized by rarest family representation. Narrow the filters for a complete network.
                </MethodNote>
              )}
            </>
          )}
        </Section>
      )}

      {tab === "matrix" && (
        <Section title="Correlation matrix — trait variables" className="mb-4">
          <div className="mb-3 flex items-center gap-2">
            <select value={method} onChange={(e) => setMethod(e.target.value as "pearson" | "spearman")} className="rounded-sm border border-line bg-bg px-2 py-1.5 text-sm">
              <option value="pearson">Pearson</option>
              <option value="spearman">Spearman</option>
            </select>
            {matrix && <span className="tnum text-xs text-ink3">{fmtNum((matrix.perVariableN as Record<string, number>)["massG"] ?? 0)} species with mass; per-pair n shown on hover</span>}
            {matrix && (
              <button type="button" onClick={() => downloadJson(`avian-correlation-${method}.json`, matrix)} className="ml-auto rounded-sm border border-line px-2 py-1 text-xs text-ink2 hover:border-accent">
                export matrix
              </button>
            )}
          </div>
          {matrix ? (
            <>
              <Plot height={460} data={matrixChart} layout={{ ...baseLayout(dark), margin: { l: 90, r: 40, t: 20, b: 90 } }} />
              <MethodNote>{matrix.note as string}</MethodNote>
            </>
          ) : <Loading />}
        </Section>
      )}
    </div>
  );
}
