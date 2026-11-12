import { describe, expect, it } from "vitest";
import { filterHash } from "./filters";

describe("filterHash", () => {
  it("is stable regardless of key order", () => {
    expect(filterHash({ orders: ["A"], habitat: ["Forest"] })).toBe(filterHash({ habitat: ["Forest"], orders: ["A"] }));
  });

  it("distinguishes different filters", () => {
    expect(filterHash({ orders: ["A"] })).not.toBe(filterHash({ orders: ["B"] }));
  });

  it("returns a short string", () => {
    expect(filterHash({ q: "kestrel" })).toHaveLength(6);
  });
});
