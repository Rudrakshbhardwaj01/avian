/** Regression test: /api/meta returns `sourceLanguageCount` (a number), not a
 *  `languages` array — AboutPage must render from that contract without crashing. */
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AboutPage from "./AboutPage";

const metaResponse = {
  dataset: { version: "v2026", taxonomy: "AviList", declaredCount: 11011, actualCount: 11011, countMatches: true },
  sourceLanguageCount: 46,
  facetOptions: {},
  iucnSequence: ["LC"],
};

const reportResponse = {
  recordCount: 11011,
  coverage: [{ domain: "identity", fields: "id", n: 11011, pct: 100 }],
  concerns: ["some known limitation"],
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const body = url.includes("/api/meta") ? metaResponse : reportResponse;
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }));
});

describe("AboutPage", () => {
  it("renders dataset stats from the /api/meta contract without crashing", async () => {
    render(<AboutPage />);
    await waitFor(() => expect(screen.getByText("About the Dataset")).toBeInTheDocument());
    // regression: previously `meta.languages.length` on an undefined array
    expect(screen.getAllByText("46").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/46 language codes/).length).toBeGreaterThan(0);
  });
});
