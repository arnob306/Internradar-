import path from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const eslint = new ESLint({ cwd: repoRoot });

async function lint(code: string, repoRelativePath: string) {
  const [result] = await eslint.lintText(code, {
    filePath: path.join(repoRoot, repoRelativePath),
  });
  return result?.messages ?? [];
}

describe("domain clock guard", () => {
  const domainFile = "packages/domain/src/example.ts";

  it("rejects Date.now() in packages/domain", async () => {
    const messages = await lint("export const t = Date.now();\n", domainFile);

    expect(messages.map((m) => m.ruleId)).toContain("no-restricted-syntax");
  });

  it("rejects new Date() with no arguments in packages/domain", async () => {
    const messages = await lint("export const d = new Date();\n", domainFile);

    expect(messages.map((m) => m.ruleId)).toContain("no-restricted-syntax");
  });

  it("allows new Date(value) with an explicit argument", async () => {
    const messages = await lint(
      "export const d = (iso: string) => new Date(iso);\n",
      domainFile,
    );

    expect(messages).toEqual([]);
  });

  it("does not apply the clock guard outside packages/domain", async () => {
    const messages = await lint(
      "export const t = Date.now();\n",
      "apps/web/src/system-clock.ts",
    );

    expect(messages).toEqual([]);
  });
});

describe("service-role key guard", () => {
  const usage = "export const key = process.env.SUPABASE_SERVICE_ROLE_KEY;\n";

  it("rejects the service-role key outside the admin module", async () => {
    const messages = await lint(usage, "apps/web/src/lib/db.ts");

    expect(messages.map((m) => m.ruleId)).toContain("no-restricted-syntax");
  });

  it("rejects the key when read through bracket access", async () => {
    const messages = await lint(
      'export const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];\n',
      "apps/web/src/lib/db.ts",
    );

    expect(messages.map((m) => m.ruleId)).toContain("no-restricted-syntax");
  });

  it("allows the key inside apps/web/src/server/admin", async () => {
    const messages = await lint(usage, "apps/web/src/server/admin/deleteAccount.ts");

    expect(messages).toEqual([]);
  });
});
