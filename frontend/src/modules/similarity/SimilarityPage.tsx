/** Species Similarity Engine — morphological neighbors under selectable
 *  distances, with per-trait differences and side-by-side comparison. */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import type { Data } from "plotly.js-dist-min";
import { apiGet, apiPost, downloadJson } from "../../lib/api";
import { useMeta } from "../../hooks/useMeta";
import { useDebounce } from "../../hooks/useDebounce";
import { FilterBar } from "../../components/FilterBar";
import { EmptyState, ErrorState, IucnBadge, Loading, MethodNote, PageHeader, Section } from "../../components/ui";
import { Plot, baseLayout } from "../../components/Plot";
import { fmtNum, palette } from "../../lib/theme";
import { useApp } from "../../state/store";
import { blankNote, loadNotes, reproMetadata, saveNote } from "../../lib/notebook";

const FEATURES = [
  { value: "massG", label: "mass (g)" },
  { value: "wingMm", label: "wing (mm)" },
  { value: "tailMm", label: "tail (mm)" },
  { value: "tarsusMm", label: "tarsus (mm)" },
  { value: "beakCulmenMm", label: "culmen (mm)" },
  { value: "beakWidthMm", label: "bill width (mm)" },
  { value: "beakDepthMm", label: "bill depth (mm)" },
  { value: "handWingIndex", label: "hand-wing idx" },
];
const METRICS = [
  { value: "euclidean", label: "Standardized Euclidean" },
  { value: "manhattan", label: "Manhattan" },
  { value: "cosine", label: "Cosine similarity" },
  { value: "mahalanobis", label: "Mahalanobis (shrunk covariance)" },
];

interface Neighbor {
  id: string; en: string; sci: string; order: string; family: string;
  iucn: string | null; distance: number; traitsInferred: boolean;
  traitDiffs: { feature: string; self: number; other: number; zDiff: number }[];
}
interface SimilarityResponse {
  species?: { id: string; en: string; sci: string; order: string; family: string; iucn: string | null; values: Record<string, number> };
  metric: string; features: string[]; poolN: number; excludedIncomplete: number;
  neighbors?: Neighbor[]; error?: string; note: string; mahalanobisNote?: string | null;
}

