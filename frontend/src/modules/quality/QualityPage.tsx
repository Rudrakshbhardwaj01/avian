/** Module 10 — Data Quality Lab: makes the dataset's limitations visible.
 *  Renders the backend validation report plus interactive missingness slices. */
import { useEffect, useState } from "react";
import type { Data } from "plotly.js-dist-min";
import { apiGet } from "../../lib/api";
import { ErrorState, Loading, MethodNote, PageHeader, Pill, Section, StatTile } from "../../components/ui";
import { Plot, baseLayout } from "../../components/Plot";
import { fmtNum, palette } from "../../lib/theme";
import { useApp } from "../../state/store";

interface Report {
  meta: { version: string; taxonomy: string; declaredCount: number; actualCount: number; countMatches: boolean };
  recordCount: number;
  duplicates: { ids: string[]; scientificNames: string[]; taxonomicSeq: string[] };
  missingness: { field: string; domain: string; nMissing: number; nPresent: number; missingPct: number }[];
  categorical: { field: string; label: string; domain: string; nDistinct: number; nMissing: number; values: { value: string; count: number; pct: number }[] }[];
  numeric: Record<string, number | string | null>[];
  suspicious: { field: string; rule: string; policy: string; count: number; examples: { id: string; sci: string; en: string | null; value: number }[] }[];
  coverage: { domain: string; fields: string; n: number; pct: number }[];
  subspecies: Record<string, unknown>;
  names: { languageCount: number; languages: { code: string; n: number; pct: number }[]; medianLanguagesPerSpecies: number; speciesWithoutEnglish: number; speciesWithoutChinese: number; minLanguagesPerSpecies: number };
  taxonConcept: { values: Record<string, number>; withDataNotes: number };
  noTraitsByConcept: Record<string, number>;
  iucnOrder: string[];
  concerns: string[];
}

interface MissingBy { by: string; fields: string[]; rows: Array<Record<string, string | number>> }

const DOMAIN_COLORS: Record<string, string> = {
  identity: "#44684d", names: "#7c8b46", traits: "#2f6f74", conservation: "#b08d3e",
  geography: "#a8552f", identifiers: "#5a7ba2", size: "#8a6ea0",
};

