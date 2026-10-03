// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PublicProgram } from "../server/programs/programs-handler";
import { ProgramCard } from "./ProgramCard";

function program(overrides: Partial<PublicProgram> = {}): PublicProgram {
  return {
    id: "7f0e6a3e-0000-4000-8000-000000000001",
    slug: "graduate-program",
    name: "EY Graduate Program",
    programType: "graduate",
    cities: ["melbourne"],
    disciplines: [],
    sourceUrl: "https://www.ey.com/en_au/careers/2027-graduate-program-student-opportunities",
    company: { slug: "ey-australia", name: "EY Australia", careersUrl: "https://www.ey.com" },
    status: "open",
    windows: [],
    rulesVerified: true,
    ...overrides,
  };
}

describe("ProgramCard", () => {
  it("shows the employer, the program and its type in words", () => {
    render(<ProgramCard program={program()} />);

    expect(screen.getByText("EY Australia")).toBeTruthy();
    expect(screen.getByText("EY Graduate Program")).toBeTruthy();
    expect(screen.getByText("Graduate")).toBeTruthy();
  });

  it.each([
    ["internship", "Internship"],
    ["vacationer", "Vacationer"],
    ["graduate", "Graduate"],
    ["cadetship", "Cadetship"],
    ["discovery", "Discovery"],
  ] as const)("labels %s as %s", (programType, label) => {
    render(<ProgramCard program={program({ programType })} />);

    expect(screen.getByText(label)).toBeTruthy();
  });

  it("shows whether applications are open, as words", () => {
    render(<ProgramCard program={program({ status: "upcoming" })} />);

    expect(screen.getByText("Opening soon")).toBeTruthy();
  });

  it("links to the program's own page", () => {
    render(<ProgramCard program={program()} />);

    const link = screen.getByRole("link", { name: /EY Graduate Program/ });
    expect(link.getAttribute("href")).toBe("/programs/ey-australia/graduate-program");
  });

  it("escapes slugs in the link, so an odd slug can never change the path", () => {
    render(
      <ProgramCard
        program={program({
          slug: "a b/c?d",
          company: { slug: "x y", name: "Odd Co", careersUrl: "https://example.com" },
        })}
      />,
    );

    expect(screen.getByRole("link", { name: /EY Graduate Program/ }).getAttribute("href")).toBe(
      "/programs/x%20y/a%20b%2Fc%3Fd",
    );
  });

  it("tells screen-reader users which program an eligibility toggle belongs to", () => {
    render(
      <ProgramCard
        program={program()}
        eligibility={{
          verdict: "unknown",
          reasons: [
            { criterion: "citizenship", verdict: "eligible", code: "CITIZENSHIP_OK", params: {} },
          ],
        }}
      />,
    );

    expect(screen.getByRole("button", { name: "Why? for EY Graduate Program" })).toBeTruthy();
  });

  it("describes the application window in plain words, flagging an estimate", () => {
    render(
      <ProgramCard
        program={program({
          status: "unknown",
          windows: [
            {
              cycleYear: 2027,
              windowSeq: 1,
              opensOn: "2026-07-01",
              opensPrecision: "estimated",
              closesOn: "2026-08-01",
              closesPrecision: "estimated",
              programStartsOn: null,
              programEndsOn: null,
              status: "unknown",
              sourceUrl: "https://example.com",
            },
          ],
        })}
      />,
    );

    expect(screen.getByText(/Usually Jul to Aug/)).toBeTruthy();
    expect(screen.getByText("estimated")).toBeTruthy();
  });

  it("asks a visitor to sign in rather than guessing at their eligibility", () => {
    render(<ProgramCard program={program()} />);

    expect(screen.getByText("Sign in to check if you're eligible.")).toBeTruthy();
  });

  it("shows the eligibility badge once a verdict is known", () => {
    render(
      <ProgramCard
        program={program()}
        eligibility={{
          verdict: "eligible",
          reasons: [
            { criterion: "citizenship", verdict: "eligible", code: "CITIZENSHIP_OK", params: {} },
          ],
        }}
      />,
    );

    expect(screen.getByText("Eligible")).toBeTruthy();
    expect(screen.queryByText("Sign in to check if you're eligible.")).toBeNull();
  });
});
