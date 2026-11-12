/** App shell: collapsible sidebar + topbar with global search, theme toggle,
 *  dataset status. AVIAN is English-only; common names are primary. */
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import { apiGet } from "../lib/api";
import { type MetaResponse } from "../types";
import { useApp } from "../state/store";
import { GlobalSearch } from "../components/GlobalSearch";
import { ActiveFilters } from "../components/FilterBar";

const NAV = [
  { to: "/", label: "Overview", end: true },
  { to: "/discovery", label: "Discovery" },
  { to: "/explorer", label: "Species Explorer" },
  { to: "/taxonomy", label: "Taxonomy" },
  { to: "/morphology", label: "Morphology" },
  { to: "/ecology", label: "Ecology" },
  { to: "/conservation", label: "Conservation" },
  { to: "/geography", label: "Geography" },
  { to: "/relationships", label: "Relationships" },
  { to: "/multivariate", label: "Multivariate" },
  { to: "/similarity", label: "Similarity" },
  { to: "/anomalies", label: "Anomalies" },
  { to: "/experiments", label: "ML Experiments" },
  { to: "/inference", label: "Inference" },
  { to: "/quality", label: "Data Quality" },
  { to: "/notebook", label: "Research Notebook" },
  { to: "/about", label: "About Dataset" },
];

export function AppLayout() {
  const theme = useApp((s) => s.theme);
  const toggleTheme = useApp((s) => s.toggleTheme);
  const collapsed = useApp((s) => s.sidebarCollapsed);
  const toggleSidebar = useApp((s) => s.toggleSidebar);
  const filters = useApp((s) => s.filters);
  const location = useLocation();

  const [meta, setMeta] = useState<MetaResponse | null>(null);
  const [healthOk, setHealthOk] = useState<boolean | null>(null);

  useEffect(() => {
    apiGet<MetaResponse>("/api/meta")
      .then(setMeta)
      .catch(() => setHealthOk(false));
  }, []);

  useEffect(() => {
    apiGet<{ status: string }>("/api/health")
      .then((r) => setHealthOk(r.status === "ok"))
      .catch(() => setHealthOk(false));
  }, []);

  return (
    <div className="flex min-h-screen bg-bg text-ink">
      {/* sidebar */}
      <aside className={`sticky top-0 flex h-screen shrink-0 flex-col border-r border-line bg-panel transition-all ${collapsed ? "w-14" : "w-56"}`}>
        <div className="flex items-center justify-between px-3 py-4">
          {!collapsed && (
            <div>
              <div className="display text-lg font-semibold tracking-tight text-ink">AVIAN</div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-ink3">Ornithological Data Lab</div>
            </div>
          )}
          <button type="button" onClick={toggleSidebar} title="Toggle sidebar" className="rounded-sm border border-line px-1.5 py-0.5 text-xs text-ink2 hover:border-accent">
            {collapsed ? "»" : "«"}
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 pb-4">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `block truncate rounded-sm px-3 py-1.5 text-sm transition-colors ${isActive ? "bg-accent-soft font-medium text-accent-ink" : "text-ink2 hover:bg-panel2 hover:text-ink"} ${collapsed ? "text-center" : ""}`
              }
              title={item.label}
            >
              {collapsed ? item.label[0] : item.label}
            </NavLink>
          ))}
        </nav>
        {!collapsed && (
          <div className="border-t border-line px-3 py-3 text-xs text-ink3">
            {meta ? (
              <>
                <div className="tnum">AviList {meta.dataset.version}</div>
                <div className="tnum">{meta.dataset.actualCount.toLocaleString("en-US")} species</div>
              </>
            ) : (
              <div>connecting…</div>
            )}
          </div>
        )}
      </aside>

      {/* main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-line bg-panel/95 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3">
            <GlobalSearch />
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-sm border px-2 py-1.5 text-xs ${healthOk ? "border-line text-ink2" : "border-danger/50 text-danger"}`}
                title={healthOk ? "Dataset loaded from local Data/species.json" : "Backend unreachable"}
              >
                <span className={`inline-block h-2 w-2 rounded-full ${healthOk ? "bg-accent" : "bg-danger"}`} />
                {healthOk ? "data ready" : "offline"}
              </span>
              <button
                type="button"
                onClick={toggleTheme}
                title="Toggle light/dark theme"
                className="rounded-sm border border-line px-2 py-1.5 text-sm text-ink2 hover:border-accent"
              >
                {theme === "dark" ? "☀" : "☾"}
              </button>
            </div>
          </div>
          {location.pathname !== "/species" && <div className="border-t border-line px-6 py-1.5">{<ActiveFilters meta={meta} />}</div>}
        </header>
        <main className="min-w-0 flex-1 px-6 py-6">
          <Outlet context={{ meta, filters }} />
        </main>
        <footer className="border-t border-line px-6 py-3 text-xs text-ink3">
          AVIAN · local-first exploration of the World Bird Species dataset (AviList v2026) · no data leaves this machine
        </footer>
      </div>
    </div>
  );
}
