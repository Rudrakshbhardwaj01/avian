/** Searchable multi-select dropdown used by the global filter bar. */
import { useEffect, useMemo, useRef, useState } from "react";
import { type FacetOption } from "../types";
import { fmtNum } from "../lib/theme";

interface MultiSelectProps {
  label: string;
  options: FacetOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  searchable?: boolean;
  width?: string;
}

export function MultiSelect({ label, options, selected, onChange, searchable = true, width = "13rem" }: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
    return list.slice(0, 500);
  }, [options, query]);

  function toggle(value: string) {
    if (selected.includes(value)) onChange(selected.filter((v) => v !== value));
    else onChange([...selected, value]);
  }

  return (
    <div className="relative" ref={boxRef} style={{ width }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center justify-between gap-1 rounded-sm border px-2.5 py-1.5 text-left text-sm transition-colors ${
          selected.length ? "border-accent bg-accent-soft text-accent-ink" : "border-line bg-panel text-ink hover:border-line-strong"
        }`}
      >
        <span className="truncate">
          {label}
          {selected.length > 0 && <span className="tnum ml-1.5 font-semibold">· {selected.length}</span>}
        </span>
        <span className="text-[10px] text-ink3">▼</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-40 mt-1 w-72 rounded-sm border border-line bg-panel shadow-lg">
          {searchable && (
            <div className="border-b border-line p-2">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Filter ${label.toLowerCase()}…`}
                className="w-full rounded-sm border border-line bg-bg px-2 py-1 text-sm text-ink outline-none focus:border-accent"
              />
            </div>
          )}
          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 && <div className="px-3 py-2 text-sm text-ink3">No matches</div>}
            {filtered.map((o) => (
              <label key={o.value} className="flex cursor-pointer items-center justify-between gap-2 px-3 py-1 text-sm hover:bg-panel2">
                <span className="flex items-center gap-2 truncate">
                  <input type="checkbox" checked={selected.includes(o.value)} onChange={() => toggle(o.value)} className="accent-accent" />
                  <span className="truncate text-ink">{o.label}</span>
                </span>
                <span className="tnum shrink-0 text-xs text-ink3">{fmtNum(o.count)}</span>
              </label>
            ))}
          </div>
          {selected.length > 0 && (
            <div className="border-t border-line p-2">
              <button type="button" onClick={() => onChange([])} className="text-xs text-accent hover:underline">
                Clear selection
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