export default function SimilarityPage() {
  const meta = useMeta();
  const dark = useApp((s) => s.theme === "dark");
  const p = palette(dark);
  const navigate = useNavigate();
  const filters = useApp((s) => s.filters);
  const [params] = useSearchParams();

  const [query, setQuery] = useState("");
  const debounced = useDebounce(query, 250);
  const [selected, setSelected] = useState<string | null>(params.get("species"));
  const [features, setFeatures] = useState<string[]>(FEATURES.map((f) => f.value));
  const [metric, setMetric] = useState("euclidean");
  const [scope, setScope] = useState("all");
  const [res, setRes] = useState<SimilarityResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<{ id: string; en: string | null; sci: string }[]>([]);

  useEffect(() => {
    const q = debounced.trim();
    if (!q) { setCandidates([]); return; }
    apiGet<{ species: { id: string; en: string | null; sci: string }[] }>("/api/search", { q })
      .then((r) => setCandidates(r.species.slice(0, 6)))
      .catch(() => undefined);
  }, [debounced]);

  useEffect(() => {
    if (!selected) { setRes(null); return; }
    setLoading(true);
    apiPost<SimilarityResponse>("/api/similarity/neighbors", { filters, speciesId: selected, features, metric, k: 12, scope })
      .then(setRes)
      .catch((e) => setRes({ error: e.message, note: "" } as SimilarityResponse))
      .finally(() => setLoading(false));
  }, [filters, selected, features, metric, scope]);

  const compareChart: Data[] = useMemo(() => {
    if (!res?.species || !res.neighbors?.length) return [];
    const top = res.neighbors.slice(0, 5);
    const labels = [res.species.sci, ...top.map((n) => n.sci)];
    return FEATURES.filter((f) => features.includes(f.value)).map((f) => ({
      type: "bar",
      name: f.label,
      y: labels,
      x: [res.species!.values[f.value] ?? 0, ...top.map((n) => {
        const d = n.traitDiffs.find((t) => t.feature === f.value);
        return d ? d.other : 0;
      })],
      orientation: "h",
      marker: { color: p.accent },
      hovertemplate: "%{y}: %{x:.3g}<extra></extra>",
    }));
  }, [res, p, features]);

  return (
    <div>
      <PageHeader
        title="Species Similarity Engine"
        subtitle="Find species with similar observed morphology. Distance is computed on standardized trait values — similarity of shape and size, not evolutionary relatedness."
      />

      <Section className="mb-4">
        <FilterBar meta={meta} />
      </Section>

      <Section title="1 · Choose a species" className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="English name or scientific name…"
            className="w-96 max-w-full rounded-sm border border-line bg-bg px-3 py-1.5 text-sm outline-none focus:border-accent"
          />
          {selected && res?.species && (
            <span className="text-sm text-ink2">
              → <span className="font-medium text-ink">{res.species.en}</span> <span className="tnum italic text-xs">{res.species.sci}</span>
            </span>
          )}
          {selected && (
            <button type="button" onClick={() => setSelected(null)} className="text-xs text-danger hover:underline">clear</button>
          )}
        </div>
        {candidates.length > 0 && !res?.species && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {candidates.map((c) => (
              <button key={c.id} type="button" onClick={() => { setSelected(c.id); setCandidates([]); setQuery(""); }} className="rounded-sm border border-line bg-panel2 px-2 py-1 text-sm text-ink hover:border-accent">
                {c.en ?? c.sci} <span className="tnum text-xs italic text-ink2">{c.sci}</span>
              </button>
            ))}
          </div>
        )}
      </Section>

      {selected && (
        <Section title="2 · Configure the comparison" className="mb-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <select value={metric} onChange={(e) => setMetric(e.target.value)} className="rounded-sm border border-line bg-bg px-2 py-1.5 text-sm">
              {METRICS.map((m) => <option key={m.value} value={m.value}>distance: {m.label}</option>)}
            </select>
            <select value={scope} onChange={(e) => setScope(e.target.value)} className="rounded-sm border border-line bg-bg px-2 py-1.5 text-sm">
              <option value="all">scope: whole dataset</option>
              <option value="filters">scope: current filters</option>
            </select>
            <span className="overline">traits</span>
            {FEATURES.map((f) => (
              <label key={f.value} className={`flex items-center gap-1 text-sm ${features.includes(f.value) ? "text-ink" : "text-ink3"}`}>
                <input
                  type="checkbox"
                  className="accent-accent"
                  checked={features.includes(f.value)}
                  onChange={() => setFeatures(features.includes(f.value) ? features.filter((v) => v !== f.value) : [...features, f.value])}
                  disabled={features.length === 2 && features.includes(f.value)}
                />
                {f.label}
              </label>
            ))}
          </div>
        </Section>
      )}

      {selected && (loading ? <Loading label="Computing distances…" /> : res?.error ? <ErrorState message={res.error} /> : res?.species && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Section title={`3 · Nearest morphological neighbors (n = ${fmtNum(res.poolN)} pool${res.excludedIncomplete ? `, ${fmtNum(res.excludedIncomplete)} excluded for missing traits` : ""})`} aside={
            <button
              type="button"
              onClick={() => {
                const sp = res.species!;
                const note = blankNote();
                saveNote(
                  {
                    ...note,
                    kind: "experiment",
                    title: `Similarity: neighbors of ${sp.en}`,
                    method: `${res.metric} distance over ${res.features.length} standardized traits · pool n=${fmtNum(res.poolN)}`,
                    result: res.neighbors!.slice(0, 5).map((n) => `${n.en} (${n.distance.toFixed(3)})`).join(", "),
                    speciesRefs: [sp.id, ...res.neighbors!.slice(0, 5).map((n) => n.id)],
                    reproducibility: reproMetadata({ metric: res.metric, features: res.features, species: sp.id }),
                  },
                  loadNotes(),
                );
              }}
              className="rounded-sm border border-line px-2 py-1 text-xs text-ink2 hover:border-accent"
            >
              save to notebook
            </button>
          }>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  <th className="overline px-2 py-1">Species</th>
                  <th className="overline px-2 py-1 text-right">Distance</th>
                  <th className="overline px-2 py-1">IUCN</th>
                </tr>
              </thead>
              <tbody>
                {res.neighbors!.map((n) => (
                  <tr key={n.id} className="cursor-pointer border-b border-line hover:bg-panel2" onClick={() => navigate(`/species/${n.id}`)}>
                    <td className="px-2 py-1.5">
                      <div className="font-medium text-ink">{n.en}</div>
                      <div className="tnum text-xs italic text-ink2">{n.sci} · {n.family}</div>
                    </td>
                    <td className="tnum px-2 py-1.5 text-right">{n.distance.toFixed(3)}</td>
                    <td className="px-2 py-1.5"><IucnBadge category={n.iucn} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <MethodNote>{res.note}</MethodNote>
            {res.mahalanobisNote && <MethodNote>{res.mahalanobisNote}</MethodNote>}
          </Section>

          <Section title="4 · Side-by-side morphology" aside={
            <button type="button" onClick={() => downloadJson("avian-similarity.json", res)} className="rounded-sm border border-line px-2 py-1 text-xs text-ink2 hover:border-accent">
              export
            </button>
          }>
            <Plot
              height={280}
              data={compareChart}
              layout={{
                ...baseLayout(dark),
                barmode: "group",
                margin: { l: 130, r: 20, t: 10, b: 30 },
                yaxis: { automargin: true, tickfont: { size: 10 } },
              }}
            />
            <MethodNote>
              Bars compare the target species with its 5 nearest neighbors on each selected trait (raw units). The table ranks per-trait z-differences.
            </MethodNote>
            <table className="mt-2 w-full text-xs">
              <thead>
                <tr className="border-b border-line text-left">
                  <th className="overline px-2 py-1">Neighbor</th>
                  <th className="overline px-2 py-1">Largest trait differences (z)</th>
                </tr>
              </thead>
              <tbody>
                {res.neighbors!.slice(0, 6).map((n) => (
                  <tr key={n.id} className="border-b border-line">
                    <td className="px-2 py-1">{n.en}</td>
                    <td className="px-2 py-1 text-ink2">
                      {n.traitDiffs.slice(0, 3).map((t) => `${FEATURES.find((f) => f.value === t.feature)?.label} (Δz ${t.zDiff.toFixed(2)})`).join(" · ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        </div>
      ))}

      {!selected && <EmptyState title="Search for a species above" hint="Try “Somali Ostrich”, “Kestrel”, or any scientific name." />}
    </div>
  );
}
