import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { IucnBadge, Missing, Pill } from "./ui";

describe("IucnBadge", () => {
  it("renders the original category code", () => {
    render(<IucnBadge category="VU" />);
    expect(screen.getByText("VU")).toBeInTheDocument();
  });

  it("renders an explicit 'not assessed' for missing category", () => {
    render(<IucnBadge category={null} />);
    expect(screen.getByText(/not assessed/i)).toBeInTheDocument();
  });

  it("renders missing as neutral text, without a categorical fill", () => {
    const { container } = render(<IucnBadge category={null} />);
    const span = container.querySelector("span");
    expect(span?.className).not.toContain("font-semibold");
    expect(span?.style.background).toBe(""); // no category color applied
  });
});

describe("small primitives", () => {
  it("Missing renders a visible marker", () => {
    render(<Missing>no data</Missing>);
    expect(screen.getByText("no data")).toBeInTheDocument();
  });

  it("Pill accepts tone classes", () => {
    render(<Pill tone="warn">flagged</Pill>);
    expect(screen.getByText("flagged").className).toContain("border-warn");
  });
});
