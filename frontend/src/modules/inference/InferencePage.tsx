/** Statistical Inference Lab — two-sample and k-sample tests with assumption
 *  diagnostics, effect sizes, bootstrap CIs, permutation tests, post-hoc
 *  comparisons with Holm correction, and explicit phylogenetic disclosure. */
import { useEffect, useState } from "react";
import { apiGet, apiPost, downloadJson } from "../../lib/api";
import { useMeta } from "../../hooks/useMeta";
import { FilterBar } from "../../components/FilterBar";
import { ErrorState, Loading, MethodNote, PageHeader, Pill, Section } from "../../components/ui";
import { fmtNum } from "../../lib/theme";
import { useApp } from "../../state/store";

const NUMERIC_VARS = [
  { value: "massG", label: "Body mass (g)" },
  { value: "wingMm", label: "Wing length (mm)" },
  { value: "tailMm", label: "Tail length (mm)" },
  { value: "tarsusMm", label: "Tarsus length (mm)" },
  { value: "beakCulmenMm", label: "Beak culmen (mm)" },
  { value: "beakWidthMm", label: "Bill width (mm)" },
  { value: "beakDepthMm", label: "Bill depth (mm)" },
  { value: "handWingIndex", label: "Hand-wing index" },
  { value: "bodyLengthMinCm", label: "Body length (cm)" },
];
const GROUP_VARS = [
  { value: "order", label: "Order" },
  { value: "family", label: "Family" },
  { value: "habitat", label: "Habitat" },
  { value: "migration", label: "Migration" },
  { value: "trophicLevel", label: "Trophic level" },
  { value: "trophicNiche", label: "Trophic niche" },
  { value: "lifestyle", label: "Lifestyle" },
  { value: "iucn", label: "IUCN category" },
];

interface TwoSampleResult {
  variable: string; groupVar: string; g1: string; g2: string; n1: number; n2: number; excluded: number;
  medians?: { g1: number; g2: number }; means?: { g1: number; g2: number };
  medianDiffCI95BootPercentile?: number[];
  diagnostics?: { shapiroG1: { W: number | null; p: number | null }; shapiroG2: { W: number | null; p: number | null }; levene: { statistic: number; p: number }; guidance: string };
  welch?: { t: number; p: number }; mannWhitney?: { U: number; p: number; rankBiserial: number };
  cohensD?: number; cohensDInterpretation?: string; permutation?: { n: number; p: number };
  error?: string; note?: string; phylogenyNote?: string;
}
interface KSampleResult {
  variable: string; groupVar: string; groups: { group: string; n: number; median: number; mean: number }[];
  n?: number; kruskal?: { H: number; p: number }; epsilonSquared?: number | null;
  posthoc?: { a: string; b: string; U: number; p: number; pHolm: number; rankBiserial: number }[] | null;
  posthocNote?: string; error?: string; note?: string; phylogenyNote?: string;
}

