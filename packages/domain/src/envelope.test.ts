import { describe, expect, it } from "vitest";
import { fail, ok } from "./envelope";

describe("ok", () => {
  it("wraps data in a success envelope with null error", () => {
    expect(ok({ id: 1 })).toEqual({
      success: true,
      data: { id: 1 },
      error: null,
      meta: null,
    });
  });

  it("includes pagination metadata when given", () => {
    const envelope = ok([1, 2], { total: 10, page: 1, limit: 2 });

    expect(envelope.meta).toEqual({ total: 10, page: 1, limit: 2 });
  });
});

describe("fail", () => {
  it("wraps a code and message in an error envelope with null data", () => {
    expect(fail("NOT_FOUND", "No such application")).toEqual({
      success: false,
      data: null,
      error: { code: "NOT_FOUND", message: "No such application" },
      meta: null,
    });
  });

  it("carries field errors for validation failures", () => {
    const envelope = fail("VALIDATION_ERROR", "Invalid query", [
      { field: "limit", message: "Must be between 1 and 100" },
    ]);

    expect(envelope.error?.fields).toEqual([
      { field: "limit", message: "Must be between 1 and 100" },
    ]);
  });

  it("omits the fields key when there are no field errors", () => {
    const envelope = fail("NOT_FOUND", "No such application");

    expect(envelope.error).not.toHaveProperty("fields");
  });
});
