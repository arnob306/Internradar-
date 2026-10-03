import { defineConfig } from "vitest/config";

// Integration tests talk to the real local Supabase stack (`pnpm db:start`) as the anonymous
// role, so row-level security decides what they see. They run apart from the unit tests: no
// msw server (real requests must go through), and one file at a time because they share a database.
export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    include: ["test/integration/**/*.test.ts"],
    globalSetup: ["test/integration/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
