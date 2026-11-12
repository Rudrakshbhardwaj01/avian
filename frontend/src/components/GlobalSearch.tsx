/** Global search overlay: '/' focuses it, arrows navigate, Enter opens. */
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { apiGet } from "../lib/api";
import { useDebounce } from "../hooks/useDebounce";
import { IucnBadge } from "./ui";

interface SearchResponse {
  q: string;
  species: { id: string; en: string | null; enIsFallback: boolean; sci: string; order: string; family: string; iucn: string | null; matchKind: string }[];
  taxa: { level: string; name: string; nSpecies: number }[];
  total: number;
}

export function GlobalSearch() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounced = useDebounce(query, 200);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const typing = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
      if (!typing && (e.key === "/" || (e.key === "k" && (e.ctrlKey || e.metaKey)))) {
        e.preventDefault();
        setOpen(true);
        setActive(0);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 10);
  }, [open]);

  useEffect(() => {
    const q = debounced.trim();
    if (!q) {
      setResults(null);
      return;
    }
    let cancelled = false;
    apiGet<SearchResponse>("/api/search", { q }).then((r) => {
      if (!cancelled) setResults(r);
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  const flat = results
    ? [
        ...results.species.map((s) => ({ kind: "species" as const, ...s })),
        ...results.taxa.map((t) => ({ kind: "taxon" as const, ...t })),
      ]
    : [];

  const openResult = useCallback(
    (item: (typeof flat)[number]) => {
      setOpen(false);
      setQuery("");
      if (item.kind === "species") navigate(`/species/${item.id}`);
      else navigate(`/taxonomy?level=${item.level}&name=${encodeURIComponent(item.name)}`);
    },
    [navigate],
  );


  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && flat[active]) {
      openResult(flat[active]);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-sm border border-line bg-panel px-3 py-1.5 text-sm text-ink3 hover:border-line-strong"
      >
        <span>Search species, genera, families…</span>
        <kbd className="rounded-sm border border-line px-1 text-[10px]">/</kbd>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-[8vh]" onClick={() => setOpen(false)}>
      <div className="w-[620px] max-w-[92vw] rounded-sm border border-line bg-panel shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-line p-3">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onInputKey}
            placeholder="Common name, scientific name, species ID, genus, family, order, translated names…"
            className="w-full rounded-sm border border-line bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-accent"
          />
        </div>
        <div className="max-h-[55vh] overflow-y-auto py-1">
          {!results && <div className="px-4 py-6 text-center text-sm text-ink3">Type to search all 11,011 species</div>}
          {results && flat.length === 0 && <div className="px-4 py-6 text-center text-sm text-ink3">No matches for “{results.q}”</div>}
          {flat.map((item, i) => (
            <button
              key={item.kind === "species" ? `s:${item.id}` : `t:${item.level}:${item.name}`}
              type="button"
              onMouseEnter={() => setActive(i)}
              onClick={() => openResult(item)}
              className={`flex w-full items-center justify-between gap-3 px-4 py-2 text-left ${i === active ? "bg-panel2" : ""}`}
            >
              {item.kind === "species" ? (
                <>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-ink">
                      {item.en}
                      {item.enIsFallback && <span className="ml-1.5 text-[10px] italic text-ink3">no English name — scientific</span>}
                    </span>
                    <span className="tnum block truncate text-xs italic text-ink2">
                      {item.sci} · {item.order} · {item.family}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {item.matchKind === "synonym" && <span className="text-[10px] text-ink3">synonym</span>}
                    <IucnBadge category={item.iucn} />
                  </span>
                </>
              ) : (
                <>
                  <span>
                    <span className="block truncate text-sm text-ink">{item.name}</span>
                    <span className="block text-xs capitalize text-ink2">{item.level}</span>
                  </span>
                  <span className="tnum text-xs text-ink3">{item.nSpecies} species</span>
                </>
              )}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between border-t border-line px-3 py-1.5 text-[11px] text-ink3">
          <span>↑↓ navigate · Enter open · Esc close</span>
          <span>search runs locally</span>
        </div>
      </div>
    </div>
  );
}
