/** Global filter bar + active filter chips. Bound to the zustand store. */
import { useMemo } from "react";
import { useApp } from "../state/store";
import { type FacetOption, type Filters, type MetaResponse } from "../types";
import { MultiSelect } from "./MultiSelect";

const DIMENSIONS: { key: keyof Filters; label: string; facet: string; searchable?: boolean }[] = [
  { key: "orders", label: "Order", facet: "orders", searchable: true },
  { key: "families", label: "Family", facet: "families", searchable: true },
  { key: "genera", label: "Genus", facet: "genera", searchable: true },
  { key: "habitat", label: "Habitat", facet: "habitat" },
  { key: "migration", label: "Migration", facet: "migration" },
  { key: "trophicNiche", label: "Trophic niche", facet: "trophicNiche", searchable: true },
  { key: "lifestyle", label: "Lifestyle", facet: "lifestyle" },
  { key: "iucn", label: "IUCN", facet: "iucn" },
  { key: "breedingRegion", label: "Region", facet: "breedingRegion", searchable: true },
];

export function FilterBar({ meta }: { meta: MetaResponse | null }) {
  const filters = useApp((s) => s.filters);
  const setFilter = useApp((s) => s.setFilter);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {meta &&
        DIMENSIONS.map((d) => (
          <MultiSelect
            key={d.key}
            label={d.label}
            options={meta.facetOptions[d.facet] ?? []}
            selected={(filters[d.key] as string[]) ?? []}
            onChange={(values) => setFilter({ [d.key]: values } as Partial<Filters>)}
            searchable={d.searchable}
          />
        ))}
      {!meta && <span className="text-xs text-ink3">loading filters…</span>}
      <label className="ml-1 flex cursor-pointer items-center gap-1.5 text-xs text-ink2" title="AVONET imputed trait values for 791 species; exclude them from analyses">
        <input
          type="checkbox"
          className="accent-accent"
          checked={filters.excludeImputed ?? false}
          onChange={(e) => setFilter({ excludeImputed: e.target.checked })}
        />
        exclude imputed traits
      </label>
    </div>
  );
}

export function ActiveFilters({ meta }: { meta: MetaResponse | null }) {
  const filters = useApp((s) => s.filters);
  const setFilter = useApp((s) => s.setFilter);
  const resetFilters = useApp((s) => s.resetFilters);

  const chips = useMemo(() => {
    const out: { key: keyof Filters; value: string; label: string }[] = [];
    for (const d of DIMENSIONS) {
      const values = (filters[d.key] as string[] | undefined) ?? [];
      for (const v of values) {
        const option = meta?.facetOptions[d.facet]?.find((o: FacetOption) => o.value === v);
        out.push({ key: d.key, value: v, label: `${d.label}: ${option?.label ?? v}` });
      }
    }
    if (filters.q) out.push({ key: "q", value: filters.q, label: `search: ${filters.q}` });
    if (filters.excludeImputed) out.push({ key: "excludeImputed", value: "true", label: "excluding imputed traits" });
    return out;
  }, [filters, meta]);

  if (chips.length === 0) return null;

  function remove(chip: { key: keyof Filters; value: string }) {
    if (chip.key === "q" || chip.key === "excludeImputed") {
      setFilter({ [chip.key]: undefined } as Partial<Filters>);
      return;
    }
    const current = (filters[chip.key] as string[] | undefined) ?? [];
    setFilter({ [chip.key]: current.filter((v) => v !== chip.value) } as Partial<Filters>);
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((c) => (
        <button
          key={`${String(c.key)}:${c.value}`}
          type="button"
          onClick={() => remove(c)}
          className="inline-flex items-center gap-1 rounded-sm border border-accent/60 bg-accent-soft px-2 py-0.5 text-xs text-accent-ink hover:border-danger hover:text-danger"
          title="Click to remove this filter"
        >
          {c.label} <span className="text-[10px]">✕</span>
        </button>
      ))}
      <button type="button" onClick={resetFilters} className="ml-1 text-xs font-medium text-danger hover:underline">
        reset all
      </button>
    </div>
  );
}
