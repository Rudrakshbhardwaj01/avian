import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { displayName } from "./naming";
import { GlobalSearch } from "../components/GlobalSearch";

describe("English naming rules", () => {
  it("uses the English common name as primary identity", () => {
    expect(displayName({ id: "x", en: "Somali Ostrich", sci: "Struthio molybdophanes" })).toBe("Somali Ostrich");
  });

  it("falls back to the scientific name when no English name exists", () => {
    expect(displayName({ id: "x", en: null, sci: "Struthio molybdophanes" })).toBe("Struthio molybdophanes");
  });
});

describe("English-only UI", () => {
  it("global search renders without any language selector", () => {
    render(
      <MemoryRouter>
        <GlobalSearch />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByText(/display language/i)).not.toBeInTheDocument();
  });
});
