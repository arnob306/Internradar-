// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PublicProgram } from "../server/programs/programs-handler";
import { ProgramDetail } from "./ProgramDetail";

function program(overrides: Partial<PublicProgram> = {}): PublicProgram {
  return {
    id: "p1",
    slug: "graduate-program",
    name: "EY Graduate Program",
    programType: "graduate",
    cities: ["melbourne", "sydney"],
    disciplines: [],
    sourceUrl: "https://www.ey.com/en_au/careers/2027-graduate-program-student-opportunities",
    company: { slug: "ey-australia", name: "EY Australia", careersUrl: "https://www.ey.com" },
    status: "open",
    windows: [],
    rulesVerified: true,
    applicationStages: [],
    ...overrides,
  };
}

const windowOf = (overrides = {}) => ({
  cycleYear: 2027,
  windowSeq: 1,
  opensOn: null,
  opensPrecision: null,
  closesOn: null,
  closesPrecision: null,
  programStartsOn: null,
  programEndsOn: null,
  status: "unknown" as const,
  sourceUrl: "https://example.com/w",
  ...overrides,
});

describe("ProgramDetail: the program", () => {
  it("names the employer and the program, and says what kind and where, in words", () => {
    render(<ProgramDetail program={program()} />);

    expect(screen.getByRole("heading", { level: 1, name: "EY Graduate Program" })).toBeTruthy();
    expect(screen.getByText("EY Australia")).toBeTruthy();
    expect(screen.getByText("Graduate")).toBeTruthy();
    expect(screen.getByText("Melbourne")).toBeTruthy();
    expect(screen.getByText("Sydney")).toBeTruthy();
  });

  it("shows whether applications are open, as words", () => {
    render(<ProgramDetail program={program({ status: "upcoming" })} />);

    expect(screen.getByText("Opening soon")).toBeTruthy();
  });

  it("lists the degree areas by name, or says any degree will do", () => {
    const { unmount } = render(<ProgramDetail program={program({ disciplines: ["computer_science", "law"] })} />);
    expect(screen.getByText("Computer science")).toBeTruthy();
    expect(screen.getByText("Law")).toBeTruthy();
    unmount();

    render(<ProgramDetail program={program({ disciplines: [] })} />);
    expect(screen.getByText("Any degree")).toBeTruthy();
  });

  it("links back to all programs", () => {
    render(<ProgramDetail program={program()} />);

    expect(screen.getByRole("link", { name: "All programs" }).getAttribute("href")).toBe("/programs");
  });
});

describe("ProgramDetail: are you eligible?", () => {
  const reasons = [
    { criterion: "citizenship", verdict: "eligible", code: "CITIZENSHIP_OK", params: {} },
    { criterion: "graduation_window", verdict: "ineligible", code: "GRADUATION_OUTSIDE_WINDOW", params: {} },
  ] as const;

  it("gives the verdict and spells out every reason, with no click needed", () => {
    render(<ProgramDetail program={program()} eligibility={{ verdict: "ineligible", reasons }} />);

    const panel = screen.getByRole("region", { name: "Are you eligible?" });
    expect(within(panel).getByText("Not eligible")).toBeTruthy();
    expect(within(panel).getByText("Your citizenship or residency is accepted.")).toBeTruthy();
    expect(within(panel).getByText("Your graduation date is outside the range this program accepts.")).toBeTruthy();
    expect(within(panel).queryByRole("button")).toBeNull();
  });

  it("asks a visitor to sign in, returning to this very page", () => {
    render(<ProgramDetail program={program()} />);

    const link = screen.getByRole("link", { name: "Sign in to check if you're eligible." });
    expect(link.getAttribute("href")).toBe(`/login?next=${encodeURIComponent("/programs/ey-australia/graduate-program")}`);
  });

  it("asks a student with no profile to add one", () => {
    render(<ProgramDetail program={program()} prompt="profile" />);

    expect(screen.getByRole("link", { name: "Add your profile to check if you're eligible." }).getAttribute("href")).toBe(
      "/profile",
    );
  });

  it("escapes the slugs when it builds that sign-in link", () => {
    render(<ProgramDetail program={program({ slug: "a b", company: { slug: "x y", name: "X", careersUrl: "https://x.example" } })} />);

    expect(screen.getByRole("link", { name: "Sign in to check if you're eligible." }).getAttribute("href")).toBe(
      `/login?next=${encodeURIComponent("/programs/x%20y/a%20b")}`,
    );
  });
});