export default function QualityPage() {
  const dark = useApp((s) => s.theme === "dark");
  const p = palette(dark);
  const [report, setReport] = useState<Report | null>(null);
  const [reportError, setReportError] = useState(false);
  const [missingBy, setMissingBy] = useState<MissingBy | null>(null);
  const [byVar, setByVar] = useState("order");

  useEffect(() => {
    apiGet<Report>("/api/quality/report").then(setReport).catch(() => setReportError(true));
  }, []);

  useEffect(() => {
    apiGet<MissingBy>("/api/quality/missingness-by", { by: byVar, limit: 15 }).then(setMissingBy).catch(() => undefined);
  }, [byVar]);

  if (reportError) return <ErrorState message="The validation report could not be built by the backend. Check that the dataset loaded correctly, then reload." />;
  if (!report) return <Loading label="Building validation report…" />;

  const missSorted = [...report.missingness].sort((a, b) => a.missingPct - b.missingPct);
  const missingnessBar: Data[] = [
    {
      type: "bar",
      orientation: "h",
      x: missSorted.map((m) => 100 - m.missingPct),
      y: missSorted.map((m) => m.field),
      marker: { color: missSorted.map((m) => DOMAIN_COLORS[m.domain] ?? p.accent) },
      hovertemplate: "%{y}: %{x:.1f}% present (%{customdata:.1f}% missing)<extra></extra>",
      customdata: missSorted.map((m) => m.missingPct),
    },
  ];

  const missingByHeat: Data[] = missingBy ? [
    {
      type: "heatmap",
      z: missingBy.rows.map((r) => missingBy.fields.map((f) => Number(r[f] ?? 0))),
      x: missingBy.fields,
      y: missingBy.rows.map((r) => String(r["by"])),
      colorscale: [[0, p.paper], [1, p.accent]],
      texttemplate: "%{z:.0f}",
      hovertemplate: "%{y} · %{x}: %{z:.0f}% coverage<extra></extra>",
      colorbar: { title: { text: "% covered" }, thickness: 12 },
    },
  ] : [];

  return (
    <div>
      <PageHeader
        title="Data Quality Lab"
        subtitle="What this dataset does and does not contain. The exploration is only as trustworthy as these limitations are visible."
      >
        <Pill tone="accent">validated locally at startup</Pill>
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Records" value={fmtNum(report.recordCount)} sub={report.meta.countMatches ? "matches declared count" : "MISMATCH"} />
        <StatTile label="Duplicate IDs" value={fmtNum(report.duplicates.ids.length)} sub="none expected" />
        <StatTile label="Duplicate names" value={fmtNum(report.duplicates.scientificNames.length)} sub="none expected" />
        <StatTile label="Languages" value={fmtNum(report.names.languageCount)} sub={`median ${report.names.medianLanguagesPerSpecies}/species`} />
        <StatTile label="Subspecies entries" value={fmtNum(Number(report.subspecies.totalEntries ?? 0))} sub={`across ${fmtNum(Number(report.subspecies.speciesWithSubspecies ?? 0))} species`} />
        <StatTile label="Concept changes" value={fmtNum(Object.entries(report.taxonConcept.values).filter(([k]) => k !== "same").reduce((a, [, v]) => a + v, 0))} sub="broadened/split/new/narrowed" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Section title="Field coverage (present %, one bar per analytical field)">
          <Plot
            height={620}
            data={missingnessBar}
            layout={{ ...baseLayout(dark), margin: { l: 130, r: 20, t: 10, b: 40 }, yaxis: { tickfont: { size: 10.5 } }, xaxis: { range: [0, 100], title: { text: "% present" }, ticksuffix: "%" } }}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {Object.entries(DOMAIN_COLORS).map(([domain, color]) => (
              <span key={domain} className="flex items-center gap-1 text-xs text-ink2">
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color }} /> {domain}
              </span>
            ))}
          </div>
        </Section>

        <div className="flex flex-col gap-4">
          <Section title={`Coverage by ${byVar}`} aside={
            <select value={byVar} onChange={(e) => setByVar(e.target.value)} className="rounded-sm border border-line bg-bg px-2 py-1 text-sm">
              <option value="order">order</option>
              <option value="family">family</option>
              <option value="habitat">habitat</option>
              <option value="migration">migration</option>
            </select>
          }>
            {missingBy ? (
              <Plot height={400} data={missingByHeat} layout={{ ...baseLayout(dark), margin: { l: 110, r: 30, t: 10, b: 60 } }} />
            ) : <Loading />}
            <MethodNote>Cell = share of species in that group with the field present. Gaps here are where analyses will be biased.</MethodNote>
          </Section>

          <Section title="Known data-quality concerns">
            <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-ink2">
              {report.concerns.map((c, i) => <li key={i}>{c}</li>)}
            </ul>
          </Section>
        </div>

        <Section title="Suspicious values (flagged, never silently removed)">
          {report.suspicious.map((s) => (
            <div key={s.field} className="mb-3 border-b border-line pb-3 last:mb-0 last:border-0 last:pb-0">
              <div className="flex items-center gap-2">
                <Pill tone="warn">{s.field}: {fmtNum(s.count)} flagged</Pill>
                <span className="text-xs text-ink3">{s.rule}</span>
              </div>
              <div className="mt-1 text-xs text-ink2"><span className="overline">policy</span> {s.policy}</div>
              {s.examples.length > 0 && (
                <div className="mt-1 text-xs text-ink3">
                  e.g. {s.examples.slice(0, 8).map((e) => `${e.sci} (${e.value})`).join(", ")}
                </div>
              )}
            </div>
          ))}
        </Section>

        <Section title="Numeric field profiles">
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line-strong text-left">
                  <th className="overline px-2 py-1">Field</th><th className="overline px-2 py-1 text-right">n</th><th className="overline px-2 py-1 text-right">min</th>
                  <th className="overline px-2 py-1 text-right">median</th><th className="overline px-2 py-1 text-right">max</th><th className="overline px-2 py-1 text-right">mean</th><th className="overline px-2 py-1 text-right">zeros</th>
                </tr>
              </thead>
              <tbody>
                {report.numeric.map((n) => (
                  <tr key={String(n.field)} className="border-b border-line">
                    <td className="px-2 py-1">{String(n.label)}</td>
                    <td className="tnum px-2 py-1 text-right">{fmtNum(Number(n.nValid))}</td>
                    <td className="tnum px-2 py-1 text-right text-ink2">{Number(n.min).toLocaleString("en-US", { maximumFractionDigits: 2 })}</td>
                    <td className="tnum px-2 py-1 text-right">{Number(n.median).toLocaleString("en-US", { maximumFractionDigits: 2 })}</td>
                    <td className="tnum px-2 py-1 text-right text-ink2">{Number(n.max).toLocaleString("en-US", { maximumFractionDigits: 1 })}</td>
                    <td className="tnum px-2 py-1 text-right text-ink2">{Number(n.mean).toLocaleString("en-US", { maximumFractionDigits: 2 })}</td>
                    <td className="tnum px-2 py-1 text-right">{Number(n.nZero) ? <span className="text-warn">{Number(n.nZero)}</span> : 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="Categorical fields — distinct values">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {report.categorical.map((c) => (
              <div key={c.field} className="rounded-sm border border-line p-2">
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-ink">{c.label}</span>
                  <span className="tnum text-xs text-ink3">{fmtNum(c.nDistinct)} values{c.nMissing ? ` · ${fmtNum(c.nMissing)} missing` : ""}</span>
                </div>
                <div className="mt-1 text-xs text-ink2">
                  {c.values.slice(0, 6).map((v) => `${v.value} (${fmtNum(v.count)})`).join(" · ")}
                  {c.values.length > 6 ? ` … +${c.values.length - 6} more` : ""}
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Trait absence by taxon-concept change">
          <p className="mb-2 text-sm text-ink2">
            Species whose AviList boundaries changed deliberately lack traits — the source left them empty rather than attach numbers describing a different set of birds.
          </p>
          <ul className="text-sm text-ink2">
            {Object.entries(report.noTraitsByConcept).map(([k, v]) => (
              <li key={k} className="flex justify-between border-b border-line py-1">
                <span className="capitalize">{k}</span>
                <span className="tnum">{fmtNum(v)}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Duplicates & consistency checks">
          <ul className="text-sm text-ink2">
            <li className="py-1">Duplicate species IDs: <span className="tnum text-ink">{report.duplicates.ids.length === 0 ? "none ✓" : report.duplicates.ids.join(", ")}</span></li>
            <li className="py-1">Duplicate scientific names: <span className="tnum text-ink">{report.duplicates.scientificNames.length === 0 ? "none ✓" : report.duplicates.scientificNames.join(", ")}</span></li>
            <li className="py-1">Duplicate taxonomic sequences: <span className="tnum text-ink">{report.duplicates.taxonomicSeq.length === 0 ? "none ✓" : report.duplicates.taxonomicSeq.join(", ")}</span></li>
            <li className="py-1">Species without an English name: <span className="tnum text-ink">{fmtNum(report.names.speciesWithoutEnglish)}</span></li>
            <li className="py-1">Species without a Chinese name: <span className="tnum text-ink">{fmtNum(report.names.speciesWithoutChinese)}</span></li>
            <li className="py-1">Species with dataNotes (dropped-data explanations): <span className="tnum text-ink">{fmtNum(report.taxonConcept.withDataNotes)}</span></li>
          </ul>
          <MethodNote>Records are never deleted automatically; this module only surfaces what exists.</MethodNote>
        </Section>
      </div>
    </div>
  );
}
