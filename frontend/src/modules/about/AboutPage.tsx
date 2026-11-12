/** Module 12 — About Dataset: provenance, field documentation, licensing,
 *  known limitations, and AVIAN's analytical transformations. */
import { useEffect, useState } from "react";
import { apiGet } from "../../lib/api";
import { Loading, MethodNote, PageHeader, Pill, Section, StatTile } from "../../components/ui";
import { fmtNum } from "../../lib/theme";
import { type MetaResponse } from "../../types";

interface Report {
  recordCount: number;
  coverage: { domain: string; fields: string; n: number; pct: number }[];
  concerns: string[];
}

export default function AboutPage() {
  const [meta, setMeta] = useState<MetaResponse | null>(null);
  const [report, setReport] = useState<Report | null>(null);

  useEffect(() => {
    apiGet<MetaResponse>("/api/meta").then(setMeta).catch(() => undefined);
    apiGet<Report>("/api/quality/report").then(setReport).catch(() => undefined);
  }, []);

  if (!meta || !report) return <Loading label="Loading dataset documentation…" />;

  return (
    <div>
      <PageHeader
        title="About the Dataset"
        subtitle="World Bird Species — AviList v2026, compiled by the huashu-bird-sticker project. AVIAN reads the local files in Data/ and never modifies them."
      >
        <Pill tone="accent">v{meta.dataset.version}</Pill>
        <Pill>{meta.dataset.taxonomy}</Pill>
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Declared species" value={fmtNum(meta.dataset.declaredCount)} />
        <StatTile label="Verified records" value={fmtNum(meta.dataset.actualCount)} sub={meta.dataset.countMatches ? "counts match ✓" : "MISMATCH"} />
        <StatTile label="Languages" value={fmtNum(meta.sourceLanguageCount)} sub="common names" />
        <StatTile label="Third-party sources" value="6" sub="see attribution below" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Section title="What is in the dataset">
          <p className="text-sm leading-relaxed text-ink2">
            One record per species (<span className="tnum">{fmtNum(report.recordCount)}</span>), sorted in AviList v2026 sequence. Each record carries taxonomy (order / family / genus / sequence), common names in {meta.sourceLanguageCount} language codes, external identifiers (eBird, Avibase, Wikidata, GBIF, iNaturalist), a textual range statement plus IOC 15.2 breeding-region codes, AVONET traits (mass, wing, tail, tarsus, three beak measurements, hand-wing index, habitat, migration, trophic level &amp; niche, primary lifestyle), body-size ranges (Wikidata/Wikipedia), conservation data (IUCN category from BirdLife v10, CITES appendix, China protection class), subspecies with authorities and ranges, Chinese-language metadata, and app sticker metadata.
          </p>
          <div className="mt-3">
            <div className="overline mb-1">Coverage by domain</div>
            <ul className="text-sm">
              {report.coverage.map((c) => (
                <li key={c.domain} className="flex justify-between border-b border-line py-0.5">
                  <span className="text-ink2">{c.domain} <span className="text-xs text-ink3">({c.fields})</span></span>
                  <span className="tnum">{fmtNum(c.n)} · {c.pct.toFixed(1)}%</span>
                </li>
              ))}
            </ul>
          </div>
        </Section>

        <Section title="Attribution & licensing (preserve as published)">
          <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-ink2">
            <li>Compilation &amp; AI sticker illustrations: <strong>MIT / CC BY 4.0</strong> (huashu-bird-sticker project, to the extent they hold rights).</li>
            <li>Taxonomy, English names, range statements, subspecies, IUCN categories (BirdLife v10), eBird codes, Avibase IDs: <strong>AviList v2026</strong> (AviList Core Team, 2026, doi:10.2173/avilist.v2026) — <strong>CC BY 4.0</strong>.</li>
            <li>Non-English names and IOC breeding ranges: <strong>IOC World Bird List v15.2</strong> (Gill, Donsker &amp; Rasmussen) — <strong>CC BY 3.0</strong>.</li>
            <li>Body measurements &amp; ecology: <strong>AVONET</strong> (Tobias et al. 2022, Ecology Letters 25:581–597, doi:10.1111/ele.13898) — <strong>CC BY 4.0</strong>.</li>
            <li>Wikidata, GBIF &amp; iNaturalist identifiers, CITES appendices, Chinese aliases/order/family names: <strong>CC0</strong>.</li>
            <li>Chinese field-guide notes: <strong>CC BY-SA 4.0</strong> (rewritten from Chinese Wikipedia and other sources).</li>
            <li>China protection classes: 国家重点保护野生动物名录 (2021).</li>
          </ul>
          <MethodNote>
            Mixed licensing: no single license covers the whole dataset. Reference photos behind stickers are <em>not</em> included in this repository. Full notices live in <code className="tnum">Data/NOTICE.md</code> and <code className="tnum">Data/FIELDS.md</code>.
          </MethodNote>
        </Section>

        <Section title="Known limitations (as documented by the source)">
          <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-ink2">
            {report.concerns.map((c, i) => <li key={i}>{c}</li>)}
            <li>No latitude/longitude, observation records, abundance counts, population estimates, or migration routes exist in the source — AVIAN displays none.</li>
            <li>BirdLife is still aligning parts of the Red List with AviList; check iucnredlist.org for the latest assessments.</li>
            <li><code className="tnum">zh.aliases</code> come from Wikidata/Chinese Wikipedia and are not individually verified by the source project.</li>
          </ul>
        </Section>

        <Section title="Analytical transformations AVIAN performs">
          <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-ink2">
            <li><strong>Normalization only</strong> — the JSON is flattened into analytical tables; values are copied, never altered. No record is deleted or imputed by AVIAN.</li>
            <li><strong>Missing values stay missing</strong> — never zero-filled; every analysis reports its effective sample size.</li>
            <li><strong>Documented groupings</strong> — the Conservation Lab's “broad” categories (e.g. Threatened = VU/EN/CR) are derived by AVIAN; the original IUCN codes remain attached everywhere.</li>
            <li><strong>Suspicious-value flags</strong> — e.g. hand-wing index ≤ 0.15 (12 records, exactly 0.1) is surfaced in the Data Quality Lab, not removed.</li>
            <li><strong>Region decoding</strong> — IOC breeding-region codes (AF, SA, PAL, MA, …) are labeled per the IOC 15.2 convention; multi-region species count once per region component.</li>
            <li><strong>Language labels</strong> — the {meta.sourceLanguageCount} language codes get human-readable labels; data is untouched.</li>
          </ul>
          <MethodNote>
            Every chart in AVIAN is computed from the local dataset at request time by the FastAPI backend. There are no placeholder values, no hardcoded statistics, and no network calls beyond this machine.
          </MethodNote>
        </Section>
      </div>
    </div>
  );
}
