// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusChip, type WindowStatus } from "./StatusChip";

describe("StatusChip", () => {
  it.each<[WindowStatus, string]>([
    ["open", "Open"],
    ["upcoming", "Opening soon"],
    ["closed", "Closed"],
    ["unknown", "Dates not published"],
  ])("shows %s as the words %s, not only a colour", (status, label) => {
    render(<StatusChip status={status} />);

    expect(screen.getByText(label)).toBeTruthy();
  });

  it("pairs the words with an icon that screen readers skip", () => {
    const { container } = render(<StatusChip status="open" />);

    const icon = container.querySelector("svg");
    expect(icon).not.toBeNull();
    expect(icon?.getAttribute("aria-hidden")).toBe("true");
  });

  it("marks its status so the stylesheet can colour it", () => {
    const { container } = render(<StatusChip status="upcoming" />);

    expect(container.querySelector("[data-status='upcoming']")).not.toBeNull();
  });
});
