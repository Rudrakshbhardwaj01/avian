/** Discovery Lab — deterministic findings computed from the dataset, each
 *  with method, sample size, limitations, and a link into the workflow. */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { apiGet, downloadJson } from "../../lib/api";
import { Loading, MethodNote, PageHeader, Pill, Section } from "../../components/ui";
import { fmtNum } from "../../lib/theme";

interface Finding {
  id: string;
  category: string;
  title: string;
  explanation: string;
  evidence: Record<string, unknown>[];
  n: number;
  method: string;
  limitations: string;
  link: string;
}

export default function DiscoveryPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<{ count: number; findings: Finding[]; note: string; generatedFrom: { version: string; records: number } } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [category, setCategory] = useState<string>("all");

  useEffect(() => {
    apiGet<{ count: number; findings: Finding[]; note: string; generatedFrom: { version: string; records: number } }>("/api/discovery")
      .then(setData)
      .catch(() => undefined);
  }, []);

  if (!data) return <Loading label="Running deterministic detectors…" />;

  const categories = ["all", ...Array.from(new Set(data.findings.map((f) => f.category)))];
  const shown = category === "all" ? data.findings : data.findings.filter((f) => f.category === category);

  return (
    <div>
      <PageHeader
        title="Discovery Lab"
        subtitle="Deterministic detectors scan the dataset for patterns worth investigating. Every finding is backed by computation — open one to continue the analysis yourself."
      >
        <Pill tone="accent">{fmtNum(data.count)} findings · v{data.generatedFrom.version}</Pill>
        <button type="button" onClick={() => downloadJson("avian-discoveries.json", data)} className="rounded-sm border border-line bg-panel px-2.5 py-1.5 text-xs text-ink2 hover:border-accent">
          export all
        </button>
      </PageHeader>

      <div className="mb-4 flex flex-wrap gap-1">
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(c)}
            className={`rounded-sm px-3 py-1.5 text-sm capitalize ${category === c ? "bg-accent-soft font-medium text-accent-ink" : "text-ink2 hover:bg-panel2"}`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {shown.map((f) => (
          <Section key={f.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <Pill tone="accent">{f.category}</Pill>
                <h3 className="display mt-1.5 text-base font-semibold text-ink">{f.title}</h3>
              </div>
              <span className="tnum shrink-0 text-xs text-ink3">n = {fmtNum(f.n)}</span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-ink2">{f.explanation}</p>

            {open === f.id && (
              <div className="mt-3 space-y-2 border-t border-line pt-2">
                <div>
                  <div className="overline">Supporting evidence</div>
                  <div className="mt-1 max-h-44 overflow-auto rounded-sm border border-line">
                    <table className="w-full text-xs">
                      <tbody>
                        {f.evidence.map((row, i) => (
                          <tr key={i} className="border-b border-line last:border-0">
                            {Object.entries(row).map(([k, v]) => (
                              <td key={k} className="px-2 py-1 align-top">
                                <span className="text-ink3">{k}: </span>
                                <span className="tnum text-ink">{String(v)}</span>
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="text-xs text-ink2"><span className="overline">Method</span> {f.method}</div>
                <div className="text-xs text-ink2"><span className="overline">Limitations</span> {f.limitations}</div>
              </div>
            )}

            <div className="mt-3 flex items-center gap-3">
              <button type="button" onClick={() => setOpen(open === f.id ? null : f.id)} className="text-xs text-ink2 hover:text-accent hover:underline">
                {open === f.id ? "hide evidence" : "show evidence & method"}
              </button>
              <button
                type="button"
                onClick={() => {
                  navigate(f.link);
                }}
                className="ml-auto text-xs font-medium text-accent hover:underline"
              >
                open the analysis →
              </button>
            </div>
          </Section>
        ))}
      </div>

      <MethodNote>{data.note}</MethodNote>
    </div>
  );
}
