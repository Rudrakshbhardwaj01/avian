/** Global app state (zustand): theme, display language, global filters. */
import { create } from "zustand";
import { EMPTY_FILTERS, type Filters } from "../types";

type Theme = "light" | "dark";

function initialTheme(): Theme {
  const stored = localStorage.getItem("avian.theme");
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  localStorage.setItem("avian.theme", theme);
}

interface AppState {
  theme: Theme;
  toggleTheme: () => void;

  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  filters: Filters;
  /** merge a partial filter; empty array clears the dimension */
  setFilter: (patch: Filters) => void;
  resetFilters: () => void;
  activeFilterCount: () => number;
}

export const useApp = create<AppState>((set, get) => ({
  theme: initialTheme(),
  toggleTheme: () => {
    const next: Theme = get().theme === "dark" ? "light" : "dark";
    applyTheme(next);
    set({ theme: next });
  },

  sidebarCollapsed: localStorage.getItem("avian.sidebar") === "collapsed",
  toggleSidebar: () => {
    const next = !get().sidebarCollapsed;
    localStorage.setItem("avian.sidebar", next ? "collapsed" : "open");
    set({ sidebarCollapsed: next });
  },

  filters: EMPTY_FILTERS,
  setFilter: (patch) => set({ filters: { ...get().filters, ...patch } }),
  resetFilters: () => set({ filters: EMPTY_FILTERS }),
  activeFilterCount: () => {
    const f = get().filters;
    let n = 0;
    for (const key of ["orders", "families", "genera", "habitat", "migration", "trophicLevel", "trophicNiche", "lifestyle", "iucn", "breedingRegion"] as const) {
      n += f[key]?.length ?? 0;
    }
    if (f.q) n += 1;
    if (f.excludeImputed) n += 1;
    if (f.traitsOnly) n += 1;
    if (f.conservationOnly) n += 1;
    if (f.geoOnly) n += 1;
    if (f.massMin !== undefined && f.massMin !== null) n += 1;
    if (f.massMax !== undefined && f.massMax !== null) n += 1;
    return n;
  },
}));

// apply stored theme once at startup
applyTheme(useApp.getState().theme);
