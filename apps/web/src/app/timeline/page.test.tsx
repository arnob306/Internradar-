// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProgramListItem } from "../../server/programs/list-programs";

const getUser = vi.fn();
const listPrograms = vi.fn();
const listApplications = vi.fn();
const logFailure = vi.fn();

vi.mock("../../server/log", () => ({ logFailure: (...args: unknown[]) => logFailure(...args) }));
vi.mock("../../server/auth/request-session", () => ({
  sessionClientForRequest: () => Promise.resolve({ auth: { getUser }, marker: "session-client" }),
}));
vi.mock("../../server/programs/list-programs", () => ({
  listPrograms: (...args: unknown[]) => listPrograms(...args),
}));
vi.mock("../../server/applications/applications-repo", () => ({
  listApplications: (...args: unknown[]) => listApplications(...args),
}));

import TimelinePage from "./page";

function item(slug: string, overrides: Partial<ProgramListItem> = {}): ProgramListItem {
  return {
    id: `id-${slug}`,
    slug,
    name: `Program ${slug}`,
    programType: "graduate",
    cities: ["melbourne"],
    disciplines: [],
    sourceUrl: "https://example.com/p",
    company: { slug: `co-${slug}`, name: `Company ${slug}`, careersUrl: "https://example.com" },
    status: "unknown",
    windows: [],
    eligibilityRules: { schemaVersion: 1 },
    rulesVerified: true,
    rulesVersion: 1,
    ...overrides,
  };
}

const upcomingWindow = {
  cycleYear: 2027,
  windowSeq: 1,
  opensOn: "2026-11-15",
  opensPrecision: "day" as const,
  closesOn: null,
  closesPrecision: null,
  programStartsOn: null,
  programEndsOn: null,
  status: "upcoming" as const,
  sourceUrl: "https://example.com/w",
};

beforeEach(() => {
  // 14:00 UTC on 3 Oct is already 4 Oct in Melbourne.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-03T14:00:00Z"));
  getUser.mockReset().mockResolvedValue({ data: { user: null } });
  listPrograms.mockReset().mockResolvedValue({ items: [item("a", { windows: [upcomingWindow], status: "upcoming" })], total: 1 });
  listApplications.mockReset().mockResolvedValue([]);
  logFailure.mockReset();
});

describe("the timeline page", () => {
  it("shows a visitor the timeline without asking for an account or looking up a tracker", async () => {
    render(await TimelinePage());

    expect(screen.getByRole("heading", { level: 1, name: "When applications open" })).toBeTruthy();
    expect(within(screen.getByRole("table", { name: "Applications over the next twelve months" })).getByText("Program a")).toBeTruthy();
    expect(listApplications).not.toHaveBeenCalled();
  });

  it("reads all programs as whoever is asking, using today's Melbourne date", async () => {
    render(await TimelinePage());

    expect(listPrograms).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ marker: "session-client" }),
      expect.objectContaining({ limit: 100, offset: 0, type: undefined, discipline: undefined, openNow: false }),
      "2026-10-04",
    );
  });

  it("badges the programs a signed-in student has saved", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    listApplications.mockResolvedValue([{ programId: "id-a" }]);

    render(await TimelinePage());

    expect(within(screen.getByRole("row", { name: /Program a/ })).getByText("Saved")).toBeTruthy();
  });

  it("still shows the timeline, and logs a safe summary, when the saved programs cannot be read", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    listApplications.mockRejectedValue(new Error("db password=hunter2"));

    render(await TimelinePage());

    expect(screen.getByRole("row", { name: /Program a/ })).toBeTruthy();
    expect(screen.queryByText("Saved")).toBeNull();
    expect(logFailure).toHaveBeenCalledWith("page.timeline.saved", expect.any(Error));
    expect(document.body.textContent).not.toMatch(/hunter2/);
  });

  it("treats a session that cannot be read as a visitor", async () => {
    getUser.mockRejectedValue(new Error("session store down"));

    render(await TimelinePage());

    expect(screen.getByRole("row", { name: /Program a/ })).toBeTruthy();
    expect(listApplications).not.toHaveBeenCalled();
    expect(logFailure).toHaveBeenCalledWith("page.timeline.session", expect.any(Error));
  });

  it("says so, and logs only a safe summary, when programs cannot be loaded", async () => {
    listPrograms.mockRejectedValue(new Error("db password=hunter2"));

    render(await TimelinePage());

    expect(screen.getByText(/couldn't load the timeline/i)).toBeTruthy();
    expect(logFailure).toHaveBeenCalledWith("page.timeline.load", expect.any(Error));
    expect(document.body.textContent).not.toMatch(/hunter2/);
  });

  it("says when the list was cut short, rather than silently leaving programs out", async () => {
    listPrograms.mockResolvedValue({ items: [item("a")], total: 150 });

    render(await TimelinePage());

    expect(screen.getByText(/first 1 of 150 programs/i)).toBeTruthy();
  });

  it("reminds students to confirm on the employer's page", async () => {
    render(await TimelinePage());

    expect(screen.getByText(/confirm on the employer's own page/i)).toBeTruthy();
  });
});
