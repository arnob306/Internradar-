import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "./contrast";

/**
 * The design's accessibility promise, checked against the real stylesheet: every text colour
 * meets WCAG AA (4.5:1) on the background it sits on, and form-control borders meet 3:1, in
 * both themes. Change a colour in tokens.css and this tells you if it broke the promise.
 */
const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function block(selector: string): Record<string, string> {
  const match = new RegExp(`${escapeRegExp(selector)}\\s*\\{([^}]*)\\}`).exec(css);
  if (match?.[1] === undefined) {
    throw new Error(`tokens.css has no block for ${selector}`);
  }
  const tokens: Record<string, string> = {};
  for (const [, name, value] of match[1].matchAll(/--color-([a-z-]+)\s*:\s*([^;]+);/g)) {
    if (name !== undefined && value !== undefined) {
      tokens[name] = value.trim();
    }
  }
  return tokens;
}

const light = block(":root");
const dark = block(':root[data-theme="dark"]');
const darkByPreference = block(':root:not([data-theme="light"])');

// [foreground, background, minimum ratio]
const PAIRS: readonly (readonly [string, string, number])[] = [
  ["ink", "bg", 4.5],
  ["ink", "surface", 4.5],
  ["muted", "surface", 4.5],
  ["muted", "bg", 4.5],
  ["accent", "surface", 4.5],
  ["on-accent", "accent", 4.5],
  ["open-fg", "open-bg", 4.5],
  ["soon-fg", "soon-bg", 4.5],
  ["closed-fg", "closed-bg", 4.5],
  ["unknown-fg", "unknown-bg", 4.5],
  ["elig-yes", "surface", 4.5],
  ["elig-maybe", "surface", 4.5],
  ["elig-no", "surface", 4.5],
  ["control-border", "surface", 3],
];

describe.each([
  ["light", light],
  ["dark", dark],
])("%s theme", (_name, tokens) => {
  it.each(PAIRS)("%s on %s meets %d:1", (fg, bg, minimum) => {
    const foreground = tokens[fg];
    const background = tokens[bg];
    expect(foreground, `--color-${fg} is defined`).toBeDefined();
    expect(background, `--color-${bg} is defined`).toBeDefined();

    expect(contrastRatio(foreground ?? "", background ?? "")).toBeGreaterThanOrEqual(minimum);
  });
});

describe("theme switching", () => {
  it("defines the same tokens in both themes", () => {
    expect(Object.keys(dark).sort()).toEqual(Object.keys(light).sort());
  });

  it("follows the system dark preference with the same values as the explicit dark theme", () => {
    expect(darkByPreference).toEqual(dark);
  });
});
