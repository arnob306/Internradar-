// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ProgramsQuery } from "../features/programs/programs-query";
import type { PublicProgram } from "../server/programs/programs-handler";
import { ProgramFeed } from "./ProgramFeed";

function program(name: string): PublicProgram {
  return {
    id: name,
    slug: name.toLowerCase().replace(/\W+/g, "-"),
    name,
    programType: "graduate",
    cities: ["melbourne"],
    disciplines: [],
    sourceUrl: "https://example.com/x",
    company: { slug: "example-co", name: "Example Co", careersUrl: "https://example.com" },
    status: "open",
    windows: [],
    rulesVerified: true,
  };
}

function query(overrides: Partial<ProgramsQuery> = {}): ProgramsQuery {
  return { limit: 20, offset: 0, type: undefined, discipline: undefined, openNow: false, ...overrides };
}

function hrefOf(name: string | RegExp): string | null {
  return screen.getByRole("link", { name }).getAttribute("href");
}

describe("ProgramFeed", () => {
  it("shows a card for every program, with a count", () => {
    render(<ProgramFeed programs={[program("Alpha"), program("Beta")]} total={2} query={query()} />);

    expect(screen.getByRole("link", { name: /Alpha/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Beta/ })).toBeTruthy();
    expect(screen.getByText("2 programs")).toBeTruthy();
  });

  it("says '1 program' in the singular", () => {
    render(<ProgramFeed programs={[program("Alpha")]} total={1} query={query()} />);

    expect(screen.getByText("1 program")).toBeTruthy();
  });

  it("offers filters as plain links that name the choice", () => {
    render(<ProgramFeed programs={[program("Alpha")]} total={1} query={query()} />);

    expect(hrefOf("All programs")).toBe("/");
    expect(hrefOf("Graduate")).toBe("/?type=graduate");
    expect(hrefOf("Vacationer")).toBe("/?type=vacationer");
    expect(hrefOf("Open now")).toBe("/?openNow=true");
  });

  it("marks the current choice for screen readers, not only by colour", () => {
    render(
      <ProgramFeed programs={[program("Alpha")]} total={1} query={query({ type: "graduate", openNow: true })} />,
    );

    expect(screen.getByRole("link", { name: "Graduate" }).getAttribute("aria-current")).toBe("true");
    expect(screen.getByRole("link", { name: "Open now" }).getAttribute("aria-current")).toBe("true");
    expect(screen.getByRole("link", { name: "All programs" }).getAttribute("aria-current")).toBeNull();
    expect(screen.getByRole("link", { name: "Vacationer" }).getAttribute("aria-current")).toBeNull();
  });

  it("marks 'All programs' as current when nothing is filtered", () => {
    render(<ProgramFeed programs={[program("Alpha")]} total={1} query={query()} />);

    expect(screen.getByRole("link", { name: "All programs" }).getAttribute("aria-current")).toBe("true");
  });

  it("clicking the current type again switches it off", () => {
    render(<ProgramFeed programs={[program("Alpha")]} total={1} query={query({ type: "graduate" })} />);

    expect(hrefOf("Graduate")).toBe("/");
  });

  it("explains an empty result and offers a way out", () => {
    render(<ProgramFeed programs={[]} total={0} query={query({ openNow: true })} />);

    expect(screen.getByText("No programs match these filters.")).toBeTruthy();
    expect(hrefOf("Clear filters")).toBe("/");
    expect(screen.queryByText(/page \d/i)).toBeNull();
  });

  it("has no pagination when everything fits on one page", () => {
    render(<ProgramFeed programs={[program("Alpha")]} total={1} query={query()} />);

    expect(screen.queryByRole("link", { name: /next/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /previous/i })).toBeNull();
  });

  it("links to the next page from the first, keeping the filters", () => {
    render(
      <ProgramFeed programs={[program("Alpha")]} total={45} query={query({ type: "graduate" })} />,
    );

    expect(screen.getByText("Page 1 of 3")).toBeTruthy();
    expect(hrefOf(/next/i)).toBe("/?type=graduate&offset=20");
    expect(screen.queryByRole("link", { name: /previous/i })).toBeNull();
  });

  it("links both ways from a middle page and not past the last", () => {
    const { unmount } = render(
      <ProgramFeed programs={[program("Alpha")]} total={45} query={query({ offset: 20 })} />,
    );

    expect(screen.getByText("Page 2 of 3")).toBeTruthy();
    expect(hrefOf(/previous/i)).toBe("/");
    expect(hrefOf(/next/i)).toBe("/?offset=40");
    unmount();

    render(<ProgramFeed programs={[program("Alpha")]} total={45} query={query({ offset: 40 })} />);
    expect(screen.getByText("Page 3 of 3")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /next/i })).toBeNull();
  });
});
