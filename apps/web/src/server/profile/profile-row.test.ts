import { describe, expect, it } from "vitest";
import type { ProfileInput } from "../../features/profile/profile-input";
import { fromProfileRow, toProfileRow, toStudentProfile, type ProfileRow } from "./profile-row";

const USER_ID = "00000000-0000-4000-8000-0000000000aa";

const INPUT: ProfileInput = {
  expectedGraduation: { year: 2027, month: 6 },
  degreeLevel: "undergraduate",
  disciplines: ["computer_science", "mathematics_statistics"],
  isDoubleDegree: true,
  planningHonours: false,
  citizenship: "au_citizen",
  university: "University of Melbourne",
  emailAlerts: false,
};

function row(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return {
    user_id: USER_ID,
    expected_graduation: "2027-06-01",
    degree_level: "undergraduate",
    disciplines: ["computer_science", "mathematics_statistics"],
    is_double_degree: true,
    planning_honours: false,
    citizenship: "au_citizen",
    university: "University of Melbourne",
    email_alerts: false,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    ...overrides,
  };
}

describe("toProfileRow", () => {
  it("stores the graduation month as the first of that month, as the table requires", () => {
    expect(toProfileRow(USER_ID, INPUT).expected_graduation).toBe("2027-06-01");
    expect(toProfileRow(USER_ID, { ...INPUT, expectedGraduation: { year: 2030, month: 12 } }).expected_graduation).toBe(
      "2030-12-01",
    );
  });

  it("maps every field to its column, owned by the given user", () => {
    expect(toProfileRow(USER_ID, INPUT)).toEqual({
      user_id: USER_ID,
      expected_graduation: "2027-06-01",
      degree_level: "undergraduate",
      disciplines: ["computer_science", "mathematics_statistics"],
      is_double_degree: true,
      planning_honours: false,
      citizenship: "au_citizen",
      university: "University of Melbourne",
      email_alerts: false,
    });
  });

  it("writes nothing for what the student has not told us", () => {
    const empty: ProfileInput = {
      expectedGraduation: null,
      degreeLevel: null,
      disciplines: [],
      isDoubleDegree: false,
      planningHonours: false,
      citizenship: null,
      university: null,
      emailAlerts: true,
    };

    expect(toProfileRow(USER_ID, empty)).toMatchObject({
      expected_graduation: null,
      degree_level: null,
      disciplines: [],
      citizenship: null,
      university: null,
    });
  });
});

describe("fromProfileRow", () => {
  it("reads a row back into the form's shape", () => {
    expect(fromProfileRow(row())).toEqual(INPUT);
  });

  it("round-trips whatever was saved", () => {
    expect(fromProfileRow({ ...row(), ...toProfileRow(USER_ID, INPUT) })).toEqual(INPUT);
  });

  it("treats a missing graduation as not told", () => {
    expect(fromProfileRow(row({ expected_graduation: null })).expectedGraduation).toBeNull();
  });

  it.each(["", "not a date", "2027-13-01", "2027-00-01", "June 2027"])(
    "treats the unreadable graduation %j as not told, never a crash",
    (value) => {
      expect(fromProfileRow(row({ expected_graduation: value })).expectedGraduation).toBeNull();
    },
  );

  // The database outlives the app's vocabulary. A term added or retired later must not break
  // someone's profile page, so what is not recognised is left out and the rest still loads.
  it("drops a degree area the app no longer recognises and keeps the rest", () => {
    const result = fromProfileRow(row({ disciplines: ["computer_science", "retired_term", "law"] }));

    expect(result.disciplines).toEqual(["computer_science", "law"]);
  });

  it("treats an unrecognised degree level or citizenship as not told", () => {
    const result = fromProfileRow(row({ degree_level: "diploma" as never, citizenship: "martian" as never }));

    expect(result.degreeLevel).toBeNull();
    expect(result.citizenship).toBeNull();
  });
});

describe("toStudentProfile: what the eligibility engine is given", () => {
  it("passes through exactly the four things the engine judges", () => {
    expect(toStudentProfile(INPUT)).toEqual({
      expectedGraduation: { year: 2027, month: 6 },
      degreeLevel: "undergraduate",
      disciplines: ["computer_science", "mathematics_statistics"],
      citizenship: "au_citizen",
    });
  });

  it("does not hand the engine the university, alerts or any other private detail", () => {
    expect(Object.keys(toStudentProfile(INPUT)).sort()).toEqual([
      "citizenship",
      "degreeLevel",
      "disciplines",
      "expectedGraduation",
    ]);
  });

  it("represents a student who has told us nothing as all-empty, never a guess", () => {
    const nothing = fromProfileRow(
      row({ expected_graduation: null, degree_level: null, disciplines: [], citizenship: null }),
    );

    expect(toStudentProfile(nothing)).toEqual({
      expectedGraduation: null,
      degreeLevel: null,
      disciplines: [],
      citizenship: null,
    });
  });
});
