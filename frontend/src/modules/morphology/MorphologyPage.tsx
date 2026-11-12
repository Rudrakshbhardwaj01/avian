/** Module 4 — Morphology Lab: a full research workspace — univariate,
 *  bivariate, group comparisons, outliers, advanced distributions (KDE/ECDF/
 *  QQ/violin/ridgeline), allometry (OLS/Theil-Sen/quantile), ratios, family
 *  comparisons and morphological diversity. */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import type { Data } from "plotly.js-dist-min";
import { apiPost, downloadJson } from "../../lib/api";
import { useMeta } from "../../hooks/useMeta";
import { FilterBar } from "../../components/FilterBar";
import { DataTable, type Column } from "../../components/DataTable";
import { EmptyState, Loading, MethodNote, PageHeader, Pill, Section } from "../../components/ui";
import { Plot, baseLayout } from "../../components/Plot";
import { fmtNum, palette } from "../../lib/theme";
import { useApp } from "../../state/store";

const VARIABLES = [
  { value: "massG", label: "Body mass (g)" },
  { value: "wingMm", label: "Wing length (mm)" },
  { value: "tailMm", label: "Tail length (mm)" },
  { value: "tarsusMm", label: "Tarsus length (mm)" },
  { value: "beakCulmenMm", label: "Beak culmen (mm)" },
  { value: "beakWidthMm", label: "Beak width (mm)" },
  { value: "beakDepthMm", label: "Beak depth (mm)" },
  { value: "handWingIndex", label: "Hand-wing index" },
];
const GROUP_VARS = [
  { value: "order", label: "Order" },
  { value: "family", label: "Family" },
  { value: "habitat", label: "Habitat" },
  { value: "migration", label: "Migration" },
  { value: "trophicLevel", label: "Trophic level" },
  { value: "trophicNiche", label: "Trophic niche" },
  { value: "lifestyle", label: "Primary lifestyle" },
  { value: "iucn", label: "IUCN category" },
];

interface Univariate {
  variable: string;
  nTotal: number;
  nMissing: number;
  excludedNonPositive: number;
  stats: { n: number; mean: number | null; median: number | null; std: number | null; min: number | null; q1: number | null; q3: number | null; max: number | null; iqr: number | null; skewness?: number; kurtosis?: number };
  histogram: { edges: number[]; counts: number[] };
  log: boolean;
}
interface BivariateResponse {
  grouped: boolean;
  nTotal: number;
  points: { id: string; sci: string; en: string | null; x: number; y: number; inferred: boolean }[];
  correlations: { group: string; n: number; pearson: number | null; spearman: number | null }[];
  series: { group: string | null; n: number; pearson: { r: number; p: number } | null; spearman: { rho: number; p: number } | null; ols: { slope: number; intercept: number; r2: number | null; band?: { x: number[]; lower: number[]; upper: number[] } } | null; excluded: Record<string, number>; points?: { id: string; sci: string; en: string | null; x: number; y: number; inferred: boolean }[] }[];
  pearson?: { r: number; p: number; n: number };
  spearman?: { rho: number; p: number; n: number };
  ols?: { slope: number; intercept: number; r2: number | null; band?: { x: number[]; lower: number[]; upper: number[] } };
  excluded: Record<string, number>;
}
interface GroupedResponse {
  numVar: string;
  catVar: string;
  nTotal: number;
  nValid: number;
  nMissing: number;
  groups: { group: string; n: number; min: number; q1: number; median: number; q3: number; max: number; mean: number; std: number | null }[];
  test: { H: number; p: number; epsilonSquared: number | null; nGroups: number; n: number } | null;
  note: string;
}
interface OutlierResponse {
  variable: string;
  method: string;
  threshold: number;
  group: string | null;
  nTotal: number;
  nOutliers: number;
  outliers: { id: string; sci: string; en: string | null; value: number; score?: Record<string, number> }[];
  note?: string;
}

