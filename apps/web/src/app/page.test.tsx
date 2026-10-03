// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProgramListItem } from "../server/programs/list-programs";

const listPrograms = vi.fn();
vi.mock("../server/programs/list-programs", () => ({ listPrograms: (...args: unknown[]) => listPrograms(...args) }));
vi.mock("../server/public-client", () => ({ createPublicClient: () => ({ marker: "anon-client" }) }));

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
  listPrograms.mockResolvedValue({ items: [item("Alpha"), item("Beta")], total: 2 });
});
afterEach(() => vi.useRealTimers());

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
      { marker: "anon-client" },
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

  it("reminds students to confirm on the employer's own page", async () => {
    await show();

    expect(screen.getByText(/always confirm on the employer.s own page/)).toBeTruthy();
  });
});
