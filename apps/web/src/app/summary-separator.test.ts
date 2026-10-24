import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The dots between the summary items are drawn by CSS. Some screen readers read generated text aloud
// ("middle dot"), so the rule must give it an empty alternative: `content: "·" / ""`.
const css = readFileSync(fileURLToPath(new URL("./globals.css", import.meta.url)), "utf8");

describe("the home page summary separator", () => {
  it("is decoration, so it carries an empty text alternative", () => {
    const rule = /\.timeline-page \.summary li \+ li::before\s*\{([^}]*)\}/.exec(css);

    expect(rule).not.toBeNull();
    expect(rule?.[1]).toMatch(/content:\s*"·"\s*\/\s*""\s*;/);
  });
});
