// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
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
    industry: null,
    sourceUrl: "https://example.com/x",
    company: { slug: "example-co", name: "Example Co", careersUrl: "https://example.com" },
    status: "open",
    windows: [],
    rulesVerified: true,
    applicationStages: [],
  };
}

function query(overrides: Partial<ProgramsQuery> = {}): ProgramsQuery {
  return { limit: 20, offset: 0, type: undefined, discipline: undefined, industry: undefined, openNow: false, ...overrides };
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

    expect(hrefOf("All programs")).toBe("/programs");
    expect(hrefOf("Graduate")).toBe("/programs?type=graduate");
    expect(hrefOf("Vacationer")).toBe("/programs?type=vacationer");
    expect(hrefOf("Open now")).toBe("/programs?openNow=true");
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

    expect(hrefOf("Graduate")).toBe("/programs");
  });

  it("explains an empty result and offers a way out", () => {
    render(<ProgramFeed programs={[]} total={0} query={query({ openNow: true })} />);

    expect(screen.getByText("No programs match these filters.")).toBeTruthy();
    expect(hrefOf("Clear filters")).toBe("/programs");
    expect(screen.queryByText(/page \d/i)).toBeNull();
  });

  it("shows each program's own eligibility answer, and the badge names its program", () => {
    const programs = [program("Alpha"), program("Beta")];
    render(
      <ProgramFeed
        programs={programs}
        total={2}
        query={query()}
        eligibility={{
          Alpha: {
            verdict: "eligible",
            reasons: [{ criterion: "citizenship", verdict: "eligible", code: "CITIZENSHIP_OK", params: {} }],
          },
          Beta: { verdict: "unknown", reasons: [] },
        }}
      />,
    );

    expect(screen.getByText("Eligible")).toBeTruthy();
    expect(screen.getByText("Check requirements")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Why? for Alpha" })).toBeTruthy();
    expect(screen.queryByText(/Sign in to check/)).toBeNull();
  });

  it("asks for a profile on every card when the student has not made one", () => {
    render(<ProgramFeed programs={[program("Alpha")]} total={1} query={query()} prompt="profile" />);

    expect(screen.getByRole("link", { name: "Add your profile to check if you're eligible." })).toBeTruthy();
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
    expect(hrefOf(/next/i)).toBe("/programs?type=graduate&offset=20");
    expect(screen.queryByRole("link", { name: /previous/i })).toBeNull();
  });

  it("links both ways from a middle page and not past the last", () => {
    const { unmount } = render(
      <ProgramFeed programs={[program("Alpha")]} total={45} query={query({ offset: 20 })} />,
    );

    expect(screen.getByText("Page 2 of 3")).toBeTruthy();
    expect(hrefOf(/previous/i)).toBe("/programs");
    expect(hrefOf(/next/i)).toBe("/programs?offset=40");
    unmount();

    render(<ProgramFeed programs={[program("Alpha")]} total={45} query={query({ offset: 40 })} />);
    expect(screen.getByText("Page 3 of 3")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /next/i })).toBeNull();
  });
});

describe("ProgramFeed: industry", () => {
  const industries = () => screen.getByRole("navigation", { name: "Filter programs by industry" });

  it("offers each industry as a plain link, keeping the other filters", () => {
    render(<ProgramFeed programs={[program("Alpha")]} total={1} query={query({ type: "graduate" })} />);

    const links = within(industries()).getAllByRole("link");
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["All industries", "/programs?type=graduate"],
      ["Banking and finance", "/programs?type=graduate&industry=banking_finance"],
      ["Consulting", "/programs?type=graduate&industry=consulting"],
      ["Technology", "/programs?type=graduate&industry=technology"],
      ["Engineering and resources", "/programs?type=graduate&industry=engineering_resources"],
      ["Government and defence", "/programs?type=graduate&industry=government_defence"],
      ["Other", "/programs?type=graduate&industry=other"],
    ]);
  });

  it("marks the chosen industry for screen readers, and All industries when none is chosen", () => {
    const { unmount } = render(
      <ProgramFeed programs={[program("Alpha")]} total={1} query={query({ industry: "consulting" })} />,
    );
    expect(within(industries()).getByRole("link", { name: "Consulting" }).getAttribute("aria-current")).toBe("true");
    expect(within(industries()).getByRole("link", { name: "All industries" }).getAttribute("aria-current")).toBeNull();
    unmount();

    render(<ProgramFeed programs={[program("Alpha")]} total={1} query={query()} />);
    expect(within(industries()).getByRole("link", { name: "All industries" }).getAttribute("aria-current")).toBe("true");
  });

  it("clicking the current industry again switches it off", () => {
    render(<ProgramFeed programs={[program("Alpha")]} total={1} query={query({ industry: "consulting" })} />);

    expect(within(industries()).getByRole("link", { name: "Consulting" }).getAttribute("href")).toBe("/programs");
  });
});

describe("ProgramFeed: headings", () => {
  it("titles each card with a level 2 heading, so the page goes from its h1 straight to them", () => {
    render(<ProgramFeed programs={[program("Alpha"), program("Beta")]} total={2} query={query()} />);

    const headings = screen.getAllByRole("heading");
    expect(headings.map((heading) => heading.tagName)).toEqual(["H2", "H2"]);
  });
});
