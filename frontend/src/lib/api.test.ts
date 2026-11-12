import { describe, expect, it } from "vitest";
import { filtersToParams } from "./api";
import { type Filters } from "../types";

describe("filtersToParams", () => {
  it("serializes list filters as comma-separated values", () => {
    const f: Filters = { orders: ["Passeriformes", "Apodiformes"], iucn: ["VU", "EN"] };
    const p = filtersToParams(f);
    expect(p.get("orders")).toBe("Passeriformes,Apodiformes");
    expect(p.get("iucn")).toBe("VU,EN");
  });

  it("omits empty lists and flags", () => {
    const p = filtersToParams({});
    expect(p.toString()).toBe("");
  });

  it("sets boolean flags when true", () => {
    const p = filtersToParams({ excludeImputed: true, traitsOnly: true });
    expect(p.get("excludeImputed")).toBe("true");
    expect(p.get("traitsOnly")).toBe("true");
    expect(p.get("conservationOnly")).toBeNull();
  });

  it("passes q through", () => {
    const p = filtersToParams({ q: "Somali Ostrich" });
    expect(p.get("q")).toBe("Somali Ostrich");
  });
});
