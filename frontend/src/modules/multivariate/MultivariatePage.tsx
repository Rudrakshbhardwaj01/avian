/** Module 9 — Multivariate: PCA (biplot, scree, loadings), nonlinear
 *  embeddings (t-SNE / UMAP / kernel PCA as background jobs), and clustering
 *  (k-means, hierarchical + dendrogram, DBSCAN, HDBSCAN, GMM, spectral). */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Data } from "plotly.js-dist-min";
import { apiGet, apiPost, downloadJson } from "../../lib/api";
import { useMeta } from "../../hooks/useMeta";
import { FilterBar } from "../../components/FilterBar";
import { EmptyState, ErrorState, Loading, MethodNote, PageHeader, Pill, Section } from "../../components/ui";
import { Plot, baseLayout } from "../../components/Plot";
import { fmtNum, palette } from "../../lib/theme";
import { useApp } from "../../state/store";

const TRAITS = [
  { value: "massG", label: "mass (g)" },
  { value: "wingMm", label: "wing (mm)" },
  { value: "tailMm", label: "tail (mm)" },
  { value: "tarsusMm", label: "tarsus (mm)" },
  { value: "beakCulmenMm", label: "culmen (mm)" },
  { value: "beakWidthMm", label: "bill width (mm)" },
  { value: "beakDepthMm", label: "bill depth (mm)" },
  { value: "handWingIndex", label: "hand-wing idx" },
];
const LOGGABLE = ["massG", "wingMm", "tailMm", "tarsusMm", "beakCulmenMm", "beakWidthMm", "beakDepthMm"];
const COLOR_BY = [
  { value: "order", label: "order" },
  { value: "family", label: "family" },
  { value: "habitat", label: "habitat" },
  { value: "trophicNiche", label: "trophic niche" },
  { value: "iucn", label: "IUCN" },
] as const;

interface PcaResponse {
  variables: string[]; standardize: boolean;
  info: { nTotal: number; nComplete: number; nExcluded: number; logApplied: string[] };
  nComponents: number; explainedVariance: number[]; explainedVarianceCum: number[]; eigenvalues: number[];
  loadings: { variable: string; loadings: number[] }[];
  points: { id: string; sci: string; en: string | null; order: string; habitat: string | null; iucn: string | null; scores: number[] }[];
  note: string;
}
interface EmbeddingResponse {
  method: string; variables: string[];
  info: { nTotal: number; nComplete: number; nExcluded: number; nShown: number; sampled: boolean; logApplied?: string[] };
  params: Record<string, number | string>;
  points: { id: string; en: string | null; sci: string; order: string; family: string; habitat: string | null; trophicNiche: string | null; iucn: string | null; x: number; y: number }[];
  note: string;
}
interface ClusterResponse {
  variables: string[]; algorithm: string; params: Record<string, number | string>; standardize: boolean;
  info: { nTotal: number; nComplete: number; nExcluded: number };
  nClusters: number; nNoise: number; metrics: Record<string, number | boolean | string>;
  clusterSummaries: { cluster: number; n: number; centroidRaw: Record<string, number>; orders: Record<string, number>; habitats: Record<string, number>; niches: Record<string, number> }[];
  noise: { n: number; orders: Record<string, number> } | null;
  assignments: { id: string; sci: string; en: string | null; order: string; cluster: number }[];
  note: string;
}
interface DendrogramResponse {
  variables: string[]; method: string; nFamilies: number;
  icoord: number[][]; dcoord: number[][]; leafLabels: string[]; note: string;
}

