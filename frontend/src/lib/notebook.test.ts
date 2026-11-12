import { describe, expect, it } from "vitest";
import { blankNote, deleteNote, loadNotes, saveNote } from "./notebook";

describe("notebook persistence", () => {
  it("saves and reloads notes through localStorage", () => {
    const note = { ...blankNote(), title: "Mass vs tarsus" };
    const saved = saveNote(note, []);
    expect(saved).toHaveLength(1);
    expect(loadNotes().map((n) => n.title)).toContain("Mass vs tarsus");
  });

  it("updates an existing note by id", () => {
    const note = { ...blankNote(), title: "first" };
    let notes = saveNote(note, []);
    notes = saveNote({ ...note, title: "second" }, notes);
    expect(notes).toHaveLength(1);
    expect(notes[0].title).toBe("second");
  });

  it("deletes by id", () => {
    const note = { ...blankNote(), title: "gone" };
    const notes = saveNote(note, []);
    const after = deleteNote(note.id, notes);
    expect(after).toHaveLength(0);
    expect(loadNotes()).toHaveLength(0);
  });
});
