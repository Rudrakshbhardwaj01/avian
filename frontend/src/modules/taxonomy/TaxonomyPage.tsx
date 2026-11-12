/** Module 3 — Taxonomy Lab: richness across levels, treemap/sunburst,
 *  drill-down explorer, size distributions. */
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import type { Data } from "plotly.js-dist-min";
import { apiGet } from "../../lib/api";
import { useMeta } from "../../hooks/useMeta";
import { FilterBar } from "../../components/FilterBar";
import { EmptyState, Loading, MethodNote, PageHeader, Section, StatTile } from "../../components/ui";
import { Plot, baseLayout } from "../../components/Plot";
import { fmtNum, palette } from "../../lib/theme";
import { useApp } from "../../state/store";

interface OrdersResponse {
  nSpecies: number;
  orders: { order: string; species: number; families: number; genera: number; withTraits: number; withIucn: number }[];
}
interface FamiliesResponse {
  nSpecies: number;
  families: { order: string; family: string; familyEnglish: string | null; species: number; genera: number; withTraits: number; withIucn: number }[];
}
interface GeneraResponse {
  nSpecies: number;
  genera: { genus: string; family: string; order: string; species: number; withTraits: number; withIucn: number }[];
}
interface SpeciesOfResponse {
  nSpecies: number;
  species: { id: string; en: string | null; sci: string; genus: string; family: string; order: string; seq: number; iucn: string | null }[];
}
interface SizeDist {
  orderSizes: { size: number; count: number }[];
  familySizes: { size: number; count: number }[];
  genusSizes: { size: number; count: number }[];
  largestFamilies: { family: string; familyEnglish: string | null; order: string; species: number }[];
  smallestFamilies: { family: string; familyEnglish: string | null; order: string; species: number }[];
  largestGenera: { genus: string; family: string; species: number }[];
}

