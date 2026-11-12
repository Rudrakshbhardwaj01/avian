/** Export menu: server-side CSV/JSON exports honoring current filters. */
import { useEffect, useRef, useState } from "react";
import { exportUrl } from "../lib/api";
import { useApp } from "../state/store";

export function ExportMenu() {
  const filters = useApp((s) => s.filters);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const items: { label: string; path: string; note: string }[] = [
    { label: "Species — CSV", path: "/api/export/species.csv", note: "taxonomy, traits, conservation, identifiers" },
    { label: "Species — JSON (verbatim records)", path: "/api/export/species.json", note: "unmodified source records" },
    { label: "Traits — CSV", path: "/api/export/traits.csv", note: "measurements + ecology columns" },
    { label: "Subspecies — CSV", path: "/api/export/subspecies.csv", note: "entries of filtered species" },
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-sm border border-line bg-panel px-2.5 py-1.5 text-sm text-ink hover:border-accent"
      >
        Export data
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-1 w-72 rounded-sm border border-line bg-panel py-1 shadow-lg">
          <div className="px-3 py-1.5 text-xs text-ink3">Exports honor the active filters.</div>
          {items.map((it) => (
            <a key={it.path} href={exportUrl(it.path, filters)} download className="block px-3 py-1.5 hover:bg-panel2">
              <div className="text-sm text-ink">{it.label}</div>
              <div className="text-xs text-ink3">{it.note}</div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
