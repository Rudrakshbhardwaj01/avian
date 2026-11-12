/** Shared UI primitives: sections, stat tiles, badges, notes, empty states. */
import { type ReactNode } from "react";
import { IUCN_LABELS, iucnColor } from "../lib/theme";
import { useApp } from "../state/store";

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-4">
      <div>
        <h1 className="display text-2xl font-semibold text-ink">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-sm leading-relaxed text-ink2">{subtitle}</p>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </header>
  );
}

export function Section({ title, aside, children, className }: { title?: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-sm border border-line bg-panel ${className ?? ""}`}>
      {title && (
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <h2 className="overline">{title}</h2>
          {aside}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function StatTile({ label, value, sub, onClick, active }: { label: string; value: ReactNode; sub?: string; onClick?: () => void; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`rounded-sm border border-line bg-panel px-4 py-3 text-left transition-colors ${onClick ? "cursor-pointer hover:border-accent" : ""} ${active ? "border-accent" : ""}`}
    >
      <div className="overline">{label}</div>
      <div className="tnum display mt-1 text-xl font-semibold text-ink">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-ink2">{sub}</div>}
    </button>
  );
}

export function IucnBadge({ category, title }: { category: string | null; title?: string }) {
  const dark = useApp((s) => s.theme === "dark");
  if (!category) {
    return (
      <span className="inline-flex items-center rounded-sm border border-line px-1.5 py-0.5 text-[11px] font-medium text-ink2" title="Not assessed in the source data — absence of an IUCN category is not 'Least Concern'">
        not assessed
      </span>
    );
  }
  const c = iucnColor(category, dark);
  return (
    <span
      className="inline-flex items-center rounded-sm px-1.5 py-0.5 text-[11px] font-semibold text-white"
      style={{ background: c }}
      title={title ?? IUCN_LABELS[category] ?? category}
    >
      {category}
    </span>
  );
}

export function Missing({ children = "missing" }: { children?: ReactNode }) {
  return <span className="text-xs italic text-ink3">{children}</span>;
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 py-14 text-center">
      <div className="display text-lg text-ink2">{title}</div>
      {hint && <div className="max-w-md text-sm text-ink3">{hint}</div>}
    </div>
  );
}

export function Loading({ label = "Computing…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-ink2" role="status">
      <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-line-strong border-t-accent" />
      {label}
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-sm border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger" role="alert">
      {message}
    </div>
  );
}

export function MethodNote({ children }: { children: ReactNode }) {
  return (
    <p className="mt-2 border-l-2 border-line pl-3 text-xs leading-relaxed text-ink2">{children}</p>
  );
}

export function Pill({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "accent" | "warn" | "danger" }) {
  const tones: Record<string, string> = {
    default: "border-line text-ink2",
    accent: "border-accent/50 text-accent-ink bg-accent-soft",
    warn: "border-warn/50 text-warn bg-warn/10",
    danger: "border-danger/50 text-danger bg-danger/10",
  };
  return <span className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[11px] font-medium ${tones[tone]}`}>{children}</span>;
}
