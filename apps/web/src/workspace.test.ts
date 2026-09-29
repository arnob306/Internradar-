import { ok } from "@internradar/domain";
import { describe, expect, it } from "vitest";

describe("workspace wiring", () => {
  it("resolves @internradar/domain from apps/web", () => {
    expect(ok("hello").data).toBe("hello");
  });
});
