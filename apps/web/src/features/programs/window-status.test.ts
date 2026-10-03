import { describe, expect, it } from "vitest";
import { programStatus, windowStatus, type StatusWindow } from "./window-status";

function win(overrides: Partial<StatusWindow> = {}): StatusWindow {
  return {
    status: "unknown",
    opens_on: null,
    opens_precision: null,
    closes_on: null,
    closes_precision: null,
    ...overrides,
  };
}

describe("windowStatus: a window with no dates", () => {
  it.each(["open", "upcoming", "closed", "unknown"] as const)(
    "keeps the stored status %s",
    (status) => {
      expect(windowStatus(win({ status }), "2026-10-03")).toBe(status);
    },
  );
});

describe("windowStatus: day-precision dates are exact", () => {
  const dated = win({
    status: "unknown",
    opens_on: "2026-08-12",
    opens_precision: "day",
    closes_on: "2026-09-08",
    closes_precision: "day",
  });

  it.each([
    ["2026-08-11", "upcoming"],
    ["2026-08-12", "open"],
    ["2026-08-30", "open"],
    ["2026-09-08", "open"],
    ["2026-09-09", "closed"],
    ["2026-10-03", "closed"],
  ] as const)("on %s it is %s, whatever the stored status says", (today, expected) => {
    expect(windowStatus(dated, today)).toBe(expected);
    expect(windowStatus({ ...dated, status: "open" }, today)).toBe(expected);
  });

  it("is open from the opening date when there is no closing date", () => {
    const rolling = win({ opens_on: "2026-08-12", opens_precision: "day" });

    expect(windowStatus(rolling, "2026-08-11")).toBe("upcoming");
    expect(windowStatus(rolling, "2027-03-01")).toBe("open");
  });
});

describe("windowStatus: month-precision dates are a range, not a day", () => {
  // "Opens February 2027, closes March 2027": stored as the first of each month.
  const months = win({
    status: "upcoming",
    opens_on: "2027-02-01",
    opens_precision: "month",
    closes_on: "2027-03-01",
    closes_precision: "month",
  });

  it("is upcoming only before the opening month starts", () => {
    expect(windowStatus(months, "2027-01-31")).toBe("upcoming");
  });

  it("is open once the opening month has ended and the closing month has not begun", () => {
    expect(windowStatus(months, "2027-02-28")).toBe("open");
  });

  it("is closed only once the closing month has ended", () => {
    expect(windowStatus(months, "2027-04-01")).toBe("closed");
  });

  it("does not guess inside the opening month: it keeps the stored status", () => {
    expect(windowStatus(months, "2027-02-10")).toBe("upcoming");
    expect(windowStatus({ ...months, status: "unknown" }, "2027-02-10")).toBe("unknown");
  });

  it("does not guess inside the closing month either", () => {
    expect(windowStatus({ ...months, status: "open" }, "2027-03-10")).toBe("open");
  });
});

describe("windowStatus: estimated dates prove nothing", () => {
  const estimated = win({
    status: "unknown",
    opens_on: "2026-07-01",
    opens_precision: "estimated",
    closes_on: "2026-08-01",
    closes_precision: "estimated",
  });

  it.each(["2026-06-01", "2026-07-15", "2026-10-03"])(
    "never turns an estimate into a status (%s)",
    (today) => {
      expect(windowStatus(estimated, today)).toBe("unknown");
    },
  );

  it("still reports closed when a known closing date has passed", () => {
    const closedForSure = win({
      opens_on: "2026-02-01",
      opens_precision: "estimated",
      closes_on: "2026-06-30",
      closes_precision: "day",
    });

    expect(windowStatus(closedForSure, "2026-07-01")).toBe("closed");
    expect(windowStatus(closedForSure, "2026-06-30")).toBe("unknown");
  });
});

describe("programStatus", () => {
  const closed = win({ status: "closed" });
  const unknown = win({ status: "unknown" });
  const upcoming = win({ status: "upcoming" });
  const open = win({ status: "open" });

  it("is unknown for a program with no windows", () => {
    expect(programStatus([], "2026-10-03")).toBe("unknown");
  });

  it("is open if any window is open", () => {
    expect(programStatus([closed, open, unknown], "2026-10-03")).toBe("open");
  });

  it("is upcoming if none is open but one is upcoming", () => {
    expect(programStatus([closed, upcoming, unknown], "2026-10-03")).toBe("upcoming");
  });

  it("is unknown, not closed, while a newer window's dates are unpublished", () => {
    expect(programStatus([closed, unknown], "2026-10-03")).toBe("unknown");
  });

  it("is closed only when every window is closed", () => {
    expect(programStatus([closed, closed], "2026-10-03")).toBe("closed");
  });

  it("derives each window from its dates first", () => {
    const expired = win({
      status: "open",
      opens_on: "2026-08-12",
      opens_precision: "day",
      closes_on: "2026-09-08",
      closes_precision: "day",
    });

    expect(programStatus([expired], "2026-10-03")).toBe("closed");
  });
});
