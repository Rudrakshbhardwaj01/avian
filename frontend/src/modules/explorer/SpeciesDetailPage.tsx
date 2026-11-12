/** Species detail: full record, organized into sections, with honest
 *  missing-value display, raw-record inspector, copy-ID and export. */
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { apiGet, downloadJson } from "../../lib/api";
import { displayName } from "../../lib/naming";
import { blankNote, loadNotes, saveNote } from "../../lib/notebook";
import { IucnBadge, Loading, Missing, PageHeader, Pill, Section } from "../../components/ui";
import { fmtNum, IUCN_LABELS, REGION_LABELS } from "../../lib/theme";
import { useApp } from "../../state/store";

interface Detail {
  summary: {
    id: string;
    scientificName: string;
    authority: string | null;
    taxonConcept: string;
    names: Record<string, string>;
    otherEnglishNames: Record<string, string> | null;
    namesLanguageCount: number;
    taxonomy: { seq: number; order: string; family: string; familyEnglish: string; genus: string; system: string } | null;
    ids: Record<string, string>;
    range: Record<string, unknown>;
    traits: Record<string, unknown> | null;
    size: Record<string, unknown> | null;
    conservation: Record<string, unknown> | null;
    extinctionStatus: string | null;
    zh: Record<string, unknown> | null;
    subspecies: { name: string; authority?: string; range?: string; extinct?: string }[];
    forms: unknown[] | null;
    previous: { ioc: string; id: string; scientificName: string; relation: string }[];
    dataNotes: string[] | null;
    sticker: Record<string, unknown> | null;
    counts: { subspecies: number; languages: number; identifiersPresent: number };
  };
  raw: Record<string, unknown>;
}

const TRAIT_LABELS: [string, string][] = [
  ["massG", "Body mass (g)"],
  ["wingMm", "Wing length (mm)"],
  ["tailMm", "Tail length (mm)"],
  ["tarsusMm", "Tarsus length (mm)"],
  ["beakCulmenMm", "Beak culmen (mm)"],
  ["beakWidthMm", "Beak width (mm)"],
  ["beakDepthMm", "Beak depth (mm)"],
  ["handWingIndex", "Hand-wing index"],
];

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[180px_1fr] gap-3 py-1 text-sm">
      <div className="text-ink2">{label}</div>
      <div className="text-ink">{children}</div>
    </div>
  );
}

