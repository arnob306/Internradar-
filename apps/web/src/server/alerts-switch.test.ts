import { afterEach, describe, expect, it, vi } from "vitest";
import { alertsEnabled } from "./alerts-switch";

afterEach(() => vi.unstubAllEnvs());

describe("alertsEnabled", () => {
  it("is off when nothing is set", () => {
    expect(alertsEnabled({})).toBe(false);
  });

  it("is on only for the exact value 'true'", () => {
    expect(alertsEnabled({ ALERTS_ENABLED: "true" })).toBe(true);
  });

  it.each(["", "TRUE", "True", "1", "yes", "on", "false", " true", "true "])(
    "stays off for %j, so a typo can never switch alerts on",
    (value) => {
      expect(alertsEnabled({ ALERTS_ENABLED: value })).toBe(false);
    },
  );

  it("reads the real environment by default", () => {
    vi.stubEnv("ALERTS_ENABLED", "true");
    expect(alertsEnabled()).toBe(true);
    vi.stubEnv("ALERTS_ENABLED", "nope");
    expect(alertsEnabled()).toBe(false);
  });
});
