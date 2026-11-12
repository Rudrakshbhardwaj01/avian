/** ML Experiments — defensible supervised learning with leakage-aware
 *  validation, model comparison, interpretability, and reproducible configs. */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Data } from "plotly.js-dist-min";
import { apiGet, apiPost, downloadJson } from "../../lib/api";
import { useMeta } from "../../hooks/useMeta";
import { FilterBar } from "../../components/FilterBar";
import { ErrorState, Loading, MethodNote, PageHeader, Pill, Section } from "../../components/ui";
import { Plot, baseLayout } from "../../components/Plot";
import { palette } from "../../lib/theme";
import { useApp } from "../../state/store";
import { blankNote, loadNotes, reproMetadata, saveNote } from "../../lib/notebook";

interface TaskInfo {
  id: string; label: string; question: string; targetLabel: string;
  legitimacy: string; predictors: string[];
}
interface TasksResponse {
  tasks: TaskInfo[];
  notDefensibleNote: string;
  models: { key: string; label: string }[];
}
interface ModelResult {
  model: string; label: string;
  groupedCV: { balancedAccuracyMean: number; balancedAccuracyStd: number; folds: number[] };
  randomCV: { balancedAccuracyMean: number; balancedAccuracyStd: number };
  f1Macro: number; rocAucOvrMacro: number | null;
  confusionMatrix: number[][]; classLabels: string[];
  perClass: { label: string; precision: number; recall: number; f1: number; support: number }[];
  durationSec: number;
}
interface ExperimentResult {
  task: TaskInfo;
  info: { nTotal: number; nUsed: number; excludedMissingTarget: number; targetDistribution: Record<string, number> };
  baseline: { balancedAccuracyMean: number; balancedAccuracyStd: number };
  models: ModelResult[];
  bestModel: string;
  importances: { feature: string; mean: number; std: number }[];
  partialDependence: { feature: string; grid: number[]; mean: number[] }[];
  cvScheme: { primary: string; comparison: string };
  seed: number;
  notDefensibleNote: string;
  limitations: string[];
}