export default function MorphologyPage() {
  const meta = useMeta();
  const dark = useApp((s) => s.theme === "dark");
  const p = palette(dark);
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [tab, setTab] = useState<"univariate" | "distributions" | "bivariate" | "groups" | "outliers" | "allometry" | "ratios" | "diversity">(
    () => (params.get("tab") as never) ?? (params.get("group") ? "bivariate" : "univariate"),
  );

  // shared filter state comes from the global store
  const filters = useApp((s) => s.filters);

  // univariate
  const [variable, setVariable] = useState(params.get("variable") ?? "massG");
  const [useLog, setUseLog] = useState(params.get("variable") === "massG");
  const [uni, setUni] = useState<Univariate | null>(null);
  const [uniLoading, setUniLoading] = useState(false);

  // advanced distributions
  const [distKind, setDistKind] = useState<"hist_kde" | "ecdf" | "qq">("hist_kde");
  const [dist, setDist] = useState<Record<string, unknown> | null>(null);
  const [ridgelineVar, setRidgelineVar] = useState("handWingIndex");
  const [ridgelineGroup, setRidgelineGroup] = useState("habitat");
  const [ridge, setRidge] = useState<Record<string, unknown> | null>(null);

  // bivariate
  const [xVar, setXVar] = useState("massG");
  const [yVar, setYVar] = useState("wingMm");
  const [group, setGroup] = useState<string | null>(params.get("group") ?? null);
  const [bi, setBi] = useState<BivariateResponse | null>(null);
  const [biLoading, setBiLoading] = useState(false);

  // groups
  const [gNumVar, setGNumVar] = useState(params.get("numVar") ?? "massG");
  const [gCatVar, setGCatVar] = useState(params.get("catVar") ?? params.get("group") ?? "habitat");
  const [grouped, setGrouped] = useState<GroupedResponse | null>(null);
  const [gLoading, setGLoading] = useState(false);

  // outliers
  const [oVar, setOVar] = useState(variable);
  const [oMethod, setOMethod] = useState<"iqr" | "modified_z">("iqr");
  const [oThreshold, setOThreshold] = useState(1.5);
  const [oGroup, setOGroup] = useState<string | null>(params.get("group") === "family" ? "family" : null);
  const [outliers, setOutliers] = useState<OutlierResponse | null>(null);
  const [oLoading, setOLoading] = useState(false);

  // allometry
  const [aX, setAX] = useState("massG");
  const [aY, setAY] = useState("wingMm");
  const [aGroup, setAGroup] = useState<string | null>(null);
  const [allom, setAllom] = useState<Record<string, unknown> | null>(null);
  const [aLoading, setALoading] = useState(false);

  // ratios
  const [ratioId, setRatioId] = useState("tailWing");
  const [ratioGroup, setRatioGroup] = useState<string | null>(null);
  const [ratio, setRatio] = useState<Record<string, unknown> | null>(null);
  const [ratioLoading, setRatioLoading] = useState(false);
  const RATIO_DEFS: Record<string, { num: string; den: string; label: string; interpretation: string }> = {
    tailWing: { num: "tailMm", den: "wingMm", label: "Tail ÷ wing", interpretation: "Relative tail length — maneuverability and display; not a universal metric." },
    culmenWidth: { num: "beakCulmenMm", den: "beakWidthMm", label: "Culmen ÷ bill width", interpretation: "Bill slenderness — foraging style within lineages." },
    culmenDepth: { num: "beakCulmenMm", den: "beakDepthMm", label: "Culmen ÷ bill depth", interpretation: "Bill elongation — seed-crackers run deep relative to length." },
    wingTarsus: { num: "wingMm", den: "tarsusMm", label: "Wing ÷ tarsus", interpretation: "Flight vs leg investment — lower in sedentary terrestrial lineages." },
  };

  // diversity
  const [divGroup, setDivGroup] = useState("order");
  const [diversity, setDiversity] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    setUniLoading(true);
    apiPost<Univariate>("/api/morphology/univariate", { filters, variable, log: useLog, bins: 40 })
      .then(setUni)
      .finally(() => setUniLoading(false));
  }, [filters, variable, useLog]);

  useEffect(() => {
    setBiLoading(true);
    apiPost<BivariateResponse>("/api/morphology/bivariate", { filters, x: xVar, y: yVar, group, logx: xVar === "massG", logy: false })
      .then(setBi)
      .finally(() => setBiLoading(false));
  }, [filters, xVar, yVar, group]);

  useEffect(() => {
    setGLoading(true);
    apiPost<GroupedResponse>("/api/ecology/grouped-numeric", { filters, numVar: gNumVar, catVar: gCatVar })
      .then(setGrouped)
      .finally(() => setGLoading(false));
  }, [filters, gNumVar, gCatVar]);

  useEffect(() => {
    setOLoading(true);
    apiPost<OutlierResponse>("/api/morphology/outliers", { filters, variable: oVar, method: oMethod, threshold: oThreshold, group: oGroup, log: oVar === "massG" })
      .then(setOutliers)
      .finally(() => setOLoading(false));
  }, [filters, oVar, oMethod, oThreshold, oGroup]);

  // advanced distributions + allometry + ratios + diversity
  useEffect(() => {
    if (tab !== "distributions") return;
    apiPost<Record<string, unknown>>("/api/distributions/distribution", { filters, variable, log: useLog, kind: distKind })
      .then(setDist)
      .catch(() => undefined);
  }, [filters, variable, useLog, distKind, tab]);

  useEffect(() => {
    if (tab !== "distributions") return;
    apiPost<Record<string, unknown>>("/api/distributions/ridgeline", { filters, variable: ridgelineVar, groupVar: ridgelineGroup, log: ridgelineVar === "massG" })
      .then(setRidge)
      .catch(() => undefined);
  }, [filters, ridgelineVar, ridgelineGroup, tab]);

  useEffect(() => {
    if (tab !== "allometry") return;
    setALoading(true);
    apiPost<Record<string, unknown>>("/api/morphology/allometry", { filters, x: aX, y: aY, group: aGroup, loglog: true })
      .then(setAllom)
      .finally(() => setALoading(false));
  }, [filters, aX, aY, aGroup, tab]);

  useEffect(() => {
    if (tab !== "ratios") return;
    setRatioLoading(true);
    const def = RATIO_DEFS[ratioId];
    apiPost<Record<string, unknown>>("/api/morphology/ratio", { filters, num: def.num, den: def.den, group: ratioGroup })
      .then(setRatio)
      .finally(() => setRatioLoading(false));
  }, [filters, ratioId, ratioGroup, tab]);

  useEffect(() => {
    if (tab !== "diversity") return;
    apiPost<Record<string, unknown>>("/api/morphology/diversity", { filters, groupVar: divGroup, minN: 15 })
      .then(setDiversity)
      .catch(() => undefined);
  }, [filters, divGroup, tab]);

  // scatter traces
  const scatterTraces: Data[] = useMemo(() => {
    if (!bi) return [];
    const traces: Data[] = [];
    if (bi.ols?.band) {
      traces.push({
        type: "scatter",
        mode: "lines",
        x: bi.ols.band.x,
        y: [...bi.ols.band.lower, ...[...bi.ols.band.upper].reverse()],
        fill: "toself",
        fillcolor: "rgba(0,0,0,0)",
        line: { color: "rgba(0,0,0,0)" },
        hoverinfo: "skip",
        showlegend: false,
      });
    }
    if (bi.grouped && bi.series.length) {
      bi.series.forEach((s, i) => {
        if (!s.points) return;
        traces.push({
          type: "scattergl",
          mode: "markers",
          x: s.points.map((pt) => pt.x),
          y: s.points.map((pt) => pt.y),
          name: `${s.group ?? "?"} (n=${fmtNum(s.n)})`,
          marker: { color: p.series[i % p.series.length], size: 5.5, opacity: 0.72 },
          text: s.points.map((pt) => `${pt.en ?? pt.sci}<br><i>${pt.sci}</i>`),
          hovertemplate: "%{text}<br>x: %{x:.3g}<br>y: %{y:.3g}<extra></extra>",
        });
        if (s.ols) {
          const xs = s.points.map((pt) => pt.x);
          const xsMin = Math.min(...xs);
          const xsMax = Math.max(...xs);
          traces.push({
            type: "scatter",
            mode: "lines",
            x: [xsMin, xsMax],
            y: [s.ols.intercept + s.ols.slope * xsMin, s.ols.intercept + s.ols.slope * xsMax],
            line: { color: p.series[i % p.series.length], width: 1.4, dash: "dash" },
            showlegend: false,
            hoverinfo: "skip",
          });
        }
      });
    } else if (bi.series[0]?.points) {
      const pts = bi.series[0].points;
      traces.push({
        type: "scattergl",
        mode: "markers",
        name: "species",
        x: pts.map((pt) => pt.x),
        y: pts.map((pt) => pt.y),
        marker: { color: p.accent, size: 5.5, opacity: 0.7 },
        text: pts.map((pt) => `${pt.en ?? pt.sci}<br><i>${pt.sci}</i>${pt.inferred ? "<br>◈ imputed traits" : ""}`),
        hovertemplate: "%{text}<br>x: %{x:.3g}<br>y: %{y:.3g}<extra></extra>",
        showlegend: false,
      });
    }
    return traces;
  }, [bi, p]);

  // backend returns quartiles; draw pre-aggregated boxes (no raw points needed)
  const boxFromQuartiles: Data[] = useMemo(() => {
    if (!grouped) return [];
    return [
      {
        type: "box",
        x: grouped.groups.flatMap((g) => Array.from({ length: 5 }, () => g.group)),
        y: grouped.groups.flatMap((g) => [g.min, g.q1, g.median, g.q3, g.max]),
        boxpoints: false,
        line: { color: p.accent },
        fillcolor: "rgba(0,0,0,0)",
        hovertemplate: "%{y:.3g}<extra></extra>",
        showlegend: false,
      } as unknown as Data,
    ];
  }, [grouped, p]);

  const outlierColumns: Column<{ id: string; sci: string; en: string | null; value: number; score?: Record<string, number> }>[] = [
    { key: "sci", header: "Species", render: (r) => <span>{r.en ?? r.sci} <span className="tnum text-xs italic text-ink2">{r.sci}</span></span> },
    { key: "value", header: VARIABLES.find((v) => v.value === oVar)?.label ?? oVar, numeric: true, render: (r) => fmtNum(r.value, 2) },
    {
      key: "score",
      header: oMethod === "iqr" ? "Distance beyond fence" : "Modified Z",
      numeric: true,
      render: (r) => (r.score ? fmtNum(Object.values(r.score)[0], 2) : "—"),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Morphology Lab"
        subtitle="Physical measurements from AVONET: distributions, relationships, group comparisons, outliers. Every analysis reports its effective sample size."
      />

      <Section className="mb-4">
        <FilterBar meta={meta} />
      </Section>

      <div className="mb-4 flex flex-wrap gap-1">
        {([
          ["univariate", "univariate"],
          ["distributions", "distributions (KDE · ECDF · QQ · ridgeline)"],
          ["bivariate", "bivariate"],
          ["groups", "group comparison"],
          ["outliers", "outliers"],
          ["allometry", "allometry"],
          ["ratios", "ratios"],
          ["diversity", "morphological diversity"],
        ] as const).map(([t, label]) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={`rounded-sm px-3 py-1.5 text-sm ${tab === t ? "bg-accent-soft font-medium text-accent-ink" : "text-ink2 hover:bg-panel2"}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "univariate" && (
        <Section title="Univariate distribution">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <select value={variable} onChange={(e) => setVariable(e.target.value)} className="rounded-sm border border-line bg-bg px-2 py-1.5 text-sm">
              {VARIABLES.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-sm text-ink2">
              <input type="checkbox" className="accent-accent" checked={useLog} onChange={(e) => setUseLog(e.target.checked)} />
              log scale
            </label>
            {uni && (
              <span className="tnum text-xs text-ink3">
                n = {fmtNum(uni.stats.n)} valid · {fmtNum(uni.nMissing)} missing{uni.excludedNonPositive ? ` · ${uni.excludedNonPositive} non-positive excluded by log` : ""}
              </span>
            )}
            {uni && uni.stats.n > 0 && (
              <button type="button" onClick={() => downloadJson(`avian-${variable}-stats.json`, uni)} className="ml-auto rounded-sm border border-line px-2 py-1 text-xs text-ink2 hover:border-accent">
                export stats
              </button>
            )}
          </div>
          {uniLoading ? <Loading /> : uni && (
            <>
              {uni.stats.n === 0 ? (
                <EmptyState title="No valid observations under the current filters" hint="Loosen the filters — e.g. clear “exclude imputed” or taxonomy filters." />
              ) : (
                <>
                  <Plot
                    height={340}
                    data={[{
                      type: "bar",
                      x: uni.histogram.edges.slice(0, -1).map((e, i) => (e + uni.histogram.edges[i + 1]) / 2),
                      y: uni.histogram.counts,
                      marker: { color: p.accent },
                      hovertemplate: "bin ≈ %{x:.4g}: %{y:,} species<extra></extra>",
                    }]}
                    layout={{
                      ...baseLayout(dark),
                      bargap: 0.03,
                      xaxis: { title: { text: `${VARIABLES.find((v) => v.value === variable)?.label}${useLog ? " (log-spaced bins)" : ""}` } },
                      yaxis: { title: { text: "species" } },
                    }}
                  />
                  <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4 xl:grid-cols-6">
                    {[
                      ["n", uni.stats.n],
                      ["mean", uni.stats.mean],
                      ["median", uni.stats.median],
                      ["std", uni.stats.std],
                      ["min", uni.stats.min],
                      ["q1", uni.stats.q1],
                      ["q3", uni.stats.q3],
                      ["max", uni.stats.max],
                      ["IQR", uni.stats.iqr],
                      ["skewness", uni.stats.skewness],
                      ["kurtosis (excess)", uni.stats.kurtosis],
                    ].map(([k, v]) => (
                      <div key={k as string}>
                        <span className="overline block">{k}</span>
                        <span className="tnum text-ink">{typeof v === "number" ? fmtNum(v, 3) : v ?? "—"}</span>
                      </div>
                    ))}
                  </div>
                  <MethodNote>
                    Statistics use only valid observations ({fmtNum(uni.stats.n)} of {fmtNum(uni.nTotal)}); missing values are never zero-filled. Body mass and other skewed measurements are usually best viewed on a log scale.
                  </MethodNote>
                </>
              )}
            </>
          )}
        </Section>
      )}

      {tab === "distributions" && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Section title="Distribution shape">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <select value={variable} onChange={(e) => setVariable(e.target.value)} className="rounded-sm border border-line bg-bg px-2 py-1.5 text-sm">
                {VARIABLES.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
              </select>
              <select value={distKind} onChange={(e) => setDistKind(e.target.value as "hist_kde" | "ecdf" | "qq")} className="rounded-sm border border-line bg-bg px-2 py-1.5 text-sm">
                <option value="hist_kde">histogram + kernel density</option>
                <option value="ecdf">empirical CDF</option>
                <option value="qq">normal Q-Q plot</option>
              </select>
              <label className="flex items-center gap-1.5 text-sm text-ink2">
                <input type="checkbox" className="accent-accent" checked={useLog} onChange={(e) => setUseLog(e.target.checked)} />
                log scale
              </label>
              {dist && (dist as { n?: number }).n !== undefined && <span className="tnum text-xs text-ink3">n = {fmtNum((dist as { n: number }).n)}</span>}
            </div>
            {!dist ? <Loading /> : (dist as { error?: string }).error ? (
              <EmptyState title={(dist as { error: string }).error} />
            ) : distKind === "hist_kde" ? (
              <Plot
                height={320}
                data={[{
                  type: "scatter", mode: "lines", name: "KDE",
                  x: (dist as { kde: { x: number[] } }).kde.x,
                  y: (dist as { kde: { y: number[] } }).kde.y,
                  line: { color: p.accent, width: 2, shape: "spline" },
                  hovertemplate: "density %{y:.3g} at %{x:.4g}<extra></extra>",
                } as unknown as Data]}
                layout={{ ...baseLayout(dark), xaxis: { title: { text: VARIABLES.find((v) => v.value === variable)?.label } }, yaxis: { title: { text: "density" } } }}
              />
            ) : distKind === "ecdf" ? (
              <Plot
                height={320}
                data={[{
                  type: "scatter", mode: "lines",
                  x: (dist as { ecdf: { x: number[] } }).ecdf.x,
                  y: (dist as { ecdf: { y: number[] } }).ecdf.y,
                  line: { color: p.info, width: 2 },
                  hovertemplate: "P(X ≤ %{x:.4g}) = %{y:.3f}<extra></extra>",
                }]}
                layout={{ ...baseLayout(dark), xaxis: { title: { text: VARIABLES.find((v) => v.value === variable)?.label } }, yaxis: { title: { text: "cumulative proportion" }, range: [0, 1] } }}
              />
            ) : (
              <Plot
                height={320}
                data={[{
                  type: "scattergl", mode: "markers",
                  x: (dist as { qq: { theoretical: number[] } }).qq.theoretical,
                  y: (dist as { qq: { sample: number[] } }).qq.sample,
                  marker: { color: p.accent, size: 4, opacity: 0.5 },
                  hovertemplate: "theoretical %{x:.3g} vs sample %{y:.3g}<extra></extra>",
                }]}
                layout={{ ...baseLayout(dark), xaxis: { title: { text: "theoretical normal quantiles" } }, yaxis: { title: { text: "sample quantiles" } } }}
              />
            )}
            <MethodNote>
              {distKind === "qq"
                ? "Points departing the diagonal at the tails indicate non-normality — the usual reason to prefer rank-based tests in the Inference Lab."
                : "The KDE is a smoothed view of the same data as the histogram; heavy right skew is typical of body mass and the reason log scaling exists above."}
            </MethodNote>
          </Section>

          <Section title="Ridgeline by group">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <select value={ridgelineVar} onChange={(e) => setRidgelineVar(e.target.value)} className="rounded-sm border border-line bg-bg px-2 py-1.5 text-sm">
                {VARIABLES.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
              </select>
              <select value={ridgelineGroup} onChange={(e) => setRidgelineGroup(e.target.value)} className="rounded-sm border border-line bg-bg px-2 py-1.5 text-sm">
                {GROUP_VARS.filter((g) => g.value !== "iucn").map((g) => <option key={g.value} value={g.value}>by: {g.label}</option>)}
              </select>
            </div>
            {!ridge ? <Loading /> : (
              <Plot
                height={460}
                data={(ridge as { rows: { group: string; n: number; curve: number[] }[]; grid: number[] }).rows.map((row, i) => ({
                  type: "scatter",
                  mode: "lines",
                  name: `${row.group} (n=${fmtNum(row.n)})`,
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  x: (ridge as { grid: number[] }).grid,
                  y: row.curve.map((d) => d + (row.curve.reduce((a, b) => Math.max(a, b), 0)) * ((ridge as { rows: unknown[] }).rows.length - 1 - i) * 0.6),
                  fill: "tozeroy",
                  line: { color: p.series[i % p.series.length], width: 1.4 },
                  hovertemplate: `${row.group}: density %{y:.3g} at %{x:.4g}<extra></extra>`,
                }) as unknown as Data)}
                layout={{
                  ...baseLayout(dark),
                  showlegend: false,
                  margin: { l: 60, r: 20, t: 10, b: 50 },
                  xaxis: { title: { text: VARIABLES.find((v) => v.value === ridgelineVar)?.label } },
                  yaxis: { title: { text: "stacked density" } },
                }}
              />
            )}
            <MethodNote>Curves share one x-grid, stacked by descending group median. Overlap shows how similar group distributions are.</MethodNote>
          </Section>
        </div>
      )}

      {tab === "allometry" && (
        <Section title="Allometric scaling (log-log)">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <select value={aX} onChange={(e) => setAX(e.target.value)} className="rounded-sm border border-line bg-bg px-2 py-1.5 text-sm">
              {VARIABLES.map((v) => <option key={v.value} value={v.value}>x: {v.label}</option>)}
            </select>
            <select value={aY} onChange={(e) => setAY(e.target.value)} className="rounded-sm border border-line bg-bg px-2 py-1.5 text-sm">
              {VARIABLES.map((v) => <option key={v.value} value={v.value}>y: {v.label}</option>)}
            </select>
            <select value={aGroup ?? ""} onChange={(e) => setAGroup(e.target.value || null)} className="rounded-sm border border-line bg-bg px-2 py-1.5 text-sm">
              <option value="">all species</option>
              {GROUP_VARS.filter((g) => ["order", "family", "habitat", "lifestyle"].includes(g.value)).map((g) => <option key={g.value} value={g.value}>within: {g.label}</option>)}
            </select>
          </div>
          {aLoading || !allom ? <Loading label="Fitting regressions…" /> : (
            <>
              <Plot
                height={420}
                data={[
                  {
                    type: "scattergl", mode: "markers", name: "species",
                    x: ((allom as { overall: { residuals: { x: number[] } } }).overall.residuals.x),
                    y: ((allom as { overall: { residuals: { y: number[] } } }).overall.residuals.y),
                    marker: { color: p.accent, size: 4.5, opacity: 0.5 },
                    hovertemplate: "residual %{y:.3g} at %{x:.3g}<extra></extra>",
                    showlegend: false,
                  },
                  {
                    type: "scatter", mode: "lines", name: "OLS (log-log)",
                    x: (allom as { overall: { fitLine: { x: number[] } } }).overall.fitLine.x,
                    y: (allom as { overall: { fitLine: { ols: number[] } } }).overall.fitLine.ols,
                    line: { color: p.accent, width: 2 },
                  },
                  {
                    type: "scatter", mode: "lines", name: "Theil-Sen (robust)",
                    x: (allom as { overall: { fitLine: { x: number[] } } }).overall.fitLine.x,
                    y: (allom as { overall: { fitLine: { theilSen: number[] } } }).overall.fitLine.theilSen,
                    line: { color: p.warn, width: 2, dash: "dash" },
                  },
                ]}
                layout={{
                  ...baseLayout(dark),
                  xaxis: { title: { text: `log ${VARIABLES.find((v) => v.value === aX)?.label}` } },
                  yaxis: { title: { text: `log ${VARIABLES.find((v) => v.value === aY)?.label}` } },
                }}
              />
              {(() => {
                const o = (allom as { overall: Record<string, never> });
                const ols = o.overall.ols as unknown as { slope: number; r2: number; slopeCI: number[] };
                const ts = o.overall.theilSen as unknown as { slope: number; slopeCI: number[] };
                const q = o.overall.quantile as unknown as { slope: number } | null;
                return (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Pill tone="accent">OLS exponent b = {ols.slope.toFixed(3)} [95% CI {ols.slopeCI[0].toFixed(3)}, {ols.slopeCI[1].toFixed(3)}] · R² = {ols.r2.toFixed(3)}</Pill>
                    <Pill>Theil-Sen b = {ts.slope.toFixed(3)} [{ts.slopeCI[0].toFixed(3)}, {ts.slopeCI[1].toFixed(3)}]</Pill>
                    {q && <Pill>median regression b = {q.slope.toFixed(3)}</Pill>}
                  </div>
                );
              })()}
              <MethodNote>
                {(allom as { overall: { interpretation: string } }).overall.interpretation} When Theil-Sen diverges from OLS, extreme species are pulling the least-squares fit — inspect the outliers tab before quoting an exponent.
              </MethodNote>
            </>
          )}
        </Section>
      )}

      {tab === "ratios" && (
        <Section title="Morphological ratios">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <select value={ratioId} onChange={(e) => setRatioId(e.target.value)} className="rounded-sm border border-line bg-bg px-2 py-1.5 text-sm">
              {Object.entries(RATIO_DEFS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select value={ratioGroup ?? ""} onChange={(e) => setRatioGroup(e.target.value || null)} className="rounded-sm border border-line bg-bg px-2 py-1.5 text-sm">
              <option value="">all species</option>
              {GROUP_VARS.filter((g) => ["order", "family", "habitat", "lifestyle"].includes(g.value)).map((g) => <option key={g.value} value={g.value}>group: {g.label}</option>)}
            </select>
            <span className="text-xs text-ink3">{RATIO_DEFS[ratioId].interpretation}</span>
          </div>
          {ratioLoading || !ratio ? <Loading /> : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <div>
                <Plot
                  height={280}
                  data={[{
                    type: "bar",
                    x: (ratio as { histogram: { edges: number[] } }).histogram.edges.slice(0, -1).map((e, i) => (e + (ratio as { histogram: { edges: number[] } }).histogram.edges[i + 1]) / 2),
                    y: (ratio as { histogram: { counts: number[] } }).histogram.counts,
                    marker: { color: p.accent },
                    hovertemplate: "ratio ≈ %{x:.3g}: %{y:,} species<extra></extra>",
                  }]}
                  layout={{ ...baseLayout(dark), xaxis: { title: { text: RATIO_DEFS[ratioId].label } }, yaxis: { title: { text: "species" } } }}
                />
                <table className="mt-2 w-full text-xs">
                  <thead><tr className="border-b border-line"><th className="overline px-2 py-1">Highest ratios</th><th className="overline px-2 py-1 text-right">value</th></tr></thead>
                  <tbody>
                    {(ratio as { extremesHigh: { id: string; en: string; sci: string; ratio: number }[] }).extremesHigh.slice(0, 5).map((r) => (
                      <tr key={r.id} className="cursor-pointer border-b border-line hover:bg-panel2" onClick={() => navigate(`/species/${r.id}`)}>
                        <td className="px-2 py-1">{r.en} <span className="italic text-ink2">{r.sci}</span></td>
                        <td className="tnum px-2 py-1 text-right">{r.ratio.toFixed(3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <div className="overline mb-1">Summary (n = {fmtNum((ratio as { n: number }).n)}; {(ratio as { excluded: number }).excluded} excluded non-positive)</div>
                <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-sm">
                  {Object.entries((ratio as { summary: Record<string, number> }).summary).map(([k, v]) => (
                    <div key={k}><span className="text-ink2">{k}</span> <span className="tnum">{fmtNum(v, 3)}</span></div>
                  ))}
                </div>
                {(ratio as { byGroup?: { group: string; n: number; median: number }[] }).byGroup && (
                  <table className="mt-3 w-full text-sm">
                    <thead><tr className="border-b border-line"><th className="overline px-2 py-1">Group</th><th className="overline px-2 py-1 text-right">n</th><th className="overline px-2 py-1 text-right">Median ratio</th></tr></thead>
                    <tbody>
                      {(ratio as { byGroup: { group: string; n: number; median: number }[] }).byGroup.map((g) => (
                        <tr key={g.group} className="border-b border-line">
                          <td className="px-2 py-1">{g.group}</td>
                          <td className="tnum px-2 py-1 text-right">{fmtNum(g.n)}</td>
                          <td className="tnum px-2 py-1 text-right">{g.median.toFixed(3)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <MethodNote>{(ratio as { note: string }).note}</MethodNote>
              </div>
            </div>
          )}
        </Section>
      )}

      {tab === "diversity" && (
        <Section title="Morphological diversity by group" aside={
          <select value={divGroup} onChange={(e) => setDivGroup(e.target.value)} className="rounded-sm border border-line bg-bg px-2 py-1 text-sm">
            <option value="order">by order</option>
            <option value="family">by family</option>
          </select>
        }>
          {!diversity ? <Loading label="Computing mean pairwise distances…" /> : (
            <>
              <Plot
                height={Math.max(340, 26 * ((diversity as { groups: unknown[] }).groups.length) + 60)}
                data={[{
                  type: "bar",
                  orientation: "h",
                  x: (diversity as { groups: { group: string; meanPairwiseDistance: number }[] }).groups.slice(0, 20).map((g) => g.meanPairwiseDistance),
                  y: (diversity as { groups: { group: string }[] }).groups.slice(0, 20).map((g) => g.group),
                  marker: { color: p.accent },
                  hovertemplate: "%{y}: mean pairwise distance %{x:.2f}<extra></extra>",
                }]}
                layout={{ ...baseLayout(dark), margin: { l: 140, r: 20, t: 10, b: 50 }, yaxis: { tickfont: { size: 10.5 } }, xaxis: { title: { text: "mean pairwise distance (standardized traits)" } } }}
              />
              <MethodNote>{(diversity as { method: string }).method}</MethodNote>
              <MethodNote>{(diversity as { note: string }).note}</MethodNote>
            </>
          )}
        </Section>
      )}

      {tab === "bivariate" && (
        <Section title="Bivariate relationship">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <select value={xVar} onChange={(e) => setXVar(e.target.value)} className="rounded-sm border border-line bg-bg px-2 py-1.5 text-sm">
              {VARIABLES.map((v) => <option key={v.value} value={v.value}>x: {v.label}</option>)}
            </select>
            <select value={yVar} onChange={(e) => setYVar(e.target.value)} className="rounded-sm border border-line bg-bg px-2 py-1.5 text-sm">
              {VARIABLES.map((v) => <option key={v.value} value={v.value}>y: {v.label}</option>)}
            </select>
            <select value={group ?? ""} onChange={(e) => setGroup(e.target.value || null)} className="rounded-sm border border-line bg-bg px-2 py-1.5 text-sm">
              <option value="">no grouping</option>
              {GROUP_VARS.map((g) => <option key={g.value} value={g.value}>group by: {g.label}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-sm text-ink2">
              <input type="checkbox" className="accent-accent" checked={xVar === "massG"} disabled />
              log x (auto for mass)
            </label>
            {bi && <span className="tnum text-xs text-ink3">n = {fmtNum(bi.grouped ? bi.correlations.reduce((a, c) => a + c.n, 0) : bi.pearson?.n ?? 0)} pairs</span>}
          </div>
          {biLoading ? <Loading /> : bi && (
            <>
              <Plot
                height={460}
                data={scatterTraces}
                layout={{
                  ...baseLayout(dark),
                  xaxis: { title: { text: VARIABLES.find((v) => v.value === xVar)?.label + (xVar === "massG" ? " (log)" : "") } },
                  yaxis: { title: { text: VARIABLES.find((v) => v.value === yVar)?.label } },
                  hovermode: "closest",
                }}
              />
              {!bi.grouped && bi.pearson && (
                <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
                  <div><span className="overline block">Pearson r</span><span className="tnum">{bi.pearson.r.toFixed(3)} (p = {bi.pearson.p.toExponential(1)})</span></div>
                  <div><span className="overline block">Spearman ρ</span><span className="tnum">{bi.spearman?.rho.toFixed(3)} (p = {bi.spearman?.p.toExponential(1)})</span></div>
                  <div><span className="overline block">OLS slope</span><span className="tnum">{bi.ols?.slope.toFixed(4)}</span></div>
                  <div><span className="overline block">R²</span><span className="tnum">{bi.ols?.r2 !== null && bi.ols?.r2 !== undefined ? bi.ols.r2.toFixed(3) : "—"}</span></div>
                </div>
              )}
              {bi.grouped && bi.correlations.length > 0 && (
                <table className="mt-3 w-full max-w-lg text-sm">
                  <thead><tr className="border-b border-line"><th className="overline px-2 py-1">Group</th><th className="overline px-2 py-1 text-right">n</th><th className="overline px-2 py-1 text-right">Pearson r</th><th className="overline px-2 py-1 text-right">Spearman ρ</th></tr></thead>
                  <tbody>
                    {bi.correlations.map((c) => (
                      <tr key={c.group} className="border-b border-line">
                        <td className="px-2 py-1">{c.group}</td>
                        <td className="tnum px-2 py-1 text-right">{fmtNum(c.n)}</td>
                        <td className="tnum px-2 py-1 text-right">{c.pearson?.toFixed(3) ?? "—"}</td>
                        <td className="tnum px-2 py-1 text-right">{c.spearman?.toFixed(3) ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <MethodNote>
                Correlation is not causation: body size drives most measurement pairs, and groups differ in composition. Dashed lines are per-group OLS fits; the shaded band (ungrouped view) is the parametric 95% CI of the mean response. All points remain clickable.
              </MethodNote>
            </>
          )}
        </Section>
      )}

      {tab === "groups" && (
        <Section title="Measurement by group">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <select value={gNumVar} onChange={(e) => setGNumVar(e.target.value)} className="rounded-sm border border-line bg-bg px-2 py-1.5 text-sm">
              {VARIABLES.map((v) => <option key={v.value} value={v.value}>measure: {v.label}</option>)}
            </select>
            <select value={gCatVar} onChange={(e) => setGCatVar(e.target.value)} className="rounded-sm border border-line bg-bg px-2 py-1.5 text-sm">
              {GROUP_VARS.map((g) => <option key={g.value} value={g.value}>by: {g.label}</option>)}
            </select>
            {grouped && <span className="tnum text-xs text-ink3">n = {fmtNum(grouped.nValid)} valid · {fmtNum(grouped.nMissing)} missing</span>}
          </div>
          {gLoading ? <Loading /> : grouped && (
            <>
              <Plot
                height={380}
                data={boxFromQuartiles}
                layout={{ ...baseLayout(dark), xaxis: { title: { text: GROUP_VARS.find((g) => g.value === gCatVar)?.label } }, yaxis: { title: { text: VARIABLES.find((v) => v.value === gNumVar)?.label } } }}
              />
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <th className="overline px-2 py-1">Group</th><th className="overline px-2 py-1 text-right">n</th><th className="overline px-2 py-1 text-right">Median</th>
                    <th className="overline px-2 py-1 text-right">Q1</th><th className="overline px-2 py-1 text-right">Q3</th><th className="overline px-2 py-1 text-right">Mean</th>
                  </tr>
                </thead>
                <tbody>
                  {grouped.groups.map((g) => (
                    <tr key={g.group} className="border-b border-line">
                      <td className="px-2 py-1">{g.group}</td>
                      <td className="tnum px-2 py-1 text-right">{fmtNum(g.n)}</td>
                      <td className="tnum px-2 py-1 text-right">{fmtNum(g.median, 2)}</td>
                      <td className="tnum px-2 py-1 text-right text-ink2">{fmtNum(g.q1, 2)}</td>
                      <td className="tnum px-2 py-1 text-right text-ink2">{fmtNum(g.q3, 2)}</td>
                      <td className="tnum px-2 py-1 text-right text-ink2">{fmtNum(g.mean, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {grouped.test && (
                <div className="mt-2 text-sm text-ink2">
                  <Pill tone="accent">Kruskal-Wallis H = {grouped.test.H.toFixed(1)}, p = {grouped.test.p.toExponential(1)}, ε² = {grouped.test.epsilonSquared?.toFixed(3) ?? "—"}</Pill>
                </div>
              )}
              <MethodNote>{grouped.note}</MethodNote>
            </>
          )}
        </Section>
      )}

      {tab === "outliers" && (
        <Section title="Outlier explorer">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <select value={oVar} onChange={(e) => setOVar(e.target.value)} className="rounded-sm border border-line bg-bg px-2 py-1.5 text-sm">
              {VARIABLES.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
            </select>
            <select value={oMethod} onChange={(e) => setOMethod(e.target.value as "iqr" | "modified_z")} className="rounded-sm border border-line bg-bg px-2 py-1.5 text-sm">
              <option value="iqr">method: IQR fences (×k)</option>
              <option value="modified_z">method: modified Z-score (MAD)</option>
            </select>
            <label className="text-sm text-ink2">
              threshold
              <input type="number" value={oThreshold} step={oMethod === "iqr" ? 0.5 : 0.5} min={oMethod === "iqr" ? 0.5 : 1} onChange={(e) => setOThreshold(Number(e.target.value) || oThreshold)} className="tnum ml-1 w-16 rounded-sm border border-line bg-bg px-1.5 py-1 text-sm" />
            </label>
            <select value={oGroup ?? ""} onChange={(e) => setOGroup(e.target.value || null)} className="rounded-sm border border-line bg-bg px-2 py-1.5 text-sm">
              <option value="">whole dataset</option>
              {GROUP_VARS.map((g) => <option key={g.value} value={g.value}>within: {g.label}</option>)}
            </select>
            {outliers && !outliers.note && <span className="tnum text-xs text-ink3">{fmtNum(outliers.nOutliers)} outliers of {fmtNum(outliers.nTotal)} species</span>}
          </div>
          {oLoading ? <Loading /> : outliers && (
            outliers.note ? (
              <EmptyState title="Not enough observations" hint={outliers.note} />
            ) : outliers.nOutliers === 0 ? (
              <EmptyState title="No outliers at this threshold" hint="Raise or lower the threshold to explore." />
            ) : (
              <>
                <DataTable
                  columns={outlierColumns}
                  rows={outliers.outliers}
                  onRowClick={(r) => navigate(`/species/${r.id}`)}
                />
                {outliers.group && <MethodNote>Outliers computed within each group separately; groups with n &lt; 10 are skipped.</MethodNote>}
                {!outliers.group && <MethodNote>An extreme value may be a genuine biological extreme (e.g. ostrich mass) rather than an error — inspect the species record before judging. Nothing is removed from the dataset.</MethodNote>}
              </>
            )
          )}
        </Section>
      )}
    </div>
  );
}