describe("ProgramDetail: application windows", () => {
  it("lists each window, newest first as given, with its intake and how precisely it is known", () => {
    render(
      <ProgramDetail
        program={program({
          windows: [
            windowOf({ cycleYear: 2027, opensOn: "2027-02-01", opensPrecision: "month", closesOn: "2027-03-01", closesPrecision: "month", status: "upcoming" }),
            windowOf({ cycleYear: 2026, opensOn: "2025-08-12", opensPrecision: "day", closesOn: "2025-09-08", closesPrecision: "day", status: "closed" }),
          ],
        })}
      />,
    );

    const list = screen.getByRole("list", { name: "Application windows" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toContain("2027 intake");
    expect(rows[0]?.textContent).toContain("Feb 2027 to Mar 2027");
    expect(rows[0]?.textContent).toContain("month");
    expect(rows[1]?.textContent).toContain("2026 intake");
    expect(rows[1]?.textContent).toContain("12 Aug 2025 to 8 Sep 2025");
    expect(rows[1]?.textContent).toContain("day");
  });

  it("numbers a second round in the same intake", () => {
    render(<ProgramDetail program={program({ windows: [windowOf({ windowSeq: 2 })] })} />);

    expect(screen.getByText("2027 intake, round 2")).toBeTruthy();
  });

  it("flags an estimate as an estimate", () => {
    render(
      <ProgramDetail
        program={program({
          windows: [windowOf({ opensOn: "2026-07-01", opensPrecision: "estimated", closesOn: "2026-08-01", closesPrecision: "estimated" })],
        })}
      />,
    );

    expect(screen.getByText("Usually Jul to Aug")).toBeTruthy();
    expect(screen.getByText("estimated")).toBeTruthy();
  });

  it("says so, in words, when there are no windows yet", () => {
    render(<ProgramDetail program={program({ windows: [] })} />);

    expect(screen.getByText("No application windows recorded yet.")).toBeTruthy();
  });
});

describe("ProgramDetail: the employer's page and how much to trust this", () => {
  it("links to the employer's own page, opening a new tab safely", () => {
    render(<ProgramDetail program={program()} />);

    const link = screen.getByRole("link", { name: /Apply on EY Australia's site/ });
    expect(link.getAttribute("href")).toBe(program().sourceUrl);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it.each(["javascript:alert(1)", "http://insecure.example.com", "https://user:pw@evil.example/", "https://www.seek.com.au/x"])(
    "draws no link at all for the unsafe address %s",
    (sourceUrl) => {
      render(<ProgramDetail program={program({ sourceUrl })} />);

      expect(screen.queryByRole("link", { name: /Apply on/ })).toBeNull();
      expect(screen.getByText(/couldn.t show a safe link/i)).toBeTruthy();
    },
  );

  it("says when a person has checked the requirements", () => {
    render(<ProgramDetail program={program({ rulesVerified: true })} />);

    expect(screen.getByText("Checked by a person")).toBeTruthy();
  });

  it("says plainly when they have not, and sends the student to the employer", () => {
    render(<ProgramDetail program={program({ rulesVerified: false })} />);

    expect(screen.queryByText("Checked by a person")).toBeNull();
    expect(screen.getByText("Not checked yet")).toBeTruthy();
    expect(screen.getByText(/read the requirements on the employer/i)).toBeTruthy();
  });
});

describe("ProgramDetail: saving to the tracker", () => {
  it("offers a signed-in student a way to save the program", () => {
    render(<ProgramDetail program={program()} prompt="profile" saved={false} />);

    expect(screen.getByRole("button", { name: "Save to my tracker" })).toBeTruthy();
  });

  it("shows a program the student already saved as saved", () => {
    render(<ProgramDetail program={program()} prompt="profile" saved />);

    expect(screen.queryByRole("button", { name: "Save to my tracker" })).toBeNull();
    expect(screen.getByRole("link", { name: "View in my tracker" })).toBeTruthy();
  });

  it("sends a visitor to sign in, and brings them back to this program", () => {
    render(<ProgramDetail program={program()} />);

    expect(screen.queryByRole("button", { name: "Save to my tracker" })).toBeNull();
    const link = screen.getByRole("link", { name: "Sign in to save this program" });
    expect(link.getAttribute("href")).toBe("/login?next=%2Fprograms%2Fey-australia%2Fgraduate-program");
  });
});

describe("ProgramDetail: how to prepare and apply", () => {
  const stages = [
    { name: "Online application", description: "Your CV and a short form.", sourceUrl: "https://www.ey.com/apply" },
    { name: "Video interview", description: null, sourceUrl: "https://www.ey.com/process" },
  ];

  it("lists the stages in the employer's order, each with a link to where it was described", () => {
    render(<ProgramDetail program={program({ applicationStages: stages })} />);

    const section = screen.getByRole("region", { name: "How to prepare and apply" });
    const items = within(section).getAllByRole("listitem");
    expect(items.map((item) => item.querySelector("strong")?.textContent)).toEqual([
      "Online application",
      "Video interview",
    ]);
    expect(within(items[0] as HTMLElement).getByText("Your CV and a short form.")).toBeTruthy();
    const link = within(items[1] as HTMLElement).getByRole("link", { name: "Where this is described" });
    expect(link.getAttribute("href")).toBe("https://www.ey.com/process");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("tells the student to check the employer's page, since stages can change", () => {
    render(<ProgramDetail program={program({ applicationStages: stages })} />);

    const section = screen.getByRole("region", { name: "How to prepare and apply" });
    expect(section.textContent).toMatch(/confirm on the employer.s page/i);
  });

  it("says plainly when the employer has not published the stages, and invents none", () => {
    render(<ProgramDetail program={program({ applicationStages: [] })} />);

    const section = screen.getByRole("region", { name: "How to prepare and apply" });
    expect(within(section).getByText(/stages aren.t published/i)).toBeTruthy();
    expect(within(section).queryAllByRole("listitem")).toHaveLength(0);
  });

  it("puts the apply link in the section, beside the preparation advice", () => {
    render(<ProgramDetail program={program()} />);

    const section = screen.getByRole("region", { name: "How to prepare and apply" });
    const apply = within(section).getByRole("link", { name: /Apply on EY Australia.s site/ });
    expect(apply.getAttribute("href")).toBe("https://www.ey.com/en_au/careers/2027-graduate-program-student-opportunities");
  });
});

describe("ProgramDetail: add the dates to a calendar", () => {
  const NOW = new Date("2026-10-03T03:00:00Z");
  const dated = windowOf({ opensOn: "2026-11-15", opensPrecision: "day", closesOn: "2026-12-15", closesPrecision: "day", status: "upcoming" });

  it("offers a calendar file for the dates the employer gives to the day", () => {
    render(<ProgramDetail program={program({ windows: [dated] })} now={NOW} />);

    const link = screen.getByRole("link", { name: "Add these dates to your calendar" });
    expect(link.getAttribute("download")).toBe("ey-australia-graduate-program.ics");
    const href = link.getAttribute("href") ?? "";
    expect(href.startsWith("data:text/calendar;charset=utf-8,")).toBe(true);
    expect(decodeURIComponent(href)).toContain("SUMMARY:EY Graduate Program: applications open");
    expect(screen.getByText("Only dates the employer gives to the day are included.")).toBeTruthy();
  });

  it("offers nothing when no date is known to the day, rather than a calendar with guesses in it", () => {
    const guessed = windowOf({ opensOn: "2026-11-01", opensPrecision: "month", closesOn: "2026-12-01", closesPrecision: "estimated" });
    render(<ProgramDetail program={program({ windows: [guessed] })} now={NOW} />);

    expect(screen.queryByRole("link", { name: "Add these dates to your calendar" })).toBeNull();
  });

  it("offers nothing when the dates have passed", () => {
    render(<ProgramDetail program={program({ windows: [dated] })} now={new Date("2027-01-10T00:00:00Z")} />);

    expect(screen.queryByRole("link", { name: "Add these dates to your calendar" })).toBeNull();
  });
});
