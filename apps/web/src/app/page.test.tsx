// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProgramListItem } from "../server/programs/list-programs";

const listPrograms = vi.fn();
const logFailure = vi.fn();
vi.mock("../server/log", () => ({ logFailure: (...args: unknown[]) => logFailure(...args) }));
vi.mock("../server/programs/list-programs", () => ({ listPrograms: (...args: unknown[]) => listPrograms(...args) }));
const getUser = vi.fn();
const loadProfile = vi.fn();
vi.mock("../server/auth/request-session", () => ({
  sessionClientForRequest: () => Promise.resolve({ marker: "session-client", auth: { getUser } }),
}));
vi.mock("../server/profile/profile-repo", () => ({ loadProfile: (...args: unknown[]) => loadProfile(...args) }));

import HomePage from "./page";

function item(name: string): ProgramListItem {
  return {
    id: name,
    slug: name.toLowerCase(),
    name,
    programType: "graduate",
    cities: ["melbourne"],
    disciplines: [],
    sourceUrl: "https://example.com/x",
    company: { slug: "example-co", name: "Example Co", careersUrl: "https://example.com" },
    status: "open",
    windows: [],
    eligibilityRules: { schemaVersion: 1 },
    rulesVerified: false,
    rulesVersion: 1,
  };
}

async function show(params: Record<string, string | string[] | undefined> = {}) {
  render(await HomePage({ searchParams: Promise.resolve(params) }));
}

beforeEach(() => {
  // 14:00 UTC on 3 Oct is already 4 Oct in Melbourne.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-03T14:00:00Z"));
  listPrograms.mockReset();
  logFailure.mockReset();
  getUser.mockReset().mockResolvedValue({ data: { user: null } });
  loadProfile.mockReset().mockResolvedValue(null);
  listPrograms.mockResolvedValue({ items: [item("Alpha"), item("Beta")], total: 2 });
});
afterEach(() => vi.useRealTimers());

const STUDENT = {
  expectedGraduation: { year: 2026, month: 11 },
  degreeLevel: "undergraduate",
  disciplines: ["computer_science"],
  isDoubleDegree: false,
  planningHonours: false,
  citizenship: "au_citizen",
  university: null,
  emailAlerts: true,
};

describe("eligibility on the home page", () => {
  it("asks a visitor to sign in, and never loads a profile for them", async () => {
    await show();

    expect(screen.getAllByRole("link", { name: "Sign in to check if you're eligible." })).toHaveLength(2);
    expect(loadProfile).not.toHaveBeenCalled();
  });

  it("asks a signed-in student with no profile to add one", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });

    await show();

    expect(screen.getAllByRole("link", { name: "Add your profile to check if you're eligible." })).toHaveLength(2);
    expect(screen.queryByText(/Sign in to check/)).toBeNull();
  });

  it("shows each program's answer to a signed-in student with a profile", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    loadProfile.mockResolvedValue(STUDENT);
    listPrograms.mockResolvedValue({
      items: [
        { ...item("Alpha"), rulesVerified: true, eligibilityRules: { schemaVersion: 1, citizenship: { allowed: ["au_citizen"] } } },
        { ...item("Beta"), rulesVerified: false },
      ],
      total: 2,
    });

    await show();

    expect(screen.getByText("Eligible")).toBeTruthy();
    expect(screen.getByText("Check requirements")).toBeTruthy();
    expect(screen.queryByText(/to check if you're eligible/)).toBeNull();
  });

  it("still shows the programs, and records the failure safely, if the profile cannot be loaded", async () => {
    const failure = new Error("connection refused");
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    loadProfile.mockRejectedValue(failure);

    await show();

    expect(screen.getByRole("link", { name: /Alpha/ })).toBeTruthy();
    expect(logFailure).toHaveBeenCalledExactlyOnceWith("page.home.profile", failure);
  });

  it("does not trust a session lookup that fails: the page loads as for a visitor", async () => {
    getUser.mockRejectedValue(new Error("auth down"));

    await show();

    expect(screen.getByRole("link", { name: /Alpha/ })).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "Sign in to check if you're eligible." })).toHaveLength(2);
  });
});

describe("the home page", () => {
  it("shows the feed from the data layer", async () => {
    await show();

    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("checked against you");
    expect(screen.getByRole("link", { name: /Alpha/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Beta/ })).toBeTruthy();
    expect(screen.getByText("2 programs")).toBeTruthy();
  });

  it("asks the data layer with the parsed filters and today's Melbourne date, as a visitor", async () => {
    await show({ type: "graduate", openNow: "true", limit: "5" });

    expect(listPrograms).toHaveBeenCalledWith(
      { marker: "session-client", auth: { getUser } },
      { limit: 5, offset: 0, type: "graduate", discipline: undefined, openNow: true },
      "2026-10-04",
    );
  });

  it("ignores filters that are not valid, says so, and still shows the programs", async () => {
    await show({ limit: "0", sort: "name" });

    expect(screen.getByText(/weren.t valid, so they were ignored/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Alpha/ })).toBeTruthy();
    expect(listPrograms).toHaveBeenCalledWith(
      expect.anything(),
      { limit: 20, offset: 0, type: undefined, discipline: undefined, openNow: false },
      "2026-10-04",
    );
  });

  it("treats a filter given twice as invalid rather than picking one", async () => {
    await show({ type: ["graduate", "vacationer"] });

    expect(screen.getByText(/weren.t valid, so they were ignored/)).toBeTruthy();
  });

  it("says nothing about filters when they are fine", async () => {
    await show({ type: "graduate" });

    expect(screen.queryByText(/weren.t valid/)).toBeNull();
  });

  it("shows a calm message, and no internals, when the data layer fails", async () => {
    listPrograms.mockRejectedValue(new Error('relation "public.programs" does not exist'));

    await show();

    expect(screen.getByText(/couldn.t load programs right now/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/relation|public\.programs|does not exist/);
    expect(screen.queryByRole("link", { name: /Alpha/ })).toBeNull();
  });

  it("records the failure on the server, so an outage is not silent", async () => {
    const failure = new Error("connection refused");
    listPrograms.mockRejectedValue(failure);

    await show();

    expect(logFailure).toHaveBeenCalledExactlyOnceWith("page.home.list", failure);
  });

  it("logs nothing when the page loads fine", async () => {
    await show();

    expect(logFailure).not.toHaveBeenCalled();
  });

  it("reminds students to confirm on the employer's own page", async () => {
    await show();

    expect(screen.getByText(/always confirm on the employer.s own page/)).toBeTruthy();
  });
});