export default function SpeciesDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setDetail(null);
    setError(null);
    apiGet<Detail>(`/api/species/${id}`)
      .then(setDetail)
      .catch((e) => setError(e.message ?? String(e)));
  }, [id]);

  const display = useMemo(() => (detail ? { id: detail.summary.id, en: detail.summary.names["en"] ?? null, sci: detail.summary.scientificName } : null), [detail]);

  if (error) return <div className="text-sm text-danger">{error}</div>;
  if (!detail || !display) return <Loading label="Loading species record…" />;
  const s = detail.summary;
  const traits = s.traits ?? {};
  const cons = s.conservation ?? {};
  const range = s.range ?? {};
  const ids = s.ids ?? {};

  return (
    <div>
      <PageHeader
        title={displayName(display, {})}
        subtitle={<span className="tnum italic">{s.scientificName}{s.authority ? ` · ${s.authority}` : ""}</span>}
      >
        <IucnBadge category={(cons.iucn as string) ?? null} />
        <button
          type="button"
          onClick={() => navigate(`/similarity?species=${encodeURIComponent(s.id)}`)}
          className="rounded-sm border border-line bg-panel px-2.5 py-1.5 text-xs text-ink2 hover:border-accent"
          title="Find species with similar morphological profiles"
        >
          find similar species
        </button>
        <button
          type="button"
          onClick={() => {
            const note = blankNote();
            saveNote(
              {
                ...note,
                title: `Species reference: ${displayName(display, {})}`,
                observation: `Saved from the species page. ${s.scientificName} (${s.taxonomy?.family ?? "?"}), IUCN ${(cons.iucn as string) ?? "not assessed"}.`,
                speciesRefs: [s.id],
                kind: "species",
              },
              loadNotes(),
            );
            navigate("/notebook");
          }}
          className="rounded-sm border border-line bg-panel px-2.5 py-1.5 text-xs text-ink2 hover:border-accent"
        >
          save to notebook
        </button>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(s.id).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            });
          }}
          className="rounded-sm border border-line bg-panel px-2.5 py-1.5 text-xs text-ink2 hover:border-accent"
          title="Copy species identifier"
        >
          {copied ? "copied ✓" : `copy id: ${s.id}`}
        </button>
        <button
          type="button"
          onClick={() => downloadJson(`${s.id}.json`, detail.raw)}
          className="rounded-sm border border-line bg-panel px-2.5 py-1.5 text-xs text-ink2 hover:border-accent"
        >
          export record (JSON)
        </button>
        <Link to="/explorer" className="rounded-sm border border-line bg-panel px-2.5 py-1.5 text-xs text-ink2 hover:border-accent">
          ← explorer
        </Link>
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Section title="Identity">
          <Row label="English name">{s.names["en"] ?? <span className="italic"><Missing>none in source — scientific name shown as fallback</Missing></span>}</Row>
          {s.otherEnglishNames && (
            <Row label="Alternate English names">
              {Object.entries(s.otherEnglishNames).map(([k, v]) => (
                <Pill key={k}>{k}: {v}</Pill>
              ))}
              <div className="mt-1 text-xs text-ink3">Clements / BirdLife alternatives — search resolves them to this species.</div>
            </Row>
          )}
          <Row label="Scientific"><span className="tnum italic">{s.scientificName}</span></Row>
          <Row label="Authority">{s.authority ?? <Missing />}</Row>
          <Row label="Species ID"><span className="tnum">{s.id}</span></Row>
          {s.taxonConcept !== "same" && (
            <Row label="Taxon concept">
              <Pill tone="warn">{s.taxonConcept}</Pill>
              {s.dataNotes && (
                <ul className="mt-1 list-disc pl-4 text-xs text-ink2">
                  {s.dataNotes.map((n, i) => <li key={i}>{n}</li>)}
                </ul>
              )}
            </Row>
          )}
        </Section>

        <Section title="Taxonomy">
          {s.taxonomy ? (
            <>
              <Row label="Sequence"><span className="tnum">{s.taxonomy.seq}</span></Row>
              <Row label="Order">{s.taxonomy.order}</Row>
              <Row label="Family">
                <button type="button" className="text-accent hover:underline" onClick={() => { useApp.getState().setFilter({ families: [s.taxonomy!.family] }); navigate("/explorer"); }}>
                  {s.taxonomy.family} — {s.taxonomy.familyEnglish}
                </button>
              </Row>
              <Row label="Genus"><span className="tnum italic">{s.taxonomy.genus}</span></Row>
              <Row label="System">{s.taxonomy.system}</Row>
            </>
          ) : (
            <Row label="Taxonomy"><Missing>not present in the source record</Missing></Row>
          )}
          {s.previous.length > 0 && (
            <Row label="Previous (IOC 15.2)">
              <ul className="text-xs text-ink2">
                {s.previous.map((p, i) => (
                  <li key={i} className="tnum">{p.relation}: {p.scientificName}</li>
                ))}
              </ul>
            </Row>
          )}
        </Section>

        <Section title={`Names in the source (provenance — ${s.namesLanguageCount} languages)`}>
          <p className="text-sm text-ink2">
            The source dataset carries names in {s.namesLanguageCount} languages, preserved verbatim in the raw record
            (visible below) for provenance. AVIAN displays English only, by design.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Pill>en: {s.names["en"] ?? "—"}</Pill>
            {s.names["zh-Hans"] && <Pill>zh-Hans available</Pill>}
            <Pill>{s.namesLanguageCount - 1} further languages in raw record</Pill>
          </div>
        </Section>

        <Section title="Morphology (AVONET)">
          {s.traits === null && <div className="text-sm text-ink2"><Missing>No trait data for this species</Missing> — its AviList concept changed ({s.taxonConcept}); the source deliberately leaves traits empty rather than attach values from a different set of birds.</div>}
          {s.traits !== null && (
            <>
              <div className="grid grid-cols-2 gap-x-6 sm:grid-cols-4">
                {TRAIT_LABELS.map(([k, label]) => (
                  <div key={k} className="py-1">
                    <div className="overline">{label}</div>
                    <div className="tnum text-base font-medium text-ink">
                      {traits[k] !== undefined && traits[k] !== null ? fmtNum(traits[k] as number, 1) : <Missing>—</Missing>}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-2 text-sm text-ink2">
                Habitat: {String(traits.habitat ?? "—")} · density {String(traits.habitatDensity ?? "—")} · migration {String(traits.migration ?? "—")}
                <br />
                Trophic level: {String(traits.trophicLevel ?? "—")} · niche {String(traits.trophicNiche ?? "—")} · lifestyle {String(traits.primaryLifestyle ?? "—")}
              </div>
              {traits.inferred && <div className="mt-2"><Pill tone="warn">traits.inferred — AVONET imputed some values from relatives</Pill></div>}
            </>
          )}
          {s.size && (
            <div className="mt-3 border-t border-line pt-2 text-sm text-ink2">
              Body length (Wikidata/Wikipedia): {(s.size.bodyLengthCm as number[])?.join("–")} cm
              {s.size.wingspanCm ? <> · wingspan {(s.size.wingspanCm as number[])?.join("–")} cm</> : <> · wingspan <Missing>not available</Missing></>}
            </div>
          )}
        </Section>

        <Section title="Geographic range">
          <div className="text-sm leading-relaxed text-ink">{String(range.text ?? "—")}</div>
          {!!range.ioc && (
            <div className="mt-2 text-sm text-ink2">
              <span className="overline">IOC breeding region</span>
              <div className="tnum mt-0.5">
                {(range.ioc as Record<string, string>).breedingRegion}
                {(() => {
                  const code = (range.ioc as Record<string, string>).breedingRegion;
                  const labels = code?.split(",").map((c) => REGION_LABELS[c.trim()] ?? c.trim()).join(" + ");
                  return labels ? ` (${labels})` : null;
                })()}
              </div>
              <div className="mt-0.5">{(range.ioc as Record<string, string>).breeding}</div>
            </div>
          )}
          {!!range["zh-Hans"] && <div className="mt-2 text-sm text-ink2">中文分布: {String(range["zh-Hans"])}</div>}
          <div className="mt-2 text-xs text-ink3">Range statements are textual descriptions from the source — AVIAN does not fabricate coordinates or polygons, and breeding range ≠ full distribution.</div>
        </Section>

        <Section title="Conservation">
          <Row label="IUCN">
            {cons.iucn ? (
              <span>
                <IucnBadge category={cons.iucn as string} /> {IUCN_LABELS[cons.iucn as string] ?? ""}
                <span className="ml-2 text-xs text-ink3">{String((cons.sources as Record<string, string>)?.iucn ?? "")}</span>
              </span>
            ) : <Missing>not assessed in this compilation</Missing>}
          </Row>
          <Row label="CITES">
            {cons.cites ? `Appendix ${String(cons.cites)}` : <Missing>no CITES entry — not evidence of non-listing</Missing>}
          </Row>
          <Row label="China protection">{cons.chinaProtection ? String(cons.chinaProtection) : <Missing>—</Missing>}</Row>
          {s.extinctionStatus && (
            <Row label="Extinction status">
              <Pill tone="danger">{s.extinctionStatus}</Pill>
            </Row>
          )}
        </Section>

        <Section title={`Subspecies (${s.counts.subspecies})`}>
          {s.counts.subspecies === 0 && <div className="text-sm text-ink2"><Missing>No subspecies records in the source for this species.</Missing></div>}
          {s.counts.subspecies > 0 && (
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left">
                    <th className="overline px-2 py-1">Name</th>
                    <th className="overline px-2 py-1">Authority</th>
                    <th className="overline px-2 py-1">Range</th>
                    <th className="overline px-2 py-1">Extinct</th>
                  </tr>
                </thead>
                <tbody>
                  {s.subspecies.map((sub, i) => (
                    <tr key={i} className="border-b border-line align-top">
                      <td className="px-2 py-1 font-medium text-ink">{sub.name}</td>
                      <td className="px-2 py-1 text-xs text-ink2">{sub.authority ?? "—"}</td>
                      <td className="px-2 py-1 text-xs text-ink2">{sub.range ?? "—"}</td>
                      <td className="px-2 py-1 text-xs text-danger">{sub.extinct ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {s.forms && <div className="mt-2 text-xs text-ink2">Includes {s.forms.length} former-species sticker forms (lumped IOC 15.2 species).</div>}
        </Section>

        <Section title="External identifiers">
          {Object.entries(ids).length === 0 && <div className="text-sm text-ink2"><Missing>none available</Missing></div>}
          {Object.entries(ids).map(([k, v]) => (
            <Row key={k} label={k}>
              <span className="tnum">{String(v)}</span>
            </Row>
          ))}
          {Object.keys(ids).length < 5 && (
            <div className="mt-2 text-xs text-ink3">Missing identifiers reflect coverage differences in the source (see Data Quality Lab); for changed-concept species some IDs were deliberately dropped.</div>
          )}
        </Section>

        <Section title="Data provenance & metadata">
          <Row label="Sticker">
            {s.sticker ? `${String(s.sticker.kind ?? "—")} · review score ${String(s.sticker.reviewScore ?? "—")} (illustration metadata, not a biological variable) · ${String(s.sticker.license ?? "")}` : <Missing>none in source record</Missing>}
          </Row>
          {s.sticker && (
            <>
              <Row label="Sticker file"><span className="tnum break-all text-xs">{String(s.sticker.file ?? "—")}</span></Row>
              <Row label="Sticker reference">{s.sticker.reference ? JSON.stringify(s.sticker.reference) : "null (generated from description)"}</Row>
            </>
          )}
          <Row label="Trait source">
            {traits.source ? `${String((traits.source as Record<string, string>).dataset)} · ${String((traits.source as Record<string, string>).sheet)}` : <Missing>—</Missing>}
          </Row>
          {s.zh && (
            <Row label="Chinese (zh)">
              {String((s.zh as Record<string, unknown>).order ?? "")} · {String((s.zh as Record<string, unknown>).family ?? "")}
              {(s.zh as Record<string, unknown>).pinyin ? ` · ${String((s.zh as Record<string, unknown>).pinyin)}` : ""}
            </Row>
          )}
        </Section>
      </div>

      <Section title="Related analyses" className="mt-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Morphological neighbors", desc: "closest species in standardized trait space", to: `/similarity?species=${s.id}` },
            { label: "Genus explorer", desc: `all species in ${s.taxonomy?.genus ?? "genus"}`, to: `/taxonomy?level=genus&name=${encodeURIComponent(s.taxonomy?.genus ?? "")}` },
            { label: "Family conservation profile", desc: `IUCN composition within ${s.taxonomy?.family ?? "family"}`, to: `/conservation?groupVar=family&families=${encodeURIComponent(s.taxonomy?.family ?? "")}` },
            { label: "Trait anomalies", desc: "ranked unusual trait combinations", to: "/anomalies" },
          ].map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={() => navigate(a.to)}
              className="rounded-sm border border-line bg-panel2 px-3 py-2 text-left hover:border-accent hover:bg-accent-soft"
            >
              <div className="text-sm font-medium text-ink">{a.label}</div>
              <div className="text-xs text-ink3">{a.desc}</div>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Raw record" className="mt-4">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setShowRaw((v) => !v)} className="rounded-sm border border-line bg-panel px-3 py-1.5 text-sm text-ink2 hover:border-accent">
            {showRaw ? "hide raw JSON" : "show raw JSON"}
          </button>
          <span className="text-xs text-ink3">verbatim source record from Data/species.json (read-only)</span>
        </div>
        {showRaw && (
          <pre className="mt-3 max-h-96 overflow-auto rounded-sm border border-line bg-panel2 p-3 text-xs leading-relaxed text-ink">
            {JSON.stringify(detail.raw, null, 2)}
          </pre>
        )}
      </Section>
    </div>
  );
}
