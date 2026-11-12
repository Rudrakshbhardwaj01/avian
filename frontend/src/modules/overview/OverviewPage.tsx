/** Module 1 — Overview: dataset scale, distributions, coverage, and
 *  data-driven questions worth exploring. */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import type { Data } from "plotly.js-dist-min";
import { apiGet } from "../../lib/api";
import { Loading, MethodNote, PageHeader, Section, StatTile } from "../../components/ui";
import { Plot, baseLayout } from "../../components/Plot";
import { palette, fmtNum, iucnColor, REGION_LABELS } from "../../lib/theme";
import { useApp } from "../../state/store";

interface Overview {
  meta: { version: string; taxonomy: string; declaredCount: number; actualCount: number; countMatches: boolean };
  stats: Record<string, number>;
  distributions: Record<string, { value: string | null; label?: string | null; count: number }[]>;
  coverage: { label: string; n: number; pct: number }[];
  questions: { text: string; module: string; link: string }[];
}

export default function OverviewPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dark = useApp((s) => s.theme === "dark");
  const navigate = useNavigate();

  useEffect(() => {
    apiGet<Overview>("/api/overview").then(setData).catch((e) => setError(String(e.message ?? e)));
  }, []);

  if (error) return <div className="text-sm text-danger">{error}</div>;
  if (!data) return <Loading label="Loading dataset overview…" />;

  const p = palette(dark);
  const s = data.stats;

  const barData = (dist: { value: string | null; label?: string | null; count: number }[], labelFn?: (v: { value: string | null; label?: string | null }) => string, maxCount?: number): Data[] => {
    const items = maxCount ? dist.slice(0, maxCount) : dist;
    return [
      {
        type: "bar",
        orientation: "h",
        x: items.map((d) => d.count),
        y: items.map((d) => labelFn?.(d) ?? d.value ?? "(missing)"),
        marker: { color: p.accent },
        hovertemplate: "%{y}: %{x:,}<extra></extra>",
      },
    ];
  };

  const iucnTrace: Data[] = [
    {
      type: "bar",
      x: data.distributions.iucn.map((d) => d.value ?? "(missing)"),
      y: data.distributions.iucn.map((d) => d.count),
      marker: { color: data.distributions.iucn.map((d) => iucnColor(d.value, dark)) },
      hovertemplate: "%{x}: %{y:,}<extra></extra>",
    },
  ];

  const clickToExplorer = (filterPatch: Record<string, string | string[]>) => {
    useApp.getState().setFilter(filterPatch);
    navigate("/explorer");
  };

  return (
    <div>
      <PageHeader
        title="Overview"
        subtitle="A local-first laboratory for exploring the World Bird Species dataset. Every number on this page is computed from the local dataset — nothing is hardcoded."
      >
        <span className="tnum rounded-sm border border-line bg-panel px-2.5 py-1.5 text-xs text-ink2">
          {data.meta.taxonomy} · v{data.meta.version} · {fmtNum(data.meta.actualCount)} species
          {data.meta.countMatches ? "" : " (count mismatch!)"}
        </span>
      </PageHeader>

      {/* headline stats */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Species" value={fmtNum(s.species)} sub={data.meta.countMatches ? "matches declared count" : "declared count mismatch"} />
        <StatTile label="Orders" value={fmtNum(s.orders)} />
        <StatTile label="Families" value={fmtNum(s.families)} />
        <StatTile label="Genera" value={fmtNum(s.genera)} />
        <StatTile label="With traits" value={fmtNum(s.withTraits)} sub={`${((100 * s.withTraits) / s.species).toFixed(1)}% of dataset`} />
        <StatTile label="With IUCN" value={fmtNum(s.withIucn)} sub={`${((100 * s.withIucn) / s.species).toFixed(1)}% assessed`} />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* species by order */}
        <Section title="Species by order (all 45)">
          <Plot
            height={520}
            data={barData(data.distributions.orders)}
            layout={{
              ...baseLayout(dark),
              margin: { l: 150, r: 20, t: 10, b: 40 },
              yaxis: { ...baseLayout(dark).yaxis, automargin: true, tickfont: { size: 11 } },
              xaxis: { title: { text: "species" } },
            }}
            onClick={(ev) => {
              const label = (ev as { points?: { y?: string }[] }).points?.[0]?.y;
              if (label) clickToExplorer({ orders: [label] });
            }}
          />
          <MethodNote>Click an order to inspect its species in the Explorer. Taxonomic richness ≠ abundance: counts are species, not observations.</MethodNote>
        </Section>

        {/* IUCN */}
        <Section title="IUCN Red List category (as given in AviList)">
          <Plot
            height={300}
            data={iucnTrace}
            layout={{
              ...baseLayout(dark),
              margin: { l: 50, r: 20, t: 10, b: 80 },
              xaxis: { tickangle: -35, tickfont: { size: 10.5 } },
              yaxis: { title: { text: "species" } },
            }}
            onClick={(ev) => {
              const label = (ev as { points?: { x?: string }[] }).points?.[0]?.x;
              if (label && label !== "(missing)") clickToExplorer({ iucn: [label] });
            }}
          />
          <MethodNote>
            Categories come from BirdLife v10 as delivered in AviList; 871 species have no category in this compilation — absence is not “Least Concern”. Color is the only mapping applied; values are untouched.
          </MethodNote>

          {/* coverage */}
          <div className="mt-4 border-t border-line pt-3">
            <div className="overline mb-2">Analytical coverage by domain</div>
            <div className="space-y-1.5">
              {data.coverage.map((c) => (
                <div key={c.label} className="flex items-center gap-2 text-xs">
                  <span className="w-40 shrink-0 text-ink2">{c.label}</span>
                  <div className="h-2 flex-1 rounded-sm bg-panel2">
                    <div className="h-2 rounded-sm" style={{ width: `${c.pct}%`, background: p.accent }} />
                  </div>
                  <span className="tnum w-24 text-right text-ink">{fmtNum(c.n)} · {c.pct.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        </Section>

        {/* habitat */}
        <Section title="Primary habitat (AVONET)">
          <Plot
            height={280}
            data={barData(data.distributions.habitat)}
            layout={{
              ...baseLayout(dark),
              margin: { l: 130, r: 20, t: 10, b: 40 },
              yaxis: { tickfont: { size: 11 } },
              xaxis: { title: { text: "species" } },
            }}
            onClick={(ev) => {
              const label = (ev as { points?: { y?: string }[] }).points?.[0]?.y;
              if (label && label !== "(missing)") clickToExplorer({ habitat: [label] });
            }}
          />
        </Section>

        {/* migration */}
        <Section title="Migration category">
          <Plot
            height={280}
            data={barData(data.distributions.migration)}
            layout={{
              ...baseLayout(dark),
              margin: { l: 140, r: 20, t: 10, b: 40 },
              yaxis: { tickfont: { size: 11 } },
              xaxis: { title: { text: "species" } },
            }}
            onClick={(ev) => {
              const label = (ev as { points?: { y?: string }[] }).points?.[0]?.y;
              if (label && label !== "(missing)") clickToExplorer({ migration: [label] });
            }}
          />
        </Section>

        {/* top families */}
        <Section title="Top 15 families by species richness">
          <Plot
            height={420}
            data={barData(data.distributions.families, (d) => `${d.value} — ${d.label ?? ""}`)}
            layout={{
              ...baseLayout(dark),
              margin: { l: 230, r: 20, t: 10, b: 40 },
              yaxis: { tickfont: { size: 10.5 } },
              xaxis: { title: { text: "species" } },
            }}
            onClick={(ev) => {
              const label = (ev as { points?: { y?: string }[] }).points?.[0]?.y;
              const fam = label?.split(" — ")[0];
              if (fam) clickToExplorer({ families: [fam] });
            }}
          />
        </Section>

        {/* regions */}
        <Section title="IOC breeding regions (component counts)">
          <Plot
            height={380}
            data={[
              {
                type: "bar",
                orientation: "h",
                x: data.distributions.regions.map((d) => d.count),
                y: data.distributions.regions.map((d) => (d.value ? REGION_LABELS[d.value] ?? d.value : "(missing)")),
                marker: { color: p.info },
                hovertemplate: "%{y}: %{x:,} species<br>(multi-region species count once per region)<extra></extra>",
              },
            ]}
            layout={{
              ...baseLayout(dark),
              margin: { l: 150, r: 20, t: 10, b: 40 },
              yaxis: { tickfont: { size: 11 } },
              xaxis: { title: { text: "species referencing region" } },
            }}
            onClick={(ev) => {
              const label = (ev as { points?: { y?: string }[] }).points?.[0]?.y;
              const code = Object.entries(REGION_LABELS).find(([, v]) => v === label)?.[0];
              if (code) clickToExplorer({ breedingRegion: [code] });
            }}
          />
          <MethodNote>Derived from IOC breeding-region codes; a species spanning “MA, SA” counts in both. These are breeding ranges, not full distributions, and not range polygons — the source has no geometry.</MethodNote>
        </Section>
      </div>

      {/* questions worth exploring */}
      <Section title="Questions worth exploring">
        <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {data.questions.map((q) => (
            <li key={q.link}>
              <button
                type="button"
                onClick={() => navigate(q.link)}
                className="w-full rounded-sm border border-line bg-panel2 px-3 py-2.5 text-left text-sm leading-relaxed text-ink transition-colors hover:border-accent hover:bg-accent-soft"
              >
                <span className="display mr-2 text-accent" aria-hidden>
                  Q
                </span>
                {q.text}
                <span className="ml-2 text-xs text-ink3">→ {q.module}</span>
              </button>
            </li>
          ))}
        </ul>
        <MethodNote>
          These prompts are computed from the dataset (e.g. variance and coverage rankings) and framed as questions, not findings. Open one to continue the investigation in the relevant lab.
        </MethodNote>
      </Section>
    </div>
  );
}
