import { describe, expect, it } from "vitest";
import {
  APPLICATION_STATUSES,
  isApplicationStatus,
  nextStatuses,
  transition,
  undoTarget,
  type ApplicationStatus,
} from "./transition";

describe("application statuses", () => {
  it("lists the six statuses in funnel order", () => {
    expect(APPLICATION_STATUSES).toEqual(["saved", "applied", "online_assessment", "interview", "offer", "rejected"]);
  });

  it.each(APPLICATION_STATUSES)("recognises %s", (status) => {
    expect(isApplicationStatus(status)).toBe(true);
  });

  it.each(["", "Saved", "withdrawn", "applied ", 3, null, undefined])("does not recognise %j", (value) => {
    expect(isApplicationStatus(value)).toBe(false);
  });
});

describe("which moves are allowed (D9)", () => {
  it.each<[ApplicationStatus, ApplicationStatus[]]>([
    ["saved", ["applied", "rejected"]],
    ["applied", ["online_assessment", "interview", "rejected"]],
    ["online_assessment", ["interview", "rejected"]],
    ["interview", ["offer", "rejected"]],
    ["offer", []],
    ["rejected", []],
  ])("from %s you can move to %j", (from, expected) => {
    expect(nextStatuses(from)).toEqual(expected);
  });

  it("lets a student skip the online assessment", () => {
    expect(transition("applied", "interview")).toEqual({ ok: true, status: "interview" });
  });

  it("reaches rejected from every status except offer", () => {
    for (const from of APPLICATION_STATUSES) {
      const result = transition(from, "rejected");
      expect(result.ok, from).toBe(from !== "offer" && from !== "rejected");
    }
  });

  it("never moves backwards", () => {
    expect(transition("interview", "applied")).toEqual({ ok: false, code: "NOT_ALLOWED" });
    expect(transition("applied", "saved")).toEqual({ ok: false, code: "NOT_ALLOWED" });
    expect(transition("offer", "interview")).toEqual({ ok: false, code: "NOT_ALLOWED" });
  });

  it("never leaves rejected or offer", () => {
    for (const to of APPLICATION_STATUSES) {
      expect(transition("rejected", to).ok, `rejected -> ${to}`).toBe(false);
      expect(transition("offer", to).ok, `offer -> ${to}`).toBe(false);
    }
  });

  it("does not skip further than the online assessment", () => {
    expect(transition("saved", "online_assessment")).toEqual({ ok: false, code: "NOT_ALLOWED" });
    expect(transition("saved", "interview")).toEqual({ ok: false, code: "NOT_ALLOWED" });
    expect(transition("applied", "offer")).toEqual({ ok: false, code: "NOT_ALLOWED" });
  });

  it("says so when nothing would change", () => {
    expect(transition("applied", "applied")).toEqual({ ok: false, code: "SAME_STATUS" });
  });
});

describe("undoing the most recent move", () => {
  it("returns to where the application was before", () => {
    expect(undoTarget({ fromStatus: "applied", toStatus: "interview" })).toBe("applied");
    expect(undoTarget({ fromStatus: "interview", toStatus: "rejected" })).toBe("interview");
  });

  it("cannot undo the moment the application was saved", () => {
    expect(undoTarget({ fromStatus: null, toStatus: "saved" })).toBeNull();
  });

  it("cannot undo when there is no move at all", () => {
    expect(undoTarget(null)).toBeNull();
  });
});
