/** Plotly wrapper: lazy-loads plotly.js-dist-min once and re-renders on
 *  data/layout/theme changes. Keeps chart styling consistent with the app. */
import { useEffect, useMemo, useRef, useState } from "react";
import type { Config, Data, Layout } from "plotly.js-dist-min";
import { palette } from "../lib/theme";
import { useApp } from "../state/store";

type PlotlyModule = typeof import("plotly.js-dist-min");

let plotlyPromise: Promise<PlotlyModule> | null = null;
function getPlotly(): Promise<PlotlyModule> {
  if (!plotlyPromise) {
    plotlyPromise = import("plotly.js-dist-min").then((m) => (m as unknown as { default: PlotlyModule }).default ?? m);
  }
  return plotlyPromise;
}

export function baseLayout(dark: boolean, extra: Partial<Layout> = {}): Partial<Layout> {
  const p = palette(dark);
  return {
    paper_bgcolor: p.paper,
    plot_bgcolor: p.plot,
    font: { family: "Inter Variable, Inter, sans-serif", color: p.ink, size: 12.5 },
    margin: { l: 58, r: 24, t: 36, b: 48 },
    xaxis: { gridcolor: p.grid, zerolinecolor: p.grid, automargin: true, ...(extra.xaxis ?? {}) },
    yaxis: { gridcolor: p.grid, zerolinecolor: p.grid, automargin: true, ...(extra.yaxis ?? {}) },
    legend: { bgcolor: "rgba(0,0,0,0)", font: { size: 11.5 } },
    hoverlabel: { bgcolor: dark ? "#242219" : "#f6f4ef", bordercolor: p.line, font: { size: 12 } },
    ...extra,
  };
}

export function baseConfig(): Partial<Config> {
  return {
    responsive: true,
    displaylogo: false,
    modeBarButtonsToRemove: ["lasso2d", "select2d", "toggleSpikelines"],
  };
}

interface PlotProps {
  data: Data[];
  layout?: Partial<Layout>;
  height?: number;
  className?: string;
  onClick?: (event: unknown) => void;
  onSelected?: (event: unknown) => void;
}

/** divs hosting a plot gain plotly event methods once drawn. */
interface PlotlyDivElement extends HTMLDivElement {
  removeAllListeners?: (event: string) => void;
  on?: (event: string, handler: (e: unknown) => void) => void;
}

export function Plot({ data, layout, height = 360, className, onClick, onSelected }: PlotProps) {
  const ref = useRef<PlotlyDivElement>(null);
  const [ready, setReady] = useState(false);
  const theme = useApp((s) => s.theme);
  const dark = theme === "dark";

  const merged = useMemo(() => baseLayout(dark, layout ?? {}), [dark, layout]);

  useEffect(() => {
    let disposed = false;
    getPlotly().then((Plotly) => {
      if (disposed || !ref.current) return;
      setReady(true);
      Plotly.react(ref.current, data, merged, baseConfig());
      ref.current.removeAllListeners?.("plotly_click");
      ref.current.removeAllListeners?.("plotly_selected");
      if (onClick) ref.current.on?.("plotly_click", onClick);
      if (onSelected) ref.current.on?.("plotly_selected", onSelected);
    });
    return () => {
      disposed = true;
    };
  }, [data, merged, onClick, onSelected]);

  // explicit resize so charts track their container
  useEffect(() => {
    if (!ready) return;
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (!el.isConnected) return; // chart unmounted; resize would throw
      getPlotly().then((Plotly) => Plotly.Plots.resize(el)).catch(() => undefined);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ready]);

  return (
    <div className={className} style={{ height }}>
      <div ref={ref} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}
