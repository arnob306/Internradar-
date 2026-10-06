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
    // The modules that talk to the database are tested here, against the real thing, so this is
    // where their coverage is measured (the unit-test gate leaves them out on purpose). The
    // thresholds apply when run with --coverage, as CI's database job does.
    coverage: {
      provider: "v8",
      include: [
        "src/server/rate-limit.ts",
        "src/server/auth/session-client.ts",
        "src/server/auth/sign-out-session.ts",
        "src/server/profile/profile-repo.ts",
        "src/server/programs/list-programs.ts",
      ],
      thresholds: { lines: 90, statements: 90, functions: 90, branches: 75 },
    },
  },
});
