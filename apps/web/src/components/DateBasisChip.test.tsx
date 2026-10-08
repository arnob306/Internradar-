// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DateBasisChip } from "./DateBasisChip";

describe("DateBasisChip", () => {
  it.each([
    ["confirmed", "Confirmed"],
    ["estimated", "Estimated"],
    ["not-announced", "Not announced"],
  ] as const)("says %s in words", (basis, label) => {
    render(<DateBasisChip basis={basis} />);

    const chip = screen.getByText(label);
    expect(chip.closest("[data-basis]")?.getAttribute("data-basis")).toBe(basis);
  });

  it("draws its mark for the picture only, so the words carry the meaning", () => {
    const { container } = render(<DateBasisChip basis="estimated" />);

    const mark = container.querySelector("[data-basis] [aria-hidden='true']");
    expect(mark).not.toBeNull();
  });
});