export default function TaxonomyPage() {
  const meta = useMeta();
  const dark = useApp((s) => s.theme === "dark");
  const p = palette(dark);
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [view, setView] = useState<"treemap" | "sunburst" | "drilldown" | "distributions">(
    () => (params.get("level") ? "drilldown" : "treemap"),
  );

  const [orders, setOrders] = useState<OrdersResponse | null>(null);
  const [drill, setDrill] = useState<{ order?: string; family?: string; genus?: string }>({});
  const [families, setFamilies] = useState<FamiliesResponse | null>(null);
  const [genera, setGenera] = useState<GeneraResponse | null>(null);
  const [species, setSpecies] = useState<SpeciesOfResponse | null>(null);
  const [sizes, setSizes] = useState<SizeDist | null>(null);

  useEffect(() => {
    apiGet<OrdersResponse>("/api/taxonomy/orders").then(setOrders).catch(() => undefined);
    apiGet<SizeDist>("/api/taxonomy/size-distributions").then(setSizes).catch(() => undefined);
  }, []);

  useEffect(() => {
    apiGet<FamiliesResponse>("/api/taxonomy/families", drill.order ? { order: drill.order } : undefined).then(setFamilies).catch(() => undefined);
  }, [drill.order]);

  useEffect(() => {
    apiGet<GeneraResponse>("/api/taxonomy/genera", drill.family ? { family: drill.family } : undefined).then(setGenera).catch(() => undefined);
  }, [drill.family]);

  useEffect(() => {
    apiGet<SpeciesOfResponse>("/api/taxonomy/species", drill.genus ? { genus: drill.genus } : undefined).then(setSpecies).catch(() => undefined);
  }, [drill.genus]);

  const openSpecies = useCallback((id: string) => navigate(`/species/${id}`), [navigate]);

  const treemapData: Data[] = orders ? [
    {
      type: "treemap",
      labels: orders.orders.map((o) => `${o.order}\n${fmtNum(o.species)} sp · ${o.families} fam`),
      parents: orders.orders.map(() => ""),
      values: orders.orders.map((o) => o.species),
      texttemplate: "%{label}",
      hovertemplate: "%{label}<extra></extra>",
      marker: { colors: orders.orders.map((_, i) => p.series[i % p.series.length]), line: { width: 0.5, color: p.paper } },
      branchvalues: "remainder",
    },
  ] : [];

  const sunburstData: Data[] = orders ? [
    {
      type: "sunburst",
      labels: ["Aves", ...orders.orders.map((o) => o.order)],
      parents: ["", ...orders.orders.map(() => "Aves")],
      values: [orders.nSpecies, ...orders.orders.map((o) => o.species)],
      branchvalues: "total",
      insidetextorientation: "radial",
      marker: { line: { width: 0.5, color: p.paper } },
      hovertemplate: "%{label}: %{value:,} species<extra></extra>",
    } as unknown as Data,
  ] : [];

  return (
    <div>
      <PageHeader
        title="Taxonomy Lab"
        subtitle="Species richness across Order → Family → Genus → Species under the AviList v2026 sequence. Counts are species in the checklist, not observations or abundances."
      />

      <Section className="mb-4">
        <FilterBar meta={meta} />
      </Section>

      <div className="mb-4 flex gap-1">
        {(["treemap", "sunburst", "drilldown", "distributions"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={`rounded-sm px-3 py-1.5 text-sm capitalize ${view === v ? "bg-accent-soft font-medium text-accent-ink" : "text-ink2 hover:bg-panel2"}`}
          >
            {v === "distributions" ? "size distributions" : v}
          </button>
        ))}
      </div>

      {view === "treemap" && (
        <div className="grid grid-cols-1 gap-4">
          <Section title="Species by order (treemap; area ∝ species)">
            {orders ? (
              <>
                <Plot height={480} data={treemapData} layout={{ ...baseLayout(dark), margin: { l: 0, r: 0, t: 0, b: 0 } }} />
                <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
                  <StatTile label="Total species" value={fmtNum(orders.nSpecies)} />
                  <StatTile label="Orders" value={fmtNum(orders.orders.length)} />
                </div>
                <MethodNote>
                  Passeriformes (perching birds) dominates — click any block to filter the Explorer. The treemap uses the dataset's own order counts.
                </MethodNote>
              </>
            ) : <Loading />}
          </Section>
        </div>
      )}

      {view === "sunburst" && (
        <Section title="Order → species hierarchy (sunburst)">
          {orders ? <Plot height={560} data={sunburstData} layout={{ ...baseLayout(dark), margin: { l: 0, r: 0, t: 0, b: 0 } }} /> : <Loading />}
        </Section>
      )}

      {view === "drilldown" && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Section title="1 · Orders" aside={drill.order && <button className="text-xs text-accent hover:underline" type="button" onClick={() => { setDrill({}); }}>clear order</button>}>
            {orders ? (
              <div className="max-h-80 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-line"><th className="overline px-2 py-1">Order</th><th className="overline px-2 py-1 text-right">Species</th><th className="overline px-2 py-1 text-right">Families</th><th className="overline px-2 py-1 text-right">Genera</th></tr></thead>
                  <tbody>
                    {orders.orders.map((o) => (
                      <tr
                        key={o.order}
                        onClick={() => setDrill({ order: o.order })}
                        className={`cursor-pointer border-b border-line hover:bg-panel2 ${drill.order === o.order ? "bg-accent-soft" : ""}`}
                      >
                        <td className="px-2 py-1 font-medium text-ink">{o.order}</td>
                        <td className="tnum px-2 py-1 text-right">{fmtNum(o.species)}</td>
                        <td className="tnum px-2 py-1 text-right text-ink2">{o.families}</td>
                        <td className="tnum px-2 py-1 text-right text-ink2">{o.genera}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <Loading />}
          </Section>

          <Section title="2 · Families" aside={drill.family && <button className="text-xs text-accent hover:underline" type="button" onClick={() => setDrill({ ...drill, family: undefined, genus: undefined })}>clear family</button>}>
            {families ? (
              families.families.length === 0 ? <EmptyState title="Select an order" /> : (
                <div className="max-h-80 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-line"><th className="overline px-2 py-1">Family</th><th className="overline px-2 py-1 text-right">Species</th><th className="overline px-2 py-1 text-right">Genera</th></tr></thead>
                    <tbody>
                      {families.families.map((f) => (
                        <tr
                          key={f.family}
                          onClick={() => setDrill({ ...drill, family: f.family, genus: undefined })}
                          className={`cursor-pointer border-b border-line hover:bg-panel2 ${drill.family === f.family ? "bg-accent-soft" : ""}`}
                        >
                          <td className="px-2 py-1">{f.family} <span className="text-xs text-ink2">— {f.familyEnglish}</span></td>
                          <td className="tnum px-2 py-1 text-right">{fmtNum(f.species)}</td>
                          <td className="tnum px-2 py-1 text-right text-ink2">{f.genera}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : <Loading />}
          </Section>

          <Section title="3 · Genera">
            {genera ? (
              genera.genera.length === 0 ? <EmptyState title="Select a family" /> : (
                <div className="max-h-80 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-line"><th className="overline px-2 py-1">Genus</th><th className="overline px-2 py-1 text-right">Species</th></tr></thead>
                    <tbody>
                      {genera.genera.map((g) => (
                        <tr
                          key={g.genus}
                          onClick={() => setDrill({ ...drill, genus: g.genus })}
                          className={`cursor-pointer border-b border-line hover:bg-panel2 ${drill.genus === g.genus ? "bg-accent-soft" : ""}`}
                        >
                          <td className="px-2 py-1 italic">{g.genus} <span className="text-xs not-italic text-ink2">· {g.family}</span></td>
                          <td className="tnum px-2 py-1 text-right">{fmtNum(g.species)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : <Loading />}
          </Section>

          <Section title="4 · Species" aside={<span className="tnum text-xs text-ink3">{species ? `${fmtNum(species.nSpecies)} species` : ""}</span>}>
            {species ? (
              species.species.length === 0 ? <EmptyState title="Select a genus (or view all under current filters)" /> : (
                <div className="max-h-80 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-line"><th className="overline px-2 py-1">Species</th><th className="overline px-2 py-1">IUCN</th></tr></thead>
                    <tbody>
                      {species.species.map((sp) => (
                        <tr key={sp.id} onClick={() => openSpecies(sp.id)} className="cursor-pointer border-b border-line hover:bg-panel2">
                          <td className="px-2 py-1">{sp.en ?? sp.sci} <span className="tnum text-xs italic text-ink2">{sp.sci}</span></td>
                          <td className="px-2 py-1 text-xs text-ink2">{sp.iucn ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : <Loading />}
          </Section>
        </div>
      )}

      {view === "distributions" && sizes && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Section title="Distribution of family sizes (species per family)">
            <Plot
              height={300}
              data={[{
                type: "bar",
                x: sizes.familySizes.slice(0, 30).map((d) => d.size),
                y: sizes.familySizes.slice(0, 30).map((d) => d.count),
                marker: { color: p.accent },
                hovertemplate: "families with %{x} species: %{y}<extra></extra>",
              }]}
              layout={{ ...baseLayout(dark), xaxis: { title: { text: "species per family (capped at 30)" } }, yaxis: { title: { text: "number of families" } } }}
            />
            <MethodNote>Strongly right-skewed: many small families, a few very large ones — a classic hollow-curve shape of taxonomic richness.</MethodNote>
          </Section>
          <Section title="Distribution of genus sizes (species per genus)">
            <Plot
              height={300}
              data={[{
                type: "bar",
                x: sizes.genusSizes.slice(0, 30).map((d) => d.size),
                y: sizes.genusSizes.slice(0, 30).map((d) => d.count),
                marker: { color: p.info },
                hovertemplate: "genera with %{x} species: %{y}<extra></extra>",
              }]}
              layout={{ ...baseLayout(dark), xaxis: { title: { text: "species per genus (capped at 30)" } }, yaxis: { title: { text: "number of genera" } } }}
            />
          </Section>
          <Section title="Largest families">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-line"><th className="overline px-2 py-1">Family</th><th className="overline px-2 py-1">Order</th><th className="overline px-2 py-1 text-right">Species</th></tr></thead>
              <tbody>
                {sizes.largestFamilies.map((f) => (
                  <tr key={f.family} className="border-b border-line">
                    <td className="px-2 py-1">{f.family} <span className="text-xs text-ink2">— {f.familyEnglish}</span></td>
                    <td className="px-2 py-1 text-ink2">{f.order}</td>
                    <td className="tnum px-2 py-1 text-right">{fmtNum(f.species)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
          <Section title="Largest genera & smallest families">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-line"><th className="overline px-2 py-1">Genus</th><th className="overline px-2 py-1 text-right">Species</th></tr></thead>
              <tbody>
                {sizes.largestGenera.map((g) => (
                  <tr key={g.genus} className="border-b border-line">
                    <td className="px-2 py-1 italic">{g.genus} <span className="text-xs not-italic text-ink2">· {g.family}</span></td>
                    <td className="tnum px-2 py-1 text-right">{fmtNum(g.species)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 overline">Smallest families (monotypic are common)</div>
            <div className="mt-1 text-xs text-ink2">
              {sizes.smallestFamilies.map((f) => `${f.family} (${f.species})`).join(" · ")}
            </div>
          </Section>
        </div>
      )}
    </div>
  );
}
