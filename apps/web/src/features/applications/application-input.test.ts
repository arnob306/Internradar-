import { describe, expect, it } from "vitest";
import { parseApplicationId, parseApplicationPatch, parseSaveInput } from "./application-input";

const ID = "3f2b8c1e-5a6d-4e7f-9a0b-1c2d3e4f5a6b";

describe("parseApplicationId", () => {
  it("accepts a uuid, in any letter case", () => {
    expect(parseApplicationId(ID)).toBe(ID);
    expect(parseApplicationId(ID.toUpperCase())).toBe(ID.toUpperCase());
  });

  it.each(["", "abc", "../etc", `${ID}x`, ` ${ID}`, "3f2b8c1e5a6d4e7f9a0b1c2d3e4f5a6b", `${ID}%00`])(
    "refuses %j",
    (value) => {
      expect(parseApplicationId(value)).toBeNull();
    },
  );
});

describe("parseSaveInput", () => {
  it("accepts a program id and nothing else", () => {
    expect(parseSaveInput({ programId: ID })).toEqual({ ok: true, value: { programId: ID } });
  });

  it.each([null, undefined, [], "x", 3])("needs a JSON object, not %j", (body) => {
    expect(parseSaveInput(body)).toEqual({
      ok: false,
      fields: [{ field: "body", message: "The request must be a JSON object." }],
    });
  });

  it("needs the program id", () => {
    const result = parseSaveInput({});
    expect(result.ok).toBe(false);
    expect(!result.ok && result.fields[0]?.field).toBe("programId");
  });

  it.each([3, null, "", "not-a-uuid", ["a"]])("refuses programId %j", (programId) => {
    expect(parseSaveInput({ programId }).ok).toBe(false);
  });

  it.each(["userId", "user_id", "status", "cycleYear", "appliedAt", "id"])(
    "refuses a client-supplied %s, because the server decides it",
    (key) => {
      const result = parseSaveInput({ programId: ID, [key]: "x" });
      expect(result.ok).toBe(false);
      expect(!result.ok && result.fields.map((field) => field.field)).toEqual([key]);
    },
  );
});

describe("parseApplicationPatch", () => {
  it("accepts only the fields that were sent", () => {
    expect(parseApplicationPatch({ status: "applied" })).toEqual({ ok: true, value: { status: "applied" } });
    expect(parseApplicationPatch({ notes: "Phone screen on Friday" })).toEqual({
      ok: true,
      value: { notes: "Phone screen on Friday" },
    });
    expect(parseApplicationPatch({ resumeId: ID })).toEqual({ ok: true, value: { resumeId: ID } });
  });

  it("can clear the notes and the resume with null", () => {
    expect(parseApplicationPatch({ notes: null, resumeId: null })).toEqual({
      ok: true,
      value: { notes: null, resumeId: null },
    });
  });

  it("treats blank notes as no notes", () => {
    expect(parseApplicationPatch({ notes: "   " })).toEqual({ ok: true, value: { notes: null } });
  });

  it("keeps line breaks in notes", () => {
    expect(parseApplicationPatch({ notes: "one\ntwo" })).toEqual({ ok: true, value: { notes: "one\ntwo" } });
  });

  it("changes nothing when nothing is sent, and says so", () => {
    expect(parseApplicationPatch({})).toEqual({
      ok: false,
      fields: [{ field: "body", message: "Send at least one of: status, notes, resumeId." }],
    });
  });

  it.each([null, [], "x", 3])("needs a JSON object, not %j", (body) => {
    expect(parseApplicationPatch(body).ok).toBe(false);
  });

  it.each(["Applied", "withdrawn", "", 3, null])("refuses status %j", (status) => {
    expect(parseApplicationPatch({ status }).ok).toBe(false);
  });

  it("allows notes up to 2000 characters, and no more", () => {
    expect(parseApplicationPatch({ notes: "a".repeat(2000) }).ok).toBe(true);
    expect(parseApplicationPatch({ notes: "a".repeat(2001) }).ok).toBe(false);
  });

  it.each([3, ["a"], "bad\u0000note", "bell\u0007"])("refuses notes %j", (notes) => {
    expect(parseApplicationPatch({ notes }).ok).toBe(false);
  });

  it.each(["", "nope", 4])("refuses resumeId %j", (resumeId) => {
    expect(parseApplicationPatch({ resumeId }).ok).toBe(false);
  });

  it.each(["userId", "user_id", "programId", "appliedAt", "cycleYear", "id"])("refuses %s", (key) => {
    const result = parseApplicationPatch({ status: "applied", [key]: "x" });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.fields.map((field) => field.field)).toEqual([key]);
  });

  it("reports every problem at once", () => {
    const result = parseApplicationPatch({ status: "nope", notes: 3, resumeId: "x" });
    expect(!result.ok && result.fields.map((field) => field.field)).toEqual(["status", "notes", "resumeId"]);
  });
});
