/** Anomaly Lab — unusual trait combinations via Isolation Forest / LOF /
 *  robust covariance, with data-quality vs biological triage hints. */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { apiPost, downloadJson } from "../../lib/api";
import { useMeta } from "../../hooks/useMeta";
import { FilterBar } from "../../components/FilterBar";
import { ErrorState, Loading, MethodNote, PageHeader, Pill, Section } from "../../components/ui";
import { fmtNum, palette } from "../../lib/theme";
import { useApp } from "../../state/store";
import { useSearchParams } from "react-router";

const FEATURES = [
  { value: "massG", label: "mass" },
  { value: "wingMm", label: "wing" },
  { value: "tailMm", label: "tail" },
  { value: "tarsusMm", label: "tarsus" },
  { value: "beakCulmenMm", label: "culmen" },
  { value: "beakWidthMm", label: "bill width" },
  { value: "beakDepthMm", label: "bill depth" },
  { value: "handWingIndex", label: "hand-wing idx" },
];

interface AnomalyResult {
  id: string; en: string; sci: string; order: string; family: string; iucn: string | null;
  score: number; percentile: number; traitsInferred: boolean;
  contributing: { feature: string; z: number }[];
  values: Record<string, number>;
  triage: string;
}
interface AnomalyResponse {
  method: string; features: string[]; n: number; excludedIncomplete: number; flaggedN: number;
  results?: AnomalyResult[]; error?: string; note: string; methodNote: string;
}

export default function AnomaliesPage() {
  const meta = useMeta();
  const dark = useApp((s) => s.theme === "dark");
  const p = palette(dark);
  const navigate = useNavigate();
  const filters = useApp((s) => s.filters);
  const [params] = useSearchParams();

  const [method, setMethod] = useState("isolation_forest");
  const [contamination, setContamination] = useState(0.02);
  const [features, setFeatures] = useState<string[]>(FEATURES.map((f) => f.value));
  const [res, setRes] = useState<AnomalyResponse | null>(null);
  const [loading, setLoading] = useState(false);
  void params;

  useEffect(() => {
    setLoading(true);
    apiPost<AnomalyResponse>("/api/anomalies/detect", { filters, features, method, contamination, limit: 25 })
      .then(setRes)
      .catch((e) => setRes({ error: e.message, note: "", methodNote: "" } as AnomalyResponse))
      .finally(() => setLoading(false));
  }, [filters, features, method, contamination]);

  return (
    <div>
      <PageHeader
        title="Anomaly Lab"
        subtitle="Unusual combinations of morphological traits. An anomaly is not an error — each result carries a triage hint and nothing is ever removed from the dataset."
      />

      <Section className="mb-4">
        <FilterBar meta={meta} />
      </Section>

      <Section title="Configuration" className="mb-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <select value={method} onChange={(e) => setMethod(e.target.value)} className="rounded-sm border border-line bg-bg px-2 py-1.5 text-sm">
            <option value="isolation_forest">method: Isolation Forest</option>
            <option value="lof">method: Local Outlier Factor</option>
            <option value="robust_covariance">method: Robust covariance (Elliptic Envelope)</option>
          </select>
          <label className="text-sm text-ink2">
            contamination
            <input
              type="number" step={0.005} min={0.005} max={0.2} value={contamination}
              onChange={(e) => setContamination(Math.max(0.005, Math.min(0.2, Number(e.target.value) || 0.02)))}
              className="tnum ml-1 w-20 rounded-sm border border-line bg-bg px-1.5 py-1 text-sm"
            />
          </label>
          {res && !res.error && (
            <span className="tnum text-xs text-ink3">
              {fmtNum(res.n)} scored · {fmtNum(res.excludedIncomplete)} excluded (missing traits)
            </span>
          )}
          <span className="overline">features</span>
          {FEATURES.map((f) => (
            <label key={f.value} className={`flex items-center gap-1 text-sm ${features.includes(f.value) ? "text-ink" : "text-ink3"}`}>
              <input
                type="checkbox" className="accent-accent" checked={features.includes(f.value)}
                onChange={() => setFeatures(features.includes(f.value) ? features.filter((v) => v !== f.value) : [...features, f.value])}
                disabled={features.length === 3 && features.includes(f.value)}
              />
              {f.label}
            </label>
          ))}
        </div>
        {res && !res.error && <MethodNote>{res.methodNote}</MethodNote>}
      </Section>

      {loading || !res ? <Loading label="Scoring anomalies…" /> : res.error ? (
        <ErrorState message={res.error} />
      ) : (
        <Section title="Top anomalous trait profiles" aside={
          <button type="button" onClick={() => downloadJson("avian-anomalies.json", res)} className="rounded-sm border border-line px-2 py-1 text-xs text-ink2 hover:border-accent">
            export
          </button>
        }>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line-strong text-left">
                  <th className="overline px-2 py-1">Species</th>
                  <th className="overline px-2 py-1 text-right">Score</th>
                  <th className="overline px-2 py-1 text-right">Pct</th>
                  <th className="overline px-2 py-1">Top contributing traits (robust z)</th>
                  <th className="overline px-2 py-1">Triage</th>
                </tr>
              </thead>
              <tbody>
                {res.results!.map((r) => (
                  <tr key={r.id} className="cursor-pointer border-b border-line hover:bg-panel2" onClick={() => navigate(`/species/${r.id}`)}>
                    <td className="px-2 py-1.5">
                      <div className="font-medium text-ink">
                        {r.en}
                        {r.traitsInferred && <span className="ml-1 text-warn" title="traits imputed by AVONET">◈</span>}
                      </div>
                      <div className="tnum text-xs italic text-ink2">{r.sci} · {r.family}</div>
                    </td>
                    <td className="tnum px-2 py-1.5 text-right">{r.score.toFixed(3)}</td>
                    <td className="tnum px-2 py-1.5 text-right text-ink2">{r.percentile.toFixed(1)}</td>
                    <td className="px-2 py-1.5">
                      <span className="flex flex-wrap gap-1">
                        {r.contributing.map((c) => (
                          <span key={c.feature} className="tnum rounded-sm border border-line px-1.5 py-0.5 text-[11px] text-ink2">
                            {c.feature} {c.z > 0 ? "+" : ""}{c.z.toFixed(1)}σ
                          </span>
                        ))}
                      </span>
                    </td>
                    <td className="px-2 py-1.5">
                      <Pill tone={r.triage.startsWith("potential data") ? "warn" : r.triage.startsWith("possibly imputation") ? "default" : "accent"}>
                        {r.triage}
                      </Pill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <MethodNote>{res.note}</MethodNote>
          <div className="mt-2 flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: p.accent }} />
            <span className="text-xs text-ink3">score = method-specific anomaly score, 1 = most anomalous within the scored pool</span>
          </div>
        </Section>
      )}
    </div>
  );
}