export default function MultivariatePage() {
  const meta = useMeta();
  const dark = useApp((s) => s.theme === "dark");
  const p = palette(dark);
  const filters = useApp((s) => s.filters);
  const [tab, setTab] = useState<"pca" | "embeddings" | "cluster" | "dendrogram">("pca");

  // ---- PCA ----
  const [pcaVars, setPcaVars] = useState<string[]>(TRAITS.map((t) => t.value));
  const [pcaLogs, setPcaLogs] = useState<string[]>(["massG"]);
  const [standardize, setStandardize] = useState(true);
  const [showBiplot, setShowBiplot] = useState(true);
  const [pca, setPca] = useState<PcaResponse | null>(null);
  const [pcaLoading, setPcaLoading] = useState(false);

  useEffect(() => {
    setPcaLoading(true);
    apiPost<PcaResponse>("/api/multivariate/pca", { filters, variables: pcaVars, logVars: pcaLogs, standardize })
      .then(setPca)
      .catch(() => undefined)
      .finally(() => setPcaLoading(false));
  }, [filters, pcaVars, pcaLogs, standardize]);

  // ---- embeddings (background job) ----
  const [embMethod, setEmbMethod] = useState<"tsne" | "umap" | "kernel_pca">("umap");
  const [perplexity, setPerplexity] = useState(30);
  const [nNeighbors, setNNeighbors] = useState(25);
  const [minDist, setMinDist] = useState(0.1);
  const [embJob, setEmbJob] = useState<string | null>(null);
  const [emb, setEmb] = useState<EmbeddingResponse | null>(null);
  const [embStatus, setEmbStatus] = useState<{ status: string; progress: number; stage: string; error: string | null } | null>(null);
  const [embColor, setEmbColor] = useState<(typeof COLOR_BY)[number]["value"]>("order");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopEmbPoll = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);
  useEffect(() => stopEmbPoll, [stopEmbPoll]);

  function runEmbedding() {
    apiPost<{ jobId: string }>("/api/experiments/embedding", {
      filters, method: embMethod, variables: pcaVars, logVars: pcaLogs, standardize,
      perplexity, nNeighbors, minDist,
    })
      .then(({ jobId }) => {
        setEmbJob(jobId);
        stopEmbPoll();
        pollRef.current = setInterval(() => {
          apiGet<{ status: string; progress: number; stage: string; result: EmbeddingResponse | null; error: string | null }>(`/api/experiments/${jobId}`)
            .then((st) => {
              setEmbStatus(st);
              if (st.status === "complete") setEmb(st.result);
              if (["complete", "failed", "cancelled"].includes(st.status)) stopEmbPoll();
            })
            .catch(() => stopEmbPoll());
        }, 1000);
      })
      .catch((e) => setEmbStatus({ status: "failed", progress: 0, stage: "", error: e.message }));
  }

  // ---- clustering ----
  const [clVars, setClVars] = useState<string[]>(["massG", "wingMm", "tarsusMm", "beakCulmenMm"]);
  const [algorithm, setAlgorithm] = useState<"kmeans" | "hierarchical" | "dbscan" | "hdbscan" | "gmm" | "spectral">("kmeans");
  const [k, setK] = useState(5);
  const [linkage, setLinkage] = useState("ward");
  const [eps, setEps] = useState(1.0);
  const [minSamples, setMinSamples] = useState(10);
  const [covarianceType, setCovarianceType] = useState("full");
  const [cluster, setCluster] = useState<ClusterResponse | null>(null);
  const [clLoading, setClLoading] = useState(false);
  // client-side comparison of configurations from this session
  const [runLog, setRunLog] = useState<{ algorithm: string; params: string; nClusters: number; nNoise: number; silhouette: string; db: string }[]>([]);

  useEffect(() => {
    if (tab !== "cluster") return;
    setClLoading(true);
    apiPost<ClusterResponse>("/api/multivariate/cluster", {
      filters, variables: clVars, algorithm, k, linkage, eps, minSamples, logVars: pcaLogs, covarianceType,
    })
      .then((res) => {
        setCluster(res);
        setRunLog((log) => [
          {
            algorithm: res.algorithm,
            params: JSON.stringify(res.params),
            nClusters: res.nClusters,
            nNoise: res.nNoise,
            silhouette: typeof res.metrics.silhouette === "number" ? res.metrics.silhouette.toFixed(3) : "—",
            db: typeof res.metrics.daviesBouldin === "number" ? res.metrics.daviesBouldin.toFixed(3) : "—",
          },
          ...log.filter((l) => l.params !== JSON.stringify(res.params)).slice(0, 7),
        ]);
      })
      .catch(() => undefined)
      .finally(() => setClLoading(false));
  }, [filters, clVars, algorithm, k, linkage, eps, minSamples, covarianceType, pcaLogs, tab]);

  // ---- dendrogram ----
  const [dendro, setDendro] = useState<DendrogramResponse | null>(null);
  useEffect(() => {
    if (tab !== "dendrogram") return;
    apiPost<DendrogramResponse>("/api/multivariate/dendrogram", { filters, variables: clVars, logVars: ["massG"], method: "ward" })
      .then(setDendro)
      .catch(() => undefined);
  }, [filters, clVars, tab]);

  function toggleVar(list: string[], setList: (v: string[]) => void, value: string) {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  const pcaScatter: Data[] = useMemo(() => {
    if (!pca) return [];
    const traces: Data[] = [];
    for (const [i, j] of [[0, 1], [0, 2]] as [number, number][]) {
      if (j >= pca.nComponents) continue;
      traces.push({
        type: "scattergl",
        mode: "markers",
        x: pca.points.map((pt) => pt.scores[i]),
        y: pca.points.map((pt) => pt.scores[j]),
        marker: { color: p.accent, size: 5, opacity: 0.6 },
        text: pca.points.map((pt) => `${pt.en ?? pt.sci}<br><i>${pt.sci}</i> · ${pt.order}`),
        hovertemplate: "%{text}<extra></extra>",
        xaxis: `x${j === 0 ? "" : "2"}`,
        yaxis: `y${j === 0 ? "" : "2"}`,
        showlegend: false,
      });
    }
    return traces;
  }, [pca, p]);

  // biplot: loading vectors overlaid on the PC1×PC2 scatter
  const biplotVectors = useMemo(() => {
    if (!pca || !showBiplot || pca.nComponents < 2) return [];
    const scale = 3.2;
    return pca.loadings.map((l, li) => ({
      type: "scatter",
      mode: "lines+text",
      x: [0, (l.loadings[0] ?? 0) * scale],
      y: [0, (l.loadings[1] ?? 0) * scale],
      text: ["", l.variable],
      textposition: "top right",
      line: { color: p.series[li % p.series.length], width: 1.6 },
      textfont: { size: 9, color: p.ink2 },
      hovertemplate: `${l.variable}: PC1 ${(l.loadings[0] ?? 0).toFixed(2)}, PC2 ${(l.loadings[1] ?? 0).toFixed(2)}<extra></extra>`,
      showlegend: false,
    })) as unknown as Data[];
  }, [pca, showBiplot, p]);

  const screeData: Data[] = pca ? [
    {
      type: "bar",
      x: pca.explainedVariance.map((_, i) => `PC${i + 1}`),
      y: pca.explainedVariance.map((v) => 100 * v),
      marker: { color: p.accent },
      name: "explained %",
    },
    {
      type: "scatter",
      mode: "lines+markers",
      x: pca.explainedVariance.map((_, i) => `PC${i + 1}`),
      y: pca.explainedVarianceCum.map((v) => 100 * v),
      yaxis: "y2",
      name: "cumulative %",
      line: { color: p.info },
    },
  ] : [];

  const loadingData: Data[] = pca ? [
    {
      type: "heatmap",
      z: pca.loadings[0]?.loadings.map((_, j) => pca.loadings.map((l) => l.loadings[j])),
      x: pca.loadings.map((l) => l.variable),
      y: pca.loadings[0]?.loadings.map((_, j) => `PC${j + 1}`),
      colorscale: [[0, p.danger], [0.5, dark ? "#242219" : "#f6f4ef"], [1, p.accent]],
      zmin: -1, zmax: 1,
      texttemplate: "%{z:.2f}",
      colorbar: { thickness: 12 },
    } as unknown as Data,
  ] : [];

  const embeddingChart: Data[] = useMemo(() => {
    if (!emb) return [];
    const groups = Array.from(new Set(emb.points.map((pt) => String(pt[embColor] ?? "?")))).slice(0, 12);
    return groups.map((g, gi) => {
      const rows = emb.points.filter((pt) => String(pt[embColor] ?? "?") === g);
      return {
        type: "scattergl",
        mode: "markers",
        name: g,
        x: rows.map((pt) => pt.x),
        y: rows.map((pt) => pt.y),
        marker: { color: p.series[gi % p.series.length], size: 4.5, opacity: 0.65 },
        text: rows.map((pt) => `${pt.en ?? pt.sci}<br><i>${pt.sci}</i>`),
        hovertemplate: "%{text}<extra></extra>",
      };
    });
  }, [emb, embColor, p]);

  const clusterScatter: Data[] = useMemo(() => {
    if (!pca || !cluster) return [];
    const byId = new Map(pca.points.map((pt) => [pt.id, pt]));
    const traces: Data[] = [];
    const groups = new Set(cluster.assignments.map((a) => a.cluster));
    for (const c of [...groups].sort()) {
      const rows = cluster.assignments.filter((a) => a.cluster === c).map((a) => byId.get(a.id)).filter(Boolean) as typeof pca.points;
      if (!rows.length) continue;
      traces.push({
        type: "scattergl",
        mode: "markers",
        name: c === -1 ? "noise" : `cluster ${c} (n=${fmtNum(rows.length)})`,
        x: rows.map((pt) => pt.scores[0]),
        y: rows.map((pt) => pt.scores[1]),
        marker: { color: c === -1 ? p.ink2 : p.series[c % p.series.length], size: 5, opacity: 0.7 },
        text: rows.map((pt) => `${pt.en ?? pt.sci}<br><i>${pt.sci}</i>`),
        hovertemplate: "%{text}<extra></extra>",
      });
    }
    return traces;
  }, [pca, cluster, p]);

  const dendroChart: Data[] = useMemo(() => {
    if (!dendro) return [];
    // each segment: icoord/dcoord come in 4-point polylines
    const segs: Data[] = [];
    for (let i = 0; i < dendro.icoord.length; i++) {
      segs.push({
        type: "scatter",
        mode: "lines",
        x: dendro.icoord[i],
        y: dendro.dcoord[i],
        line: { color: p.ink2, width: 1.2 },
        hoverinfo: "skip",
        showlegend: false,
      });
    }
    return segs;
  }, [dendro, p]);

  return (
    <div>
      <PageHeader
        title="Multivariate Analysis"
        subtitle="PCA, nonlinear embeddings, and seven clustering algorithms over AVONET traits. Complete cases only; exclusions always reported. Low-dimensional structure is a lens, not a phylogeny."
      />

      <Section className="mb-4">
        <FilterBar meta={meta} />
      </Section>

      <div className="mb-4 flex flex-wrap gap-1">
        {([
          ["pca", "principal components"],
          ["embeddings", "embeddings (t-SNE · UMAP · kernel PCA)"],
          ["cluster", "clustering"],
          ["dendrogram", "dendrogram"],
        ] as const).map(([t, label]) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={`rounded-sm px-3 py-1.5 text-sm ${tab === t ? "bg-accent-soft font-medium text-accent-ink" : "text-ink2 hover:bg-panel2"}`}>
            {label}
          </button>
        ))}
      </div>

      <Section className="mb-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="overline">variables</span>
          {TRAITS.map((t) => (
            <label key={t.value} className={`flex items-center gap-1 text-sm ${pcaVars.includes(t.value) ? "text-ink" : "text-ink3"}`}>
              <input type="checkbox" className="accent-accent" checked={pcaVars.includes(t.value)} onChange={() => toggleVar(pcaVars, setPcaVars, t.value)} disabled={pcaVars.length === 2 && pcaVars.includes(t.value)} />
              {t.label}
            </label>
          ))}
          <span className="overline ml-3">log</span>
          {LOGGABLE.map((v) => (
            <label key={v} className={`flex items-center gap-1 text-xs ${pcaLogs.includes(v) ? "text-ink" : "text-ink3"}`}>
              <input type="checkbox" className="accent-accent" checked={pcaLogs.includes(v)} onChange={() => toggleVar(pcaLogs, setPcaLogs, v)} />
              {TRAITS.find((t) => t.value === v)?.label}
            </label>
          ))}
          <label className="flex items-center gap-1 text-sm">
            <input type="checkbox" className="accent-accent" checked={standardize} onChange={(e) => setStandardize(e.target.checked)} />
            standardize (z-scores)
          </label>
        </div>
      </Section>

      {tab === "pca" && (
        <Section title="Principal Component Analysis" className="mb-4">
          {pcaLoading || !pca ? <Loading label="Running PCA…" /> : (
            <>
              <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                <Pill tone="accent">{fmtNum(pca.info.nComplete)} complete cases · {fmtNum(pca.info.nExcluded)} excluded</Pill>
                {pca.info.logApplied.length > 0 && <Pill>log: {pca.info.logApplied.join(", ")}</Pill>}
                {!standardize && <Pill tone="warn">unstandardized — units dominate the axes</Pill>}
                <label className="flex items-center gap-1 text-xs text-ink2">
                  <input type="checkbox" className="accent-accent" checked={showBiplot} onChange={(e) => setShowBiplot(e.target.checked)} />
                  show biplot vectors
                </label>
                <button type="button" onClick={() => downloadJson("avian-pca.json", pca)} className="ml-auto rounded-sm border border-line px-2 py-1 text-xs text-ink2 hover:border-accent">
                  export scores + loadings
                </button>
              </div>
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                <div className="xl:col-span-2">
                  <Plot
                    height={430}
                    data={[...pcaScatter, ...biplotVectors]}
                    layout={{
                      ...baseLayout(dark),
                      grid: { rows: 1, columns: pca.nComponents >= 3 ? 2 : 1, pattern: "independent" },
                      xaxis: { title: { text: `PC1 (${(100 * pca.explainedVariance[0]).toFixed(1)}%)` } },
                      yaxis: { title: { text: `PC2 (${(100 * pca.explainedVariance[1]).toFixed(1)}%)` } },
                      ...(pca.nComponents >= 3 ? {
                        xaxis2: { domain: [0.55, 1], title: { text: "PC1" } },
                        yaxis2: { domain: [0, 1], anchor: "x2", title: { text: `PC3 (${(100 * pca.explainedVariance[2]).toFixed(1)}%)` } },
                      } : {}),
                    }}
                  />
                  <MethodNote>
                    Biplot vectors show how each trait loads on PC1/PC2 (scaled ×{3.2} for visibility); arrows pointing the same way are traits that rise together.
                  </MethodNote>
                </div>
                <div>
                  <Plot height={210} data={screeData} layout={{ ...baseLayout(dark), yaxis: { title: { text: "%" } }, yaxis2: { overlaying: "y", side: "right", range: [0, 100], title: { text: "cum %" } }, showlegend: false, margin: { l: 40, r: 45, t: 10, b: 40 } }} />
                  <Plot height={260} data={loadingData} layout={{ ...baseLayout(dark), margin: { l: 55, r: 10, t: 10, b: 60 } }} />
                </div>
              </div>
              <MethodNote>{pca.note}</MethodNote>
            </>
          )}
        </Section>
      )}

      {tab === "embeddings" && (
        <Section title="Nonlinear embeddings" className="mb-4">
          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <select value={embMethod} onChange={(e) => setEmbMethod(e.target.value as typeof embMethod)} className="rounded-sm border border-line bg-bg px-2 py-1.5 text-sm">
              <option value="umap">UMAP</option>
              <option value="tsne">t-SNE</option>
              <option value="kernel_pca">kernel PCA</option>
            </select>
            {embMethod === "tsne" && (
              <label className="text-sm text-ink2">
                perplexity
                <input type="number" min={5} max={200} value={perplexity} onChange={(e) => setPerplexity(Math.max(5, Number(e.target.value) || 30))} className="tnum ml-1 w-16 rounded-sm border border-line bg-bg px-1.5 py-1 text-sm" />
              </label>
            )}
            {embMethod === "umap" && (
              <>
                <label className="text-sm text-ink2">
                  n neighbors
                  <input type="number" min={2} max={200} value={nNeighbors} onChange={(e) => setNNeighbors(Math.max(2, Number(e.target.value) || 25))} className="tnum ml-1 w-16 rounded-sm border border-line bg-bg px-1.5 py-1 text-sm" />
                </label>
                <label className="text-sm text-ink2">
                  min dist
                  <input type="number" step={0.05} min={0} max={0.95} value={minDist} onChange={(e) => setMinDist(Math.max(0, Number(e.target.value) || 0.1))} className="tnum ml-1 w-16 rounded-sm border border-line bg-bg px-1.5 py-1 text-sm" />
                </label>
              </>
            )}
            <select value={embColor} onChange={(e) => setEmbColor(e.target.value as typeof embColor)} className="rounded-sm border border-line bg-bg px-2 py-1.5 text-sm">
              {COLOR_BY.map((c) => <option key={c.value} value={c.value}>color by: {c.label}</option>)}
            </select>
            <button type="button" onClick={runEmbedding} disabled={embStatus?.status === "running"} className="rounded-sm bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-40">
              {embStatus?.status === "running" ? "computing…" : "compute embedding"}
            </button>
            {emb && (
              <button type="button" onClick={() => downloadJson("avian-embedding.json", emb)} className="rounded-sm border border-line px-2 py-1 text-xs text-ink2 hover:border-accent">
                export
              </button>
            )}
          </div>
          {embStatus?.status === "running" && (
            <div className="mb-3">
              <div className="h-1.5 w-full overflow-hidden rounded-sm bg-panel2">
                <div className="h-1.5 bg-accent transition-all" style={{ width: `${Math.round(embStatus.progress * 100)}%` }} />
              </div>
              <div className="mt-1 text-xs text-ink3">job {embJob} · {embStatus.stage || embStatus.status}</div>
            </div>
          )}
          {embStatus?.status === "failed" && <ErrorState message={embStatus.error ?? "embedding failed"} />}
          {!emb ? (
            <EmptyState title="Configure and compute an embedding" hint="UMAP/t-SNE run as background jobs with fixed seeds; identical configurations return the cached result instantly." />
          ) : (
            <>
              <div className="mb-2 flex flex-wrap gap-2">
                <Pill tone="accent">{emb.method} · {fmtNum(emb.info.nShown)} points{emb.info.sampled ? " (sampled)" : ""}</Pill>
                <Pill>{Object.entries(emb.params).map(([k, v]) => `${k}=${v}`).join(" · ")}</Pill>
                <Pill>seed 42</Pill>
              </div>
              <Plot
                height={520}
                data={embeddingChart}
                layout={{ ...baseLayout(dark), margin: { l: 20, r: 20, t: 10, b: 30 }, legend: { font: { size: 10 } } }}
              />
              <MethodNote>{emb.note}</MethodNote>
            </>
          )}
        </Section>
      )}

      {tab === "cluster" && (
        <Section title="Clustering" className="mb-4">
          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <select value={algorithm} onChange={(e) => setAlgorithm(e.target.value as typeof algorithm)} className="rounded-sm border border-line bg-bg px-2 py-1.5 text-sm">
              <option value="kmeans">k-means</option>
              <option value="hierarchical">hierarchical (agglomerative)</option>
              <option value="dbscan">DBSCAN</option>
              <option value="hdbscan">HDBSCAN</option>
              <option value="gmm">Gaussian mixture model</option>
              <option value="spectral">spectral clustering</option>
            </select>
            {["kmeans", "hierarchical", "gmm", "spectral"].includes(algorithm) && (
              <label className="text-sm text-ink2">
                clusters
                <input type="number" min={2} max={12} value={k} onChange={(e) => setK(Math.max(2, Math.min(12, Number(e.target.value) || 5)))} className="tnum ml-1 w-14 rounded-sm border border-line bg-bg px-1.5 py-1 text-sm" />
              </label>
            )}
            {algorithm === "hierarchical" && (
              <select value={linkage} onChange={(e) => setLinkage(e.target.value)} className="rounded-sm border border-line bg-bg px-2 py-1.5 text-sm">
                <option value="ward">linkage: ward</option>
                <option value="complete">linkage: complete</option>
                <option value="average">linkage: average</option>
              </select>
            )}
            {algorithm === "gmm" && (
              <select value={covarianceType} onChange={(e) => setCovarianceType(e.target.value)} className="rounded-sm border border-line bg-bg px-2 py-1.5 text-sm">
                <option value="full">covariance: full</option>
                <option value="diag">covariance: diag</option>
                <option value="spherical">covariance: spherical</option>
              </select>
            )}
            {algorithm === "dbscan" && (
              <label className="text-sm text-ink2">
                eps
                <input type="number" step={0.1} min={0.1} value={eps} onChange={(e) => setEps(Math.max(0.1, Number(e.target.value) || 1))} className="tnum ml-1 w-16 rounded-sm border border-line bg-bg px-1.5 py-1 text-sm" />
              </label>
            )}
            {["dbscan", "hdbscan"].includes(algorithm) && (
              <label className="text-sm text-ink2">
                min samples
                <input type="number" min={2} max={200} value={minSamples} onChange={(e) => setMinSamples(Math.max(2, Number(e.target.value) || 10))} className="tnum ml-1 w-14 rounded-sm border border-line bg-bg px-1.5 py-1 text-sm" />
              </label>
            )}
            <span className="overline ml-3">cluster traits</span>
            {TRAITS.map((t) => (
              <label key={t.value} className={`flex items-center gap-1 text-xs ${clVars.includes(t.value) ? "text-ink" : "text-ink3"}`}>
                <input type="checkbox" className="accent-accent" checked={clVars.includes(t.value)} onChange={() => toggleVar(clVars, setClVars, t.value)} disabled={clVars.length === 2 && clVars.includes(t.value)} />
                {t.label}
              </label>
            ))}
          </div>
          {clLoading || !cluster ? <Loading label="Clustering…" /> : (
            <>
              <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                <Pill tone="accent">{fmtNum(cluster.info.nComplete)} points · {cluster.nClusters} clusters{cluster.nNoise ? ` · ${fmtNum(cluster.nNoise)} noise` : ""}</Pill>
                {typeof cluster.metrics.silhouette === "number" && <Pill>silhouette {cluster.metrics.silhouette.toFixed(3)}{cluster.metrics.silhouetteSampled ? " (sampled 3k)" : ""}</Pill>}
                {typeof cluster.metrics.daviesBouldin === "number" && <Pill>Davies–Bouldin {cluster.metrics.daviesBouldin.toFixed(3)}</Pill>}
                {typeof cluster.metrics.calinskiHarabasz === "number" && <Pill>Calinski–Harabasz {fmtNum(cluster.metrics.calinskiHarabasz)}</Pill>}
                <button type="button" onClick={() => downloadJson("avian-clusters.json", cluster)} className="ml-auto rounded-sm border border-line px-2 py-1 text-xs text-ink2 hover:border-accent">
                  export assignments
                </button>
              </div>
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <div>
                  <Plot
                    height={400}
                    data={clusterScatter}
                    layout={{
                      ...baseLayout(dark),
                      xaxis: { title: { text: pca ? `PC1 (${(100 * pca.explainedVariance[0]).toFixed(1)}%)` : "PC1" } },
                      yaxis: { title: { text: "PC2" } },
                    }}
                  />
                  <MethodNote>Clusters projected onto the trait-PCA plane for reference.</MethodNote>
                </div>
                <div>
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-line"><th className="overline px-2 py-1">Cluster</th><th className="overline px-2 py-1 text-right">n</th><th className="overline px-2 py-1">Centroid (raw units)</th><th className="overline px-2 py-1">Top orders</th></tr></thead>
                    <tbody>
                      {cluster.clusterSummaries.map((c) => (
                        <tr key={c.cluster} className="border-b border-line align-top">
                          <td className="px-2 py-1 font-medium" style={{ color: p.series[c.cluster % p.series.length] }}>#{c.cluster}</td>
                          <td className="tnum px-2 py-1 text-right">{fmtNum(c.n)}</td>
                          <td className="px-2 py-1 text-xs text-ink2">
                            {Object.entries(c.centroidRaw).map(([k2, v]) => `${k2}=${fmtNum(v, 1)}`).join(" · ")}
                          </td>
                          <td className="px-2 py-1 text-xs text-ink2">{Object.entries(c.orders).slice(0, 3).map(([o, n]) => `${o} (${n})`).join(", ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {runLog.length > 1 && (
                    <div className="mt-3">
                      <div className="overline mb-1">Configuration comparison (this session)</div>
                      <table className="w-full text-xs">
                        <thead><tr className="border-b border-line"><th className="px-2 py-1 text-left text-ink3">algorithm</th><th className="px-2 py-1 text-right text-ink3">clusters</th><th className="px-2 py-1 text-right text-ink3">noise</th><th className="px-2 py-1 text-right text-ink3">silhouette</th><th className="px-2 py-1 text-right text-ink3">Davies–B.</th></tr></thead>
                        <tbody>
                          {runLog.map((l, i) => (
                            <tr key={i} className="border-b border-line">
                              <td className="px-2 py-1 font-medium text-ink">{l.algorithm}</td>
                              <td className="tnum px-2 py-1 text-right">{l.nClusters}</td>
                              <td className="tnum px-2 py-1 text-right">{l.nNoise || "—"}</td>
                              <td className="tnum px-2 py-1 text-right">{l.silhouette}</td>
                              <td className="tnum px-2 py-1 text-right">{l.db}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <MethodNote>No single algorithm is universally best — compare silhouette, cluster sizes, and interpretability across configurations rather than trusting one result.</MethodNote>
                    </div>
                  )}
                </div>
              </div>
              <MethodNote>{cluster.note}</MethodNote>
            </>
          )}
        </Section>
      )}

      {tab === "dendrogram" && (
        <Section title="Hierarchical dendrogram (family medians)">
          {!dendro ? <Loading label="Clustering families…" /> : (dendro as unknown as { error?: string }).error ? (
            <ErrorState message={(dendro as unknown as { error: string }).error} />
          ) : (
            <>
              <Plot
                height={620}
                data={dendroChart}
                layout={{
                  ...baseLayout(dark),
                  margin: { l: 20, r: 20, t: 10, b: 90 },
                  xaxis: { visible: false },
                  yaxis: { title: { text: "merge distance" } },
                }}
              />
              <div className="mt-1 text-xs text-ink3">
                {(dendro as { leafLabels: string[] }).leafLabels.join(" · ")}
              </div>
              <MethodNote>{(dendro as { note: string }).note}</MethodNote>
            </>
          )}
        </Section>
      )}
    </div>
  );
}
