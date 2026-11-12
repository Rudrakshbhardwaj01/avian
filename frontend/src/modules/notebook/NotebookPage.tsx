/** Research Notebook — observations, species references, saved experiments,
 *  and discovery records, persisted locally with reproducibility metadata. */
import { useRef, useState } from "react";
import { useNavigate } from "react-router";
import {
  blankNote, deleteNote, exportNotes, importNotes, loadNotes, saveNote,
  type Note, type NoteKind,
} from "../../lib/notebook";
import { filterHash } from "../../lib/filters";
import { MethodNote, PageHeader, Pill, Section } from "../../components/ui";
import { useApp } from "../../state/store";

const KINDS: { value: NoteKind; label: string }[] = [
  { value: "observation", label: "observation" },
  { value: "species", label: "species reference" },
  { value: "experiment", label: "experiment" },
  { value: "discovery", label: "discovery" },
];

const FIELDS: { key: keyof Note; label: string; hint: string; kinds?: NoteKind[] }[] = [
  { key: "observation", label: "Observation", hint: "What did you notice? e.g. 'mass and tarsus length rise together in the filtered set'" },
  { key: "hypothesis", label: "Hypothesis", hint: "What might explain it — stated as a question or claim to test" },
  { key: "method", label: "Method", hint: "e.g. Spearman correlation grouped by primary lifestyle, n = 9,533" },
  { key: "result", label: "Result", hint: "The numbers you recorded from the chart or table" },
  { key: "interpretation", label: "Interpretation", hint: "What it may mean — and what it cannot mean" },
  { key: "variables", label: "Variables", hint: "e.g. massG × tarsusMm, grouped by lifestyle" },
];

