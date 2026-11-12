/** Research notebook: transparent localStorage persistence + JSON export/import.
 *
 * Note kinds:
 *  - observation: classic lab note (observation → hypothesis → method → result)
 *  - species:     a saved species reference
 *  - experiment:  a saved ML/analysis configuration + result summary, with
 *                 enough metadata to reproduce it against the same dataset version
 *  - discovery:   a saved Discovery Lab finding
 */
import { type Filters } from "../types";

export type NoteKind = "observation" | "species" | "experiment" | "discovery";

export interface Note {
  id: string;
  createdAt: string;
  updatedAt: string;
  kind: NoteKind;
  title: string;
  observation: string;
  hypothesis: string;
  method: string;
  result: string;
  interpretation: string;
  variables: string;
  filters: Filters;
  chartConfig: string;
  /** structured additions (v2) */
  speciesRefs?: string[];
  analysisConfig?: Record<string, unknown> | null;
  reproducibility?: Record<string, unknown> | null;
}

const KEY = "avian.notes.v1";

export function loadNotes(): Note[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((n: Note) => ({ ...n, kind: (n.kind ?? "observation") as NoteKind })) as Note[];
  } catch {
    return [];
  }
}

function persist(notes: Note[]) {
  localStorage.setItem(KEY, JSON.stringify(notes));
}

export function saveNote(note: Note, existing: Note[]): Note[] {
  const next = existing.some((n) => n.id === note.id)
    ? existing.map((n) => (n.id === note.id ? note : n))
    : [note, ...existing];
  persist(next);
  return next;
}

export function deleteNote(id: string, existing: Note[]): Note[] {
  const next = existing.filter((n) => n.id !== id);
  persist(next);
  return next;
}

export function blankNote(): Note {
  const now = new Date().toISOString();
  return {
    id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: now,
    updatedAt: now,
    kind: "observation",
    title: "",
    observation: "",
    hypothesis: "",
    method: "",
    result: "",
    interpretation: "",
    variables: "",
    filters: {},
    chartConfig: "",
    speciesRefs: [],
    analysisConfig: null,
    reproducibility: null,
  };
}

/** Reproducibility metadata attached automatically to saved experiments. */
export function reproMetadata(config: Record<string, unknown>): Record<string, unknown> {
  return {
    dataset: "World Bird Species — AviList v2026 (species.json v2.3.1)",
    savedAt: new Date().toISOString(),
    config,
  };
}

export function exportNotes(notes: Note[]): void {
  const blob = new Blob([JSON.stringify({ app: "AVIAN", schema: 2, exportedAt: new Date().toISOString(), notes }, null, 1)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "avian-research-notes.json";
  a.click();
  URL.revokeObjectURL(url);
}

export async function importNotes(file: File, existing: Note[]): Promise<Note[]> {
  const text = await file.text();
  const parsed = JSON.parse(text) as { notes?: Note[] } | Note[];
  const incoming: Note[] = Array.isArray(parsed) ? parsed : (parsed.notes ?? []);
  const byId = new Map(existing.map((n) => [n.id, n]));
  for (const n of incoming) {
    if (!n.id || typeof n.title !== "string") continue; // basic sanity
    byId.set(n.id, { ...n, kind: (n.kind ?? "observation") as NoteKind });
  }
  const next = [...byId.values()];
  persist(next);
  return next;
}