export default function ExperimentsPage() {
  const meta = useMeta();
  const dark = useApp((s) => s.theme === "dark");
  const p = palette(dark);
  const filters = useApp((s) => s.filters);

  const [tasksInfo, setTasksInfo] = useState<TasksResponse | null>(null);
  const [task, setTask] = useState("migration");
  const [models, setModels] = useState<string[]>(["logistic", "random_forest", "hist_gb"]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<{ status: string; progress: number; stage: string; result: ExperimentResult | null; error: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    apiGet<TasksResponse>("/api/experiments/tasks").then(setTasksInfo).catch(() => undefined);
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  function start() {
    setError(null);
    apiPost<{ jobId: string }>("/api/experiments/supervised", { filters, task, models })
      .then(({ jobId: id }) => {
        setJobId(id);
        stopPolling();
        pollRef.current = setInterval(() => {
          apiGet<{ id: string; status: string; progress: number; stage: string; result: ExperimentResult | null; error: string | null }>(`/api/experiments/${id}`)
            .then((st) => {
              setStatus(st);
              if (st.status === "complete" || st.status === "failed" || st.status === "cancelled") stopPolling();
            })
            .catch((e) => {
              setError(e.message);
              stopPolling();
            });
        }, 1200);
      })
      .catch((e) => setError(e.message));
  }

  function cancel() {
    if (jobId) fetch(`/api/experiments/${jobId}`, { method: "DELETE" }).catch(() => undefined);
  }

  const result = status?.result;

  const importanceChart: Data[] = result ? [
    {
      type: "bar",
      orientation: "h",
      x: result.importances.slice(0, 10).map((r) => r.mean),
      y: result.importances.slice(0, 10).map((r) => r.feature),
      marker: { color: p.accent },
      error_x: { type: "data", array: result.importances.slice(0, 10).map((r) => r.std), visible: true, color: p.ink2, thickness: 1 },
      hovertemplate: "%{y}: Δbalanced-acc %{x:.4f}<extra></extra>",
    },
  ] : [];

  const confusionChart: Data[] = result && result.models.length ? [
    {
      type: "heatmap",
      z: result.models[0].confusionMatrix,
      x: result.models[0].classLabels,
      y: result.models[0].classLabels,
      colorscale: [[0, p.paper], [1, p.accent]],
      texttemplate: "%{z}",
      hovertemplate: "true %{y} → predicted %{x}: %{z}<extra></extra>",
      colorbar: { thickness: 10 },
    },
  ] : [];

  const pdpChart: Data[] = result ? result.partialDependence.map((d, i) => ({
    type: "scatter",
    mode: "lines",
    x: d.grid,
    y: d.mean,
    name: d.feature,
    line: { color: p.series[i % p.series.length], width: 2 },
    hovertemplate: `${d.feature} = %{x:.3g} → P(class) %{y:.3f}<extra></extra>`,
  })) : [];

  return (
    <div>
      <PageHeader
        title="ML Experiments"
        subtitle="Supervised learning on defensible research questions only: observed traits as predictors, grouped cross-validation by family to limit relatedness leakage, and a majority-class baseline every model must beat."
      />

      <Section className="mb-4">
        <FilterBar meta={meta} />
      </Section>

      {tasksInfo && (
        <Section title="1 · Research question" className="mb-4">
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {tasksInfo.tasks.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTask(t.id)}
                className={`rounded-sm border px-4 py-3 text-left transition-colors ${task === t.id ? "border-accent bg-accent-soft" : "border-line bg-panel2 hover:border-line-strong"}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-ink">{t.label}</span>
                  {task === t.id && <Pill tone="accent">selected</Pill>}
                </div>
                <p className="mt-1 text-sm text-ink2">{t.question}</p>
                <p className="mt-1 text-xs text-ink3">{t.legitimacy}</p>
                <div className="mt-1.5 text-xs text-ink3">target: {t.targetLabel} · predictors: {t.predictors.length} traits</div>
              </button>
            ))}
          </div>
          <MethodNote>{tasksInfo.notDefensibleNote}</MethodNote>
        </Section>
      )}

      <Section title="2 · Models & validation" className="mb-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {tasksInfo?.models.map((m) => (
            <label key={m.key} className={`flex items-center gap-1 text-sm ${models.includes(m.key) ? "text-ink" : "text-ink3"}`}>
              <input
                type="checkbox" className="accent-accent" checked={models.includes(m.key)}
                onChange={() => setModels(models.includes(m.key) ? models.filter((v) => v !== m.key) : [...models, m.key])}
              />
              {m.label}
            </label>
          ))}
          <span className="ml-auto flex gap-2">
            <button type="button" onClick={start} disabled={models.length === 0 || !!jobId && status?.status === "running"} className="rounded-sm bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-40">
              run experiment
            </button>
            {jobId && status?.status === "running" && (
              <button type="button" onClick={cancel} className="rounded-sm border border-line px-3 py-1.5 text-sm text-ink2 hover:border-danger hover:text-danger">
                cancel
              </button>
            )}
          </span>
        </div>
        <MethodNote>
          Validation: StratifiedGroupKFold (5 folds, <strong>grouped by family</strong>) — related species never straddle train/test. A stratified-random CV is also reported so the inflation from relatedness leakage is visible, not hidden.
        </MethodNote>
        {jobId && (
          <div className="mt-3">
            <div className="h-1.5 w-full overflow-hidden rounded-sm bg-panel2">
              <div className="h-1.5 bg-accent transition-all" style={{ width: `${Math.round((status?.progress ?? 0) * 100)}%` }} />
            </div>
            <div className="mt-1 text-xs text-ink3">
              job {jobId} · {status?.status} {status?.stage ? `· ${status.stage}` : ""}
            </div>
          </div>
        )}
        {error && <ErrorState message={error} />}
        {status?.status === "failed" && <ErrorState message={status.error ?? "experiment failed"} />}
      </Section>

      {status?.status === "running" && <Loading label="Training models (5 grouped folds each)…" />}

      {result && (
        <>
          <Section title={`3 · Results — ${result.task.label}`} className="mb-4" aside={
            <button
              type="button"
              onClick={() => {
                const note = blankNote();
                saveNote(
                  {
                    ...note,
                    kind: "experiment",
                    title: `Experiment: ${result.task.label}`,
                    method: `${result.models.length} models · StratifiedGroupKFold by family · seed ${result.seed}`,
                    result: `Best: ${result.bestModel} (balanced acc ${result.models.find((m) => m.model === result.bestModel)?.groupedCV.balancedAccuracyMean.toFixed(3)}; baseline ${(result.baseline.balancedAccuracyMean).toFixed(3)})`,
                    analysisConfig: { task: result.task.id, models: models, nUsed: result.info.nUsed },
                    reproducibility: reproMetadata({ task: result.task.id, models, seed: result.seed, datasetVersion: "2.3.1" }),
                  },
                  loadNotes(),
                );
              }}
              className="rounded-sm border border-line px-2 py-1 text-xs text-ink2 hover:border-accent"
            >
              save experiment to notebook
            </button>
          }>
            <div className="mb-2 flex flex-wrap gap-2 text-sm">
              <Pill tone="accent">n = {result.info.nUsed.toLocaleString("en-US")} species</Pill>
              <Pill>excluded (no target): {result.info.excludedMissingTarget.toLocaleString("en-US")}</Pill>
              <Pill>baseline (majority): {result.baseline.balancedAccuracyMean.toFixed(3)}</Pill>
              <Pill>seed {result.seed}</Pill>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line-strong text-left">
                  <th className="overline px-2 py-1">Model</th>
                  <th className="overline px-2 py-1 text-right" title="StratifiedGroupKFold by family — the honest estimate">Grouped CV bal-acc</th>
                  <th className="overline px-2 py-1 text-right" title="StratifiedKFold random — inflated by relatedness leakage">Random CV bal-acc</th>
                  <th className="overline px-2 py-1 text-right">F1 macro</th>
                  <th className="overline px-2 py-1 text-right">ROC-AUC OvR</th>
                  <th className="overline px-2 py-1 text-right">Time</th>
                </tr>
              </thead>
              <tbody>
                {result.models.map((m) => (
                  <tr key={m.model} className={`border-b border-line ${m.model === result.bestModel ? "bg-accent-soft/40" : ""}`}>
                    <td className="px-2 py-1.5 font-medium text-ink">{m.label}</td>
                    <td className="tnum px-2 py-1.5 text-right">{m.groupedCV.balancedAccuracyMean.toFixed(3)} ± {m.groupedCV.balancedAccuracyStd.toFixed(3)}</td>
                    <td className="tnum px-2 py-1.5 text-right text-ink2">
                      {m.randomCV.balancedAccuracyMean.toFixed(3)}
                      {m.randomCV.balancedAccuracyMean - m.groupedCV.balancedAccuracyMean > 0.02 && (
                        <span className="ml-1 text-warn" title="Random CV is notably higher: relatedness leakage inflates this number">▲</span>
                      )}
                    </td>
                    <td className="tnum px-2 py-1.5 text-right">{m.f1Macro.toFixed(3)}</td>
                    <td className="tnum px-2 py-1.5 text-right">{m.rocAucOvrMacro?.toFixed(3) ?? "—"}</td>
                    <td className="tnum px-2 py-1.5 text-right text-ink2">{m.durationSec.toFixed(1)}s</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <MethodNote>
              Balanced accuracy is the primary metric (handles class imbalance: {Object.entries(result.info.targetDistribution).map(([k, v]) => `${k}=${v}`).join(", ")}). The ▲ marker flags models whose random-CV score is meaningfully higher — evidence of family-level leakage.
            </MethodNote>
          </Section>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Section title={`Permutation importance (${result.bestModel})`}>
              <Plot height={300} data={importanceChart} layout={{ ...baseLayout(dark), margin: { l: 110, r: 20, t: 10, b: 40 }, yaxis: { tickfont: { size: 10.5 } }, xaxis: { title: { text: "Δ balanced accuracy when permuted" } } }} />
              <MethodNote>
                Importance describes the model's reliance on each trait — it does not establish causation, and one-hot encoded traits are aggregated back to their source feature.
              </MethodNote>
            </Section>

            <Section title="Confusion matrix (pooled held-out predictions)">
              <Plot height={300} data={confusionChart} layout={{ ...baseLayout(dark), margin: { l: 70, r: 30, t: 10, b: 60 } }} />
              <div className="mt-2">
                <table className="w-full text-xs">
                  <thead><tr className="border-b border-line"><th className="overline px-2 py-1">Class</th><th className="overline px-2 py-1 text-right">Precision</th><th className="overline px-2 py-1 text-right">Recall</th><th className="overline px-2 py-1 text-right">F1</th><th className="overline px-2 py-1 text-right">Support</th></tr></thead>
                  <tbody>
                    {result.models[0].perClass.map((c) => (
                      <tr key={c.label} className="border-b border-line">
                        <td className="px-2 py-1">{c.label}</td>
                        <td className="tnum px-2 py-1 text-right">{c.precision.toFixed(2)}</td>
                        <td className="tnum px-2 py-1 text-right">{c.recall.toFixed(2)}</td>
                        <td className="tnum px-2 py-1 text-right">{c.f1.toFixed(2)}</td>
                        <td className="tnum px-2 py-1 text-right text-ink2">{c.support.toLocaleString("en-US")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>

            {pdpChart.length > 0 && (
              <Section title="Partial dependence (top 2 numeric traits)">
                <Plot
                  height={280}
                  data={pdpChart}
                  layout={{ ...baseLayout(dark), xaxis: { title: { text: "trait value (analysis scale)" } }, yaxis: { title: { text: "model output" }, range: [0, 1] } }}
                />
                <MethodNote>
                  Partial dependence shows the model's average response as one trait varies — a descriptive view of the fitted model, not a biological response curve.
                </MethodNote>
              </Section>
            )}

            <Section title="Limitations & reproducibility">
              <ul className="list-disc space-y-1 pl-5 text-sm text-ink2">
                {result.limitations.map((l, i) => <li key={i}>{l}</li>)}
              </ul>
              <MethodNote>
                Reproduce exactly: dataset species.json v2.3.1 · task <code className="tnum">{result.task.id}</code> · models [{models.join(", ")}] · seed {result.seed} · same global filters. <button type="button" onClick={() => downloadJson("avian-experiment.json", result)} className="text-accent hover:underline">export full result</button>
              </MethodNote>
            </Section>
          </div>
        </>
      )}
    </div>
  );
}