export default function InferencePage() {
  const meta = useMeta();
  const filters = useApp((s) => s.filters);

  // two-sample state
  const [variable, setVariable] = useState("handWingIndex");
  const [groupVar, setGroupVar] = useState("migration");
  const [groupValues, setGroupValues] = useState<string[]>([]);
  const [g1, setG1] = useState("migratory");
  const [g2, setG2] = useState("sedentary");
  const [two, setTwo] = useState<TwoSampleResult | null>(null);
  const [twoLoading, setTwoLoading] = useState(false);

  // k-sample state
  const [kVariable, setKVariable] = useState("handWingIndex");
  const [kGroupVar, setKGroupVar] = useState("migration");
  const [kRes, setKRes] = useState<KSampleResult | null>(null);
  const [kLoading, setKLoading] = useState(false);

  useEffect(() => {
    apiGet<{ facetOptions: Record<string, { value: string }[]> }>("/api/meta")
      .then((m) => setGroupValues((m.facetOptions[groupVar] ?? []).map((o) => o.value).filter((v) => v !== "(missing)")))
      .catch(() => undefined);
  }, [groupVar]);

  useEffect(() => {
    if (!g1 || !g2 || g1 === g2) return;
    setTwoLoading(true);
    apiPost<TwoSampleResult>("/api/inference/two-sample", { filters, variable, groupVar, g1, g2 })
      .then(setTwo)
      .catch((e) => setTwo({ error: e.message } as TwoSampleResult))
      .finally(() => setTwoLoading(false));
  }, [filters, variable, groupVar, g1, g2]);

  useEffect(() => {
    setKLoading(true);
    apiPost<KSampleResult>("/api/inference/k-sample", { filters, variable: kVariable, groupVar: kGroupVar, maxGroups: 6 })
      .then(setKRes)
      .catch((e) => setKRes({ error: e.message } as KSampleResult))
      .finally(() => setKLoading(false));
  }, [filters, kVariable, kGroupVar]);

  return (
    <div>
      <PageHeader
        title="Statistical Inference Lab"
        subtitle="Hypothesis tests with assumption diagnostics, effect sizes, bootstrap and permutation alternatives. Species are not independent observations — no phylogeny exists in this dataset, and every result says so."
      />

      <Section className="mb-4">
        <FilterBar meta={meta} />
      </Section>

      <Section title="Two-group comparison (Welch's t · Mann-Whitney U)" className="mb-4" aside={
        two && !two.error && (
          <button type="button" onClick={() => downloadJson("avian-inference-two-sample.json", two)} className="rounded-sm border border-line px-2 py-1 text-xs text-ink2 hover:border-accent">
            export result
          </button>
        )
      }>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <select value={variable} onChange={(e) => setVariable(e.target.value)} className="rounded-sm border border-line bg-bg px-2 py-1.5 text-sm">
            {NUMERIC_VARS.map((v) => <option key={v.value} value={v.value}>variable: {v.label}</option>)}
          </select>
          <select value={groupVar} onChange={(e) => { setGroupVar(e.target.value); setG1(""); setG2(""); }} className="rounded-sm border border-line bg-bg px-2 py-1.5 text-sm">
            {GROUP_VARS.map((v) => <option key={v.value} value={v.value}>grouped by: {v.label}</option>)}
          </select>
          <select value={g1} onChange={(e) => setG1(e.target.value)} className="rounded-sm border border-line bg-bg px-2 py-1.5 text-sm">
            <option value="">group A…</option>
            {groupValues.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <span className="text-ink3">vs</span>
          <select value={g2} onChange={(e) => setG2(e.target.value)} className="rounded-sm border border-line bg-bg px-2 py-1.5 text-sm">
            <option value="">group B…</option>
            {groupValues.filter((v) => v !== g1).map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>

        {twoLoading || !two ? <Loading label="Running tests…" /> : two.error ? (
          <ErrorState message={two.error} />
        ) : (
          <>
            <div className="mb-3 flex flex-wrap gap-2">
              <Pill tone="accent">n(A) = {fmtNum(two.n1)} · n(B) = {fmtNum(two.n2)}</Pill>
              <Pill>Mann-Whitney p = {two.mannWhitney!.p.toExponential(2)}</Pill>
              <Pill tone="accent">rank-biserial r = {two.mannWhitney!.rankBiserial.toFixed(3)}</Pill>
              <Pill>Cohen's d = {two.cohensD!.toFixed(3)} ({two.cohensDInterpretation})</Pill>
              <Pill>permutation p = {two.permutation!.p.toFixed(4)} ({fmtNum(two.permutation!.n)} shuffles)</Pill>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
              <div><span className="overline block">median A / B</span><span className="tnum">{fmtNum(two.medians!.g1, 2)} / {fmtNum(two.medians!.g2, 2)}</span></div>
              <div><span className="overline block">median diff (95% boot CI)</span><span className="tnum">{(two.medians!.g1 - two.medians!.g2).toFixed(3)} [{two.medianDiffCI95BootPercentile!.map((v) => v.toFixed(2)).join(", ")}]</span></div>
              <div><span className="overline block">Welch t</span><span className="tnum">{two.welch!.t.toFixed(2)} (p = {two.welch!.p.toExponential(2)})</span></div>
              <div><span className="overline block">Shapiro p (A / B)</span><span className="tnum">{two.diagnostics!.shapiroG1.p?.toExponential(1) ?? "—"} / {two.diagnostics!.shapiroG2.p?.toExponential(1) ?? "—"}</span></div>
            </div>
            <MethodNote>{two.diagnostics!.guidance}</MethodNote>
            <MethodNote>{two.note}</MethodNote>
            <MethodNote>{two.phylogenyNote}</MethodNote>
          </>
        )}
      </Section>

      <Section title="Many-group comparison (Kruskal-Wallis + Holm post-hoc)" aside={
        kRes && !kRes.error && (
          <button type="button" onClick={() => downloadJson("avian-inference-k-sample.json", kRes)} className="rounded-sm border border-line px-2 py-1 text-xs text-ink2 hover:border-accent">
            export result
          </button>
        )
      }>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <select value={kVariable} onChange={(e) => setKVariable(e.target.value)} className="rounded-sm border border-line bg-bg px-2 py-1.5 text-sm">
            {NUMERIC_VARS.map((v) => <option key={v.value} value={v.value}>variable: {v.label}</option>)}
          </select>
          <select value={kGroupVar} onChange={(e) => setKGroupVar(e.target.value)} className="rounded-sm border border-line bg-bg px-2 py-1.5 text-sm">
            {GROUP_VARS.map((v) => <option key={v.value} value={v.value}>grouped by: {v.label}</option>)}
          </select>
          {kRes && !kRes.error && <span className="tnum text-xs text-ink3">n = {fmtNum(kRes.n ?? 0)}</span>}
        </div>
        {kLoading || !kRes ? <Loading label="Running Kruskal-Wallis…" /> : kRes.error ? (
          <ErrorState message={kRes.error} />
        ) : (
          <>
            <div className="mb-3 flex flex-wrap gap-2">
              <Pill tone="accent">H = {kRes.kruskal!.H.toFixed(1)} · p = {kRes.kruskal!.p.toExponential(2)}</Pill>
              <Pill>ε² = {kRes.epsilonSquared?.toFixed(3) ?? "—"}</Pill>
              <Pill>{kRes.groups.length} groups</Pill>
            </div>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-line"><th className="overline px-2 py-1">Group</th><th className="overline px-2 py-1 text-right">n</th><th className="overline px-2 py-1 text-right">Median</th><th className="overline px-2 py-1 text-right">Mean</th></tr></thead>
                <tbody>
                  {kRes.groups.map((g) => (
                    <tr key={g.group} className="border-b border-line">
                      <td className="px-2 py-1">{g.group}</td>
                      <td className="tnum px-2 py-1 text-right">{fmtNum(g.n)}</td>
                      <td className="tnum px-2 py-1 text-right">{fmtNum(g.median, 3)}</td>
                      <td className="tnum px-2 py-1 text-right text-ink2">{fmtNum(g.mean, 3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {kRes.posthoc && (
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-line"><th className="overline px-2 py-1">Pair</th><th className="overline px-2 py-1 text-right">p</th><th className="overline px-2 py-1 text-right">p (Holm)</th><th className="overline px-2 py-1 text-right">r</th></tr></thead>
                  <tbody>
                    {kRes.posthoc.map((row) => (
                      <tr key={`${row.a}-${row.b}`} className="border-b border-line">
                        <td className="px-2 py-1">{row.a} vs {row.b}</td>
                        <td className="tnum px-2 py-1 text-right">{row.p.toExponential(1)}</td>
                        <td className="tnum px-2 py-1 text-right">{row.pHolm.toExponential(1)}</td>
                        <td className="tnum px-2 py-1 text-right text-ink2">{row.rankBiserial.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <MethodNote>{kRes.note}</MethodNote>
            <MethodNote>{kRes.phylogenyNote}</MethodNote>
          </>
        )}
      </Section>
    </div>
  );
}
