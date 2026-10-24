// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProgramListItem } from "../server/programs/list-programs";

const getUser = vi.fn();
const listPrograms = vi.fn();
const listApplications = vi.fn();
const logFailure = vi.fn();

vi.mock("../server/log", () => ({ logFailure: (...args: unknown[]) => logFailure(...args) }));
vi.mock("../server/auth/request-session", () => ({
  sessionClientForRequest: () => Promise.resolve({ auth: { getUser }, marker: "session-client" }),
}));
vi.mock("../server/programs/list-programs", () => ({
  listPrograms: (...args: unknown[]) => listPrograms(...args),
}));
vi.mock("../server/applications/applications-repo", () => ({
  listApplications: (...args: unknown[]) => listApplications(...args),
}));

import HomePage from "./page";

type Params = Record<string, string | string[] | undefined>;

const home = (params: Params = {}) => HomePage({ searchParams: Promise.resolve(params) });

function item(slug: string, overrides: Partial<ProgramListItem> = {}): ProgramListItem {
  return {
    id: `id-${slug}`,
    slug,
    name: `Program ${slug}`,
    programType: "graduate",
    cities: ["melbourne"],
    disciplines: [],
    industry: null,
    sourceUrl: "https://example.com/p",
    company: { slug: `co-${slug}`, name: `Company ${slug}`, careersUrl: "https://example.com" },
    status: "unknown",
    windows: [],
    eligibilityRules: { schemaVersion: 1 },
    rulesVerified: true,
    applicationStages: [],
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

describe("the home page", () => {
  it("shows a visitor the timeline without asking for an account or looking up a tracker", async () => {
    render(await home());

    expect(screen.getByRole("heading", { level: 1, name: "Never miss an application window." })).toBeTruthy();
    expect(within(screen.getByRole("table", { name: "Applications over the next twelve months" })).getByText("Program a")).toBeTruthy();
    expect(listApplications).not.toHaveBeenCalled();
  });

  it("reads all programs as whoever is asking, using today's Melbourne date", async () => {
    render(await home());

    expect(listPrograms).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ marker: "session-client" }),
      expect.objectContaining({ limit: 100, offset: 0, type: undefined, discipline: undefined, openNow: false }),
      "2026-10-04",
    );
  });

  it("badges the programs a signed-in student has saved", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    listApplications.mockResolvedValue([{ programId: "id-a" }]);

    render(await home());

    expect(within(screen.getByRole("row", { name: /Program a/ })).getByText("Saved")).toBeTruthy();
  });

  it("still shows the timeline, and logs a safe summary, when the saved programs cannot be read", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    listApplications.mockRejectedValue(new Error("db password=hunter2"));

    render(await home());

    expect(screen.getByRole("row", { name: /Program a/ })).toBeTruthy();
    expect(screen.queryByText("Saved")).toBeNull();
    expect(logFailure).toHaveBeenCalledWith("page.timeline.saved", expect.any(Error));
    expect(document.body.textContent).not.toMatch(/hunter2/);
  });

  it("treats a session that cannot be read as a visitor", async () => {
    getUser.mockRejectedValue(new Error("session store down"));

    render(await home());

    expect(screen.getByRole("row", { name: /Program a/ })).toBeTruthy();
    expect(listApplications).not.toHaveBeenCalled();
    expect(logFailure).toHaveBeenCalledWith("page.timeline.session", expect.any(Error));
  });

  it("says so, and logs only a safe summary, when programs cannot be loaded", async () => {
    listPrograms.mockRejectedValue(new Error("db password=hunter2"));

    render(await home());

    expect(screen.getByText(/couldn't load the timeline/i)).toBeTruthy();
    expect(logFailure).toHaveBeenCalledWith("page.timeline.load", expect.any(Error));
    expect(document.body.textContent).not.toMatch(/hunter2/);
  });

  it("says when the list was cut short, rather than silently leaving programs out", async () => {
    listPrograms.mockResolvedValue({ items: [item("a")], total: 150 });

    render(await home());

    expect(screen.getByText(/first 1 of 150 programs/i)).toBeTruthy();
  });

  it("reminds students to confirm on the employer's page", async () => {
    render(await home());

    expect(screen.getByText(/confirm on the employer's own page/i)).toBeTruthy();
  });

  it("summarises the programs by how sure their dates are", async () => {
    listPrograms.mockResolvedValue({
      items: [item("a", { windows: [upcomingWindow], status: "upcoming" }), item("b"), item("c")],
      total: 3,
    });

    render(await home());

    const summary = screen.getByRole("list", { name: "Programs at a glance" });
    expect(within(summary).getByText("3 programs")).toBeTruthy();
    expect(within(summary).getByText("1 opening soon")).toBeTruthy();
    expect(within(summary).getByText("2 with no dates announced")).toBeTruthy();
  });

  it("links to the full list of programs", async () => {
    render(await home());

    expect(screen.getByRole("link", { name: "Browse all programs" }).getAttribute("href")).toBe("/programs");
  });

  it("filters to one type when the address asks for it", async () => {
    render(await home({ type: "vacationer" }));

    expect(listPrograms).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      expect.objectContaining({ type: "vacationer", limit: 100, offset: 0 }),
      "2026-10-04",
    );
  });

  it("offers All programs, Graduate and Vacationer as plain links, with the current one marked", async () => {
    render(await home({ type: "graduate" }));

    const filters = screen.getByRole("navigation", { name: "Filter the timeline" });
    const links = within(filters).getAllByRole("link");
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["All programs", "/"],
      ["Graduate", "/?type=graduate"],
      ["Vacationer", "/?type=vacationer"],
    ]);
    expect(links.map((link) => link.getAttribute("aria-current"))).toEqual([null, "true", null]);
  });

  it("marks All programs as current when nothing is filtered", async () => {
    render(await home());

    const filters = screen.getByRole("navigation", { name: "Filter the timeline" });
    expect(within(filters).getByRole("link", { name: "All programs" }).getAttribute("aria-current")).toBe("true");
  });

  it("ignores a type it does not offer, and says so with a way back", async () => {
    render(await home({ type: "internship" }));

    expect(screen.getByText(/filter in that link wasn't valid/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Show all programs" }).getAttribute("href")).toBe("/");
    expect(listPrograms).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      expect.objectContaining({ type: undefined }),
      "2026-10-04",
    );
  });

  it("does not show the invalid-filter notice for a link with only tracking codes", async () => {
    render(await home({ utm_source: "club" }));

    expect(screen.queryByText(/wasn't valid/i)).toBeNull();
  });

  it("says plainly when a filter leaves no programs, with a link back to all of them", async () => {
    listPrograms.mockResolvedValue({ items: [], total: 0 });

    render(await home({ type: "vacationer" }));

    expect(screen.getByText(/no vacationer programs to show/i)).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "Show all programs" })[0]?.getAttribute("href")).toBe("/");
  });

  it("filters to one industry when the address asks for it", async () => {
    render(await home({ industry: "consulting" }));

    expect(listPrograms).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      expect.objectContaining({ industry: "consulting", type: undefined, limit: 100, offset: 0 }),
      "2026-10-04",
    );
  });

  it("offers each industry as a plain link, with the current one marked and the chosen type kept", async () => {
    render(await home({ type: "graduate", industry: "consulting" }));

    const filters = screen.getByRole("navigation", { name: "Filter by industry" });
    const links = within(filters).getAllByRole("link");
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["All industries", "/?type=graduate"],
      ["Banking and finance", "/?type=graduate&industry=banking_finance"],
      ["Consulting", "/?type=graduate&industry=consulting"],
      ["Technology", "/?type=graduate&industry=technology"],
      ["Engineering and resources", "/?type=graduate&industry=engineering_resources"],
      ["Government and defence", "/?type=graduate&industry=government_defence"],
      ["Other", "/?type=graduate&industry=other"],
    ]);
    expect(links.map((link) => link.getAttribute("aria-current"))).toEqual([null, null, "true", null, null, null, null]);
  });

  it("keeps the chosen industry when the type changes", async () => {
    render(await home({ industry: "consulting" }));

    const filters = screen.getByRole("navigation", { name: "Filter the timeline" });
    expect(within(filters).getByRole("link", { name: "Graduate" }).getAttribute("href")).toBe(
      "/?type=graduate&industry=consulting",
    );
    expect(within(filters).getByRole("link", { name: "All programs" }).getAttribute("href")).toBe("/?industry=consulting");
  });

  it("marks All industries as current when no industry is chosen", async () => {
    render(await home());

    const filters = screen.getByRole("navigation", { name: "Filter by industry" });
    expect(within(filters).getByRole("link", { name: "All industries" }).getAttribute("aria-current")).toBe("true");
  });

  it("ignores an industry it does not offer, and says so", async () => {
    render(await home({ industry: "mining" }));

    expect(screen.getByText(/filter in that link wasn't valid/i)).toBeTruthy();
    expect(listPrograms).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      expect.objectContaining({ industry: undefined }),
      "2026-10-04",
    );
  });

  it("says plainly when an industry leaves no programs, naming the industry", async () => {
    listPrograms.mockResolvedValue({ items: [], total: 0 });

    render(await home({ industry: "technology" }));

    expect(screen.getByText("No programs in Technology to show yet.")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "Show all programs" })[0]?.getAttribute("href")).toBe("/");
  });

  it("names both the type and the industry when together they leave no programs", async () => {
    listPrograms.mockResolvedValue({ items: [], total: 0 });

    render(await home({ type: "vacationer", industry: "consulting" }));

    expect(screen.getByText("No vacationer programs in Consulting to show yet.")).toBeTruthy();
  });

  it("puts the industry filter in the same toolbar as the type filter", async () => {
    render(await home());

    const type = screen.getByRole("navigation", { name: "Filter the timeline" });
    const industry = screen.getByRole("navigation", { name: "Filter by industry" });
    expect(industry.parentElement).toBe(type.parentElement);
  });

  it("keeps the opening text to a sentence or two, so the chart stays near the top of the page", async () => {
    render(await home());

    const intro = screen.getByRole("heading", { level: 1 }).nextElementSibling;
    expect(intro?.tagName).toBe("P");
    expect((intro?.textContent ?? "").length).toBeLessThanOrEqual(160);
  });

  it("puts the summary above the filters, and the filters beside the link to all programs", async () => {
    render(await home());

    const summary = screen.getByRole("list", { name: "Programs at a glance" });
    const filters = screen.getByRole("navigation", { name: "Filter the timeline" });
    const browse = screen.getByRole("link", { name: "Browse all programs" });
    expect(summary.compareDocumentPosition(filters) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(filters.parentElement).not.toBeNull();
    expect(filters.parentElement).toBe(browse.parentElement);
  });
});
