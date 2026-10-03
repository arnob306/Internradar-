import { describe, expect, it } from "vitest";
import { parseProfileInput } from "./profile-input";

function fieldsOf(body: unknown): string[] {
  const result = parseProfileInput(body);
  if (result.ok) {
    throw new Error("expected the profile to be rejected");
  }
  return result.fields.map((error) => error.field);
}

const FULL = {
  expectedGraduation: { year: 2027, month: 6 },
  degreeLevel: "undergraduate",
  disciplines: ["computer_science", "mathematics_statistics"],
  isDoubleDegree: true,
  planningHonours: false,
  citizenship: "au_citizen",
  university: "University of Melbourne",
  emailAlerts: false,
};

describe("parseProfileInput", () => {
  it("accepts a complete profile as given", () => {
    expect(parseProfileInput(FULL)).toEqual({ ok: true, value: FULL });
  });

  it("treats an empty profile as 'told us nothing yet', with alerts on by default", () => {
    expect(parseProfileInput({})).toEqual({
      ok: true,
      value: {
        expectedGraduation: null,
        degreeLevel: null,
        disciplines: [],
        isDoubleDegree: false,
        planningHonours: false,
        citizenship: null,
        university: null,
        emailAlerts: true,
      },
    });
  });

  it("accepts explicit nulls for the optional fields", () => {
    const result = parseProfileInput({ expectedGraduation: null, degreeLevel: null, citizenship: null, university: null });

    expect(result.ok).toBe(true);
  });

  it.each([null, [], "profile", 42, true])("rejects a body that is not an object: %j", (body) => {
    expect(fieldsOf(body)).toEqual(["body"]);
  });

  it("rejects unknown keys, including a user_id, which only ever comes from the session", () => {
    expect(fieldsOf({ user_id: "00000000-0000-4000-8000-000000000001" })).toEqual(["user_id"]);
    expect(fieldsOf({ wam: 75 })).toEqual(["wam"]);
  });

  describe("expectedGraduation", () => {
    it.each([
      [{ year: 1999, month: 6 }],
      [{ year: 2101, month: 6 }],
      [{ year: 2027, month: 0 }],
      [{ year: 2027, month: 13 }],
      [{ year: 2027.5, month: 6 }],
      [{ year: "2027", month: 6 }],
      [{ year: 2027 }],
      [{ year: 2027, month: 6, day: 1 }],
      ["2027-06"],
    ])("rejects %j", (value) => {
      expect(fieldsOf({ expectedGraduation: value })).toEqual(["expectedGraduation"]);
    });

    it("accepts the edges of the range", () => {
      expect(parseProfileInput({ expectedGraduation: { year: 2000, month: 1 } }).ok).toBe(true);
      expect(parseProfileInput({ expectedGraduation: { year: 2100, month: 12 } }).ok).toBe(true);
    });
  });

  describe("degreeLevel and citizenship", () => {
    it.each(["undergraduate", "honours", "masters_coursework", "masters_research", "phd"])(
      "accepts the degree level %s",
      (degreeLevel) => {
        expect(parseProfileInput({ degreeLevel }).ok).toBe(true);
      },
    );

    it("rejects a degree level that is not in the vocabulary", () => {
      expect(fieldsOf({ degreeLevel: "diploma" })).toEqual(["degreeLevel"]);
    });

    it.each(["au_citizen", "au_pr", "nz_citizen", "intl_student", "other"])(
      "accepts the citizenship %s",
      (citizenship) => {
        expect(parseProfileInput({ citizenship }).ok).toBe(true);
      },
    );

    it("rejects a citizenship that is not in the vocabulary", () => {
      expect(fieldsOf({ citizenship: "martian" })).toEqual(["citizenship"]);
    });
  });

  describe("disciplines", () => {
    it("rejects an unknown degree area", () => {
      expect(fieldsOf({ disciplines: ["underwater_basket_weaving"] })).toEqual(["disciplines"]);
    });

    it("rejects the 'any STEM' group: a student names real degree areas", () => {
      expect(fieldsOf({ disciplines: ["stem_any"] })).toEqual(["disciplines"]);
    });

    it("rejects something that is not a list of strings", () => {
      expect(fieldsOf({ disciplines: "computer_science" })).toEqual(["disciplines"]);
      expect(fieldsOf({ disciplines: [1] })).toEqual(["disciplines"]);
    });

    it("drops duplicates, keeping the first of each in order", () => {
      const result = parseProfileInput({ disciplines: ["law", "physics", "law"] });

      expect(result.ok && result.value.disciplines).toEqual(["law", "physics"]);
    });

    it("allows at most 6, enough for a double degree with majors", () => {
      const six = ["law", "physics", "accounting", "economics", "data_science", "computer_science"];

      expect(parseProfileInput({ disciplines: six }).ok).toBe(true);
      expect(fieldsOf({ disciplines: [...six, "mathematics_statistics"] })).toEqual(["disciplines"]);
    });
  });

  describe("the yes/no fields", () => {
    it.each(["isDoubleDegree", "planningHonours", "emailAlerts"])(
      "%s must be true or false, not a string or a number",
      (field) => {
        expect(fieldsOf({ [field]: "true" })).toEqual([field]);
        expect(fieldsOf({ [field]: 1 })).toEqual([field]);
      },
    );
  });

  describe("university", () => {
    it("trims it and treats a blank as not given", () => {
      expect(parseProfileInput({ university: "  Monash University  " })).toMatchObject({
        ok: true,
        value: { university: "Monash University" },
      });
      expect(parseProfileInput({ university: "   " })).toMatchObject({ ok: true, value: { university: null } });
    });

    it("rejects an over-long name and control characters", () => {
      expect(fieldsOf({ university: "x".repeat(121) })).toEqual(["university"]);
      expect(fieldsOf({ university: "Monash\u0000University" })).toEqual(["university"]);
      expect(fieldsOf({ university: 5 })).toEqual(["university"]);
    });

    it("accepts the longest allowed name", () => {
      expect(parseProfileInput({ university: "x".repeat(120) }).ok).toBe(true);
    });
  });

  it("reports every problem at once, each with a message", () => {
    const result = parseProfileInput({ degreeLevel: "diploma", citizenship: "martian", wam: 80 });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fields.map((error) => error.field).sort()).toEqual(["citizenship", "degreeLevel", "wam"]);
      for (const error of result.fields) {
        expect(error.message.length).toBeGreaterThan(5);
      }
    }
  });
});
