import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    supabaseUrl: string;
    supabaseAnonKey: string;
  }
}

function fromStatus(): { url: string; anonKey: string } {
  // The local stack's API URL and anon key come from `supabase status`; the anon key is a
  // publishable key (it only ever has the anonymous role's access), but is still not hard-coded.
  const cwd = fileURLToPath(new URL("../../../../packages/db", import.meta.url));
  const output = execSync("pnpm exec supabase status -o env", {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const read = (name: string): string => {
    const match = new RegExp(`^${name}="?([^"\\r\\n]+)"?`, "m").exec(output);
    if (match?.[1] === undefined) {
      throw new Error(`supabase status printed no ${name}: is the local stack running?`);
    }
    return match[1];
  };
  return { url: read("API_URL"), anonKey: read("ANON_KEY") };
}

export default function setup(project: TestProject): void {
  const url = process.env["SUPABASE_URL"];
  const anonKey = process.env["SUPABASE_ANON_KEY"];
  const resolved = url !== undefined && anonKey !== undefined ? { url, anonKey } : fromStatus();
  project.provide("supabaseUrl", resolved.url);
  project.provide("supabaseAnonKey", resolved.anonKey);
}
