// @vitest-environment jsdom
import type { CriterionResult, Verdict } from "@internradar/domain";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { EligibilityBadge } from "./EligibilityBadge";

const REASONS: CriterionResult[] = [
  { criterion: "citizenship", verdict: "eligible", code: "CITIZENSHIP_OK", params: {} },
  {
    criterion: "graduation_window",
    verdict: "unknown",
    code: "PROFILE_INCOMPLETE",
    params: { field: "expectedGraduation" },
  },
];

describe("EligibilityBadge", () => {
  it.each<[Verdict, string]>([
    ["eligible", "Eligible"],
    ["ineligible", "Not eligible"],
    ["unknown", "Check requirements"],
  ])("shows %s as the words %s, not only a colour", (verdict, label) => {
    render(<EligibilityBadge verdict={verdict} reasons={[]} />);

    expect(screen.getByText(label)).toBeTruthy();
  });

  it("pairs the words with an icon that screen readers skip", () => {
    const { container } = render(<EligibilityBadge verdict="eligible" reasons={[]} />);

    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("keeps the reasons hidden until the student asks for them", () => {
    render(<EligibilityBadge verdict="unknown" reasons={REASONS} />);

    const toggle = screen.getByRole("button", { name: /why/i });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Your citizenship or residency is accepted.")).toBeNull();
  });

  it("shows each reason in plain words when expanded", async () => {
    const user = userEvent.setup();
    render(<EligibilityBadge verdict="unknown" reasons={REASONS} />);

    await user.click(screen.getByRole("button", { name: /why/i }));

    expect(screen.getByRole("button", { name: /why/i }).getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Your citizenship or residency is accepted.")).toBeTruthy();
    expect(
      screen.getByText("Add expected graduation to your profile so we can check this."),
    ).toBeTruthy();
  });

  it("names the program in its toggle, so several badges on a page are told apart", () => {
    render(<EligibilityBadge verdict="unknown" reasons={REASONS} subject="EY Graduate Program" />);

    expect(screen.getByRole("button", { name: "Why: EY Graduate Program?" })).toBeTruthy();
  });

  it("collapses again on a second click", async () => {
    const user = userEvent.setup();
    render(<EligibilityBadge verdict="unknown" reasons={REASONS} />);
    const toggle = screen.getByRole("button", { name: /why/i });

    await user.click(toggle);
    await user.click(toggle);

    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Your citizenship or residency is accepted.")).toBeNull();
  });

  it("has no toggle when there are no reasons to show", () => {
    render(<EligibilityBadge verdict="unknown" reasons={[]} />);

    expect(screen.queryByRole("button")).toBeNull();
  });
});
