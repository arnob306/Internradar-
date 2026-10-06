// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProgramListItem } from "../../../../server/programs/list-programs";

const getProgram = vi.fn();
const viewerFor = vi.fn();
const logFailure = vi.fn();
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("next/navigation", () => ({ notFound: () => notFound() }));
vi.mock("../../../../server/log", () => ({ logFailure: (...args: unknown[]) => logFailure(...args) }));
vi.mock("../../../../server/auth/request-session", () => ({
  sessionClientForRequest: () => Promise.resolve({ marker: "session-client" }),
}));
vi.mock("../../../../server/programs/list-programs", () => ({
  getProgram: (...args: unknown[]) => getProgram(...args),
}));
vi.mock("../../../../server/programs/viewer", () => ({ viewerFor: (...args: unknown[]) => viewerFor(...args) }));

import ProgramPage, { generateMetadata } from "./page";

function item(overrides: Partial<ProgramListItem> = {}): ProgramListItem {
  return {
    id: "p1",
    slug: "graduate-program",
    name: "EY Graduate Program",
    programType: "graduate",
    cities: ["melbourne"],
    disciplines: [],
    sourceUrl: "https://www.ey.com/en_au/careers/2027-graduate-program-student-opportunities",
    company: { slug: "ey-australia", name: "EY Australia", careersUrl: "https://www.ey.com" },
    status: "open",
    windows: [],
    eligibilityRules: { schemaVersion: 1 },
    rulesVerified: true,
    rulesVersion: 1,
    ...overrides,
  };
}

const params = (company = "ey-australia", program = "graduate-program") => ({
  params: Promise.resolve({ company, program }),
});

beforeEach(() => {
  // 14:00 UTC on 3 Oct is already 4 Oct in Melbourne.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-03T14:00:00Z"));
  getProgram.mockReset().mockResolvedValue(item());
  viewerFor.mockReset().mockResolvedValue({ prompt: "sign-in" });
  logFailure.mockReset();
  notFound.mockClear();
});

describe("the program page", () => {
  it("shows the program, looked up by both slugs and today's Melbourne date, as whoever is asking", async () => {
    render(await ProgramPage(params()));

    expect(screen.getByRole("heading", { level: 1, name: "EY Graduate Program" })).toBeTruthy();
    expect(getProgram).toHaveBeenCalledExactlyOnceWith(
      { marker: "session-client" },
      "ey-australia",
      "graduate-program",
      "2026-10-04",
    );
  });

  it("decodes the path segments before asking", async () => {
    render(await ProgramPage(params("ey%2Daustralia", "graduate%2Dprogram")));

    expect(getProgram.mock.calls[0]?.slice(1, 3)).toEqual(["ey-australia", "graduate-program"]);
  });

  it.each([
    ["an invalid employer", params("a%2Fb")],
    ["an invalid program", params("ey-australia", "..")],
    ["an over-long employer", params("a".repeat(81))],
  ])("is a 404 for %s, without asking the database", async (_name, input) => {
    await expect(ProgramPage(input)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(getProgram).not.toHaveBeenCalled();
  });

  it("is a 404 when there is no such published program", async () => {
    getProgram.mockResolvedValue(null);

    await expect(ProgramPage(params())).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("gives the student their own answer for this program, and nobody else's", async () => {
    viewerFor.mockResolvedValue({
      prompt: "profile",
      eligibility: {
        p1: { verdict: "eligible", reasons: [{ criterion: "citizenship", verdict: "eligible", code: "CITIZENSHIP_OK", params: {} }] },
        other: { verdict: "ineligible", reasons: [] },
      },
    });

    render(await ProgramPage(params()));

    expect(screen.getByText("Eligible")).toBeTruthy();
    expect(screen.queryByText("Not eligible")).toBeNull();
    expect(viewerFor.mock.calls[0]?.[1]).toEqual([expect.objectContaining({ id: "p1" })]);
  });

  it("asks a visitor to sign in, returning to this page", async () => {
    render(await ProgramPage(params()));

    expect(screen.getByRole("link", { name: "Sign in to check if you're eligible." }).getAttribute("href")).toBe(
      `/login?next=${encodeURIComponent("/programs/ey-australia/graduate-program")}`,
    );
  });

  it("asks a student with no profile to add one", async () => {
    viewerFor.mockResolvedValue({ prompt: "profile" });

    render(await ProgramPage(params()));

    expect(screen.getByRole("link", { name: "Add your profile to check if you're eligible." })).toBeTruthy();
  });

  it("never sends the raw eligibility rules to the page", async () => {
    getProgram.mockResolvedValue(item({ eligibilityRules: { schemaVersion: 1, secret: "internal" } }));

    render(await ProgramPage(params()));

    expect(document.body.textContent).not.toContain("internal");
  });

  it("shows a calm message, not a 404, and logs safely, when the program cannot be loaded", async () => {
    const failure = new Error("connection refused");
    getProgram.mockRejectedValue(failure);

    render(await ProgramPage(params()));

    expect(screen.getByText(/couldn.t load this program right now/i)).toBeTruthy();
    expect(notFound).not.toHaveBeenCalled();
    expect(logFailure).toHaveBeenCalledExactlyOnceWith("page.program.load", failure);
    expect(document.body.textContent).not.toContain("connection refused");
  });
});

describe("the program page's title", () => {
  it("names the program and the employer", async () => {
    expect(await generateMetadata(params())).toEqual({ title: "EY Graduate Program at EY Australia" });
  });

  it.each([
    ["an unknown program", () => getProgram.mockResolvedValue(null), params()],
    ["an invalid slug", () => undefined, params("a%2Fb")],
    ["a failed lookup", () => getProgram.mockRejectedValue(new Error("down")), params()],
  ])("is neutral for %s, and never throws", async (_name, arrange, input) => {
    arrange();

    expect(await generateMetadata(input)).toEqual({ title: "Program" });
  });
});
