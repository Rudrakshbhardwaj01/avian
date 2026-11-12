/** Chart palettes mirroring styles/index.css tokens.
 *  CSS is the source of truth for the UI; these values feed Plotly layouts,
 *  which need concrete colors at draw time. Keep both sides in sync. */

export interface ChartPalette {
  paper: string;
  plot: string;
  ink: string;
  ink2: string;
  line: string;
  grid: string;
  accent: string;
  danger: string;
  warn: string;
  info: string;
  series: string[];
}

const LIGHT: ChartPalette = {
  paper: "#fcfbf7",
  plot: "#fcfbf7",
  ink: "#262420",
  ink2: "#6f6a5f",
  line: "#e2ded3",
  grid: "#e9e5db",
  accent: "#44684d",
  danger: "#b34f45",
  warn: "#b08d3e",
  info: "#2f6f74",
  series: [
    "#44684d", "#7c8b46", "#2f6f74", "#a8552f", "#8a6ea0",
    "#b08d3e", "#5a7ba2", "#94624a", "#686f4b", "#4e5d52",
  ],
};

const DARK: ChartPalette = {
  paper: "#1c1b16",
  plot: "#1c1b16",
  ink: "#e6e2d8",
  ink2: "#9a958a",
  line: "#34312a",
  grid: "#2a2822",
  accent: "#8db894",
  danger: "#c96357",
  warn: "#c9a95c",
  info: "#5fa8ae",
  series: [
    "#8db894", "#b5bf6a", "#5fa8ae", "#d07a4f", "#a98fc0",
    "#c9a95c", "#7f9dc2", "#b58267", "#8a9170", "#6f8276",
  ],
};

export function palette(dark: boolean): ChartPalette {
  return dark ? DARK : LIGHT;
}

/** Muted IUCN category colors; missing stays neutral grey. */
export const IUCN_COLORS_LIGHT: Record<string, string> = {
  LC: "#55945e", NT: "#a2a53f", VU: "#d19e3f", EN: "#cc7d3f", CR: "#b34f45",
  "CR (PE)": "#8f443c", "CR (PEW)": "#6f3730", EW: "#7c5c9e", EX: "#454440", DD: "#98938a",
};

export const IUCN_COLORS_DARK: Record<string, string> = {
  LC: "#6ea878", NT: "#b3b65a", VU: "#dfb356", EN: "#d98f55", CR: "#c96357",
  "CR (PE)": "#a95c53", "CR (PEW)": "#87443d", EW: "#9772b8", EX: "#6a6862", DD: "#a8a39a",
};

export function iucnColor(category: string | null | undefined, dark: boolean): string {
  if (!category) return dark ? "#5c594f" : "#a8a49b";
  const map = dark ? IUCN_COLORS_DARK : IUCN_COLORS_LIGHT;
  return map[category] ?? (dark ? "#6a6862" : "#98938a");
}

export const IUCN_LABELS: Record<string, string> = {
  LC: "Least Concern", NT: "Near Threatened", VU: "Vulnerable", EN: "Endangered",
  CR: "Critically Endangered", "CR (PE)": "Critically Endangered (Possibly Extinct)",
  "CR (PEW)": "CR (Possibly Extinct in the Wild)", EW: "Extinct in the Wild",
  EX: "Extinct", DD: "Data Deficient",
};

/** IOC breeding-region code labels (documented IOC 15.2 convention). */
export const REGION_LABELS: Record<string, string> = {
  AF: "Africa", AO: "Atlantic Ocean", AN: "Antarctica", AU: "Australasia",
  IO: "Indian Ocean", MA: "Middle America", NA: "North America",
  OR: "Oriental Region", PAL: "Palearctic Region", PO: "Pacific Ocean",
  SA: "South America", SO: "Southern Ocean", TrO: "Tropical Oceans",
  Worldwide: "Worldwide",
};

export function fmtNum(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  if (Number.isInteger(v)) return v.toLocaleString("en-US");
  return v.toLocaleString("en-US", { maximumFractionDigits: digits });
}

export function fmtSci(v: number | null | undefined, digits = 3): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return v.toFixed(digits);
}
