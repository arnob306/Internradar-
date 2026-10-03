import { describe, expect, it } from "vitest";
import { parseEmail } from "./email";

describe("parseEmail", () => {
  it("accepts an ordinary address and normalises it to lower case without spaces", () => {
    expect(parseEmail("  Student.Name@Student.Unimelb.edu.au  ")).toBe("student.name@student.unimelb.edu.au");
  });

  it.each(["a@b.co", "first.last+tag@sub.example.com", "o'brien@example.org", "x_y-z@example.io"])(
    "accepts %s",
    (email) => {
      expect(parseEmail(email)).toBe(email.toLowerCase());
    },
  );

  it.each([
    ["nothing", ""],
    ["only spaces", "   "],
    ["no @", "student.example.com"],
    ["no domain", "student@"],
    ["no local part", "@example.com"],
    ["no dot in the domain", "student@localhost"],
    ["two @ signs", "a@b@example.com"],
    ["a space inside", "stu dent@example.com"],
    ["an angle-bracket display name", "Student <student@example.com>"],
    ["a comma-separated list", "a@example.com,b@example.com"],
    ["a semicolon-separated list", "a@example.com;b@example.com"],
    ["a trailing dot", "student@example."],
    ["a leading dot in the domain", "student@.example.com"],
    ["consecutive dots in the domain", "student@example..com"],
    ["a newline, the start of a header injection", "student@example.com\nBcc: victim@example.com"],
    ["a carriage return", "student@example.com\rBcc: victim@example.com"],
    ["a null byte", "student@example.com\u0000"],
    ["a local part over 64 characters", `${"a".repeat(65)}@example.com`],
    ["an address over 254 characters", `a@${"b".repeat(250)}.com`],
  ])("rejects %s", (_name, email) => {
    expect(parseEmail(email)).toBeNull();
  });

  it.each([42, null, undefined, {}, ["a@example.com"], true])("rejects a value that is not a string: %j", (value) => {
    expect(parseEmail(value)).toBeNull();
  });

  it("accepts the longest allowed local part", () => {
    const email = `${"a".repeat(64)}@example.com`;

    expect(parseEmail(email)).toBe(email);
  });
});