export default function NotebookPage() {
  const [notes, setNotes] = useState<Note[]>(() => loadNotes());
  const [editing, setEditing] = useState<Note | null>(null);
  const [kindFilter, setKindFilter] = useState<"all" | NoteKind>("all");
  const [importError, setImportError] = useState<string | null>(null);
  const filters = useApp((s) => s.filters);
  const fileRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  function upsert(note: Note) {
    setNotes(saveNote(note, notes));
    setEditing(null);
  }

  const shown = kindFilter === "all" ? notes : notes.filter((n) => n.kind === kindFilter);

  return (
    <div>
      <PageHeader
        title="Research Notebook"
        subtitle="Your local research workspace: observations, species references, saved experiments with reproducibility metadata, and discovery records. Stored in this browser; export to keep a copy."
      >
        <button
          type="button"
          onClick={() => setEditing(blankNote())}
          className="rounded-sm bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover"
        >
          + new note
        </button>
        <button type="button" onClick={() => exportNotes(notes)} disabled={notes.length === 0} className="rounded-sm border border-line bg-panel px-3 py-1.5 text-sm text-ink2 hover:border-accent disabled:opacity-40">
          export all
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} className="rounded-sm border border-line bg-panel px-3 py-1.5 text-sm text-ink2 hover:border-accent">
          import
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) {
              try {
                setNotes(await importNotes(f, notes));
              } catch {
                setImportError("Could not import: the file is not a valid AVIAN notebook JSON export.");
              }
            }
            e.target.value = "";
          }}
        />
      </PageHeader>

      {importError && (
        <div className="mb-4 rounded-sm border border-warn/40 bg-warn-soft px-3 py-2 text-sm text-warn" role="alert">
          {importError}
        </div>
      )}
      <div className="mb-4 flex gap-1">
        {([["all", "all"], ...KINDS.map((k) => [k.value, k.label] as const)] as const).map(([v, label]) => (
          <button
            key={v}
            type="button"
            onClick={() => setKindFilter(v as "all" | NoteKind)}
            className={`rounded-sm px-3 py-1.5 text-sm capitalize ${kindFilter === v ? "bg-accent-soft font-medium text-accent-ink" : "text-ink2 hover:bg-panel2"}`}
          >
            {label} {v !== "all" && `(${notes.filter((n) => n.kind === v).length})`}
          </button>
        ))}
      </div>

      {editing && (
        <Section title={notes.some((n) => n.id === editing.id) ? "Edit note" : "New note"} className="mb-4">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={editing.kind}
                onChange={(e) => setEditing({ ...editing, kind: e.target.value as NoteKind })}
                className="rounded-sm border border-line bg-bg px-2 py-1.5 text-sm"
              >
                {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
              </select>
              <input
                value={editing.title}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                placeholder="Note title"
                className="min-w-64 flex-1 rounded-sm border border-line bg-bg px-3 py-2 text-sm font-medium outline-none focus:border-accent"
              />
            </div>
            {editing.kind === "observation" && FIELDS.map((f) => (
              <div key={f.key as string}>
                <label className="overline">{f.label}</label>
                <textarea
                  value={String(editing[f.key] ?? "")}
                  onChange={(e) => setEditing({ ...editing, [f.key]: e.target.value })}
                  placeholder={f.hint}
                  rows={2}
                  className="w-full rounded-sm border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </div>
            ))}
            {editing.kind === "experiment" && (
              <>
                <div>
                  <label className="overline">Method</label>
                  <textarea
                    value={editing.method}
                    onChange={(e) => setEditing({ ...editing, method: e.target.value })}
                    placeholder="e.g. task=migration · models=[logistic, hist_gb] · grouped CV by family · seed 42"
                    rows={2}
                    className="w-full rounded-sm border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="overline">Result summary</label>
                  <textarea
                    value={editing.result}
                    onChange={(e) => setEditing({ ...editing, result: e.target.value })}
                    placeholder="Best model, balanced accuracy vs baseline, leakage comparison…"
                    rows={3}
                    className="w-full rounded-sm border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
                  />
                </div>
                {editing.reproducibility && (
                  <div className="text-xs text-ink3">
                    reproducibility: <code className="tnum">{JSON.stringify(editing.reproducibility).slice(0, 140)}…</code>
                  </div>
                )}
              </>
            )}
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setEditing({ ...editing, filters, chartConfig: JSON.stringify(filters, null, 1) })} className="rounded-sm border border-line bg-panel px-2.5 py-1.5 text-xs text-ink2 hover:border-accent">
                attach current global filters ({filterHash(filters)})
              </button>
              {editing.filters && Object.keys(editing.filters).length > 0 && (
                <span className="text-xs text-ink3">filters attached: {JSON.stringify(editing.filters).slice(0, 80)}…</span>
              )}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => upsert(editing)} disabled={!editing.title.trim()} className="rounded-sm bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-40">
                save note
              </button>
              <button type="button" onClick={() => setEditing(null)} className="rounded-sm border border-line bg-panel px-3 py-1.5 text-sm text-ink2 hover:border-accent">
                cancel
              </button>
            </div>
          </div>
        </Section>
      )}

      {shown.length === 0 && !editing ? (
        <Section>
          <div className="py-10 text-center">
            <p className="display text-lg text-ink2">No {kindFilter === "all" ? "notes" : kindFilter + " notes"} yet.</p>
            <p className="mt-1 text-sm text-ink3">
              Explore the labs, then record what you find. Species pages, ML experiments, and Discovery findings can all be saved here directly.
            </p>
          </div>
        </Section>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {shown.map((n) => (
            <Section key={n.id}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <Pill tone={n.kind === "experiment" ? "accent" : n.kind === "discovery" ? "accent" : "default"}>{n.kind}</Pill>
                  <div className="display mt-1 text-base font-semibold text-ink">{n.title || "(untitled)"}</div>
                  <div className="tnum mt-0.5 text-xs text-ink3">{new Date(n.updatedAt).toLocaleString()}</div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button type="button" onClick={() => setEditing(n)} className="rounded-sm border border-line px-2 py-0.5 text-xs text-ink2 hover:border-accent">edit</button>
                  <button type="button" onClick={() => setNotes(deleteNote(n.id, notes))} className="rounded-sm border border-line px-2 py-0.5 text-xs text-danger hover:border-danger">delete</button>
                </div>
              </div>
              <dl className="mt-2 space-y-1 text-sm">
                {FIELDS.filter((f) => String(n[f.key] ?? "").trim() && (n.kind !== "experiment" || !["observation", "hypothesis", "variables"].includes(f.key as string))).map((f) => (
                  <div key={f.key as string}>
                    <dt className="overline inline">{f.label}: </dt>
                    <dd className="inline text-ink2">{String(n[f.key])}</dd>
                  </div>
                ))}
              </dl>
              {n.speciesRefs && n.speciesRefs.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {n.speciesRefs.map((id) => (
                    <button key={id} type="button" onClick={() => navigate(`/species/${id}`)} className="tnum rounded-sm border border-line px-2 py-0.5 text-xs text-accent hover:border-accent">
                      {id}
                    </button>
                  ))}
                </div>
              )}
              {n.filters && Object.keys(n.filters).length > 0 && (
                <div className="mt-2">
                  <Pill tone="accent">filters attached</Pill>
                  <button
                    type="button"
                    className="ml-2 text-xs text-accent hover:underline"
                    onClick={() => {
                      useApp.getState().setFilter(n.filters);
                      navigate("/explorer");
                    }}
                  >
                    apply in explorer
                  </button>
                </div>
              )}
            </Section>
          ))}
        </div>
      )}

      <MethodNote>
        Notes are stored only in this browser (localStorage key <code className="tnum">avian.notes.v1</code>). Experiments keep their full configuration (task, models, seed, dataset version) so they can be reproduced against the same dataset; “Export all” writes a JSON archive you can re-import later.
      </MethodNote>
    </div>
  );
}
