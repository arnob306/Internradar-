import { beforeEach, describe, expect, it, vi } from "vitest";

const permanentRedirect = vi.fn();
vi.mock("next/navigation", () => ({
  permanentRedirect: (...args: unknown[]) => permanentRedirect(...args),
}));

import TimelinePage from "./page";

beforeEach(() => permanentRedirect.mockReset());

describe("the old timeline address", () => {
  it("sends anyone who still has it to the home page, where the timeline now lives", () => {
    TimelinePage();

    expect(permanentRedirect).toHaveBeenCalledExactlyOnceWith("/");
  });
});
