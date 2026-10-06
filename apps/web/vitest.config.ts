import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  // Next rewrites tsconfig's jsx to "preserve", so the test transform sets it explicitly.
  // Vite 8 transforms with oxc, not esbuild.
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    include: ["src/**/*.test.{ts,tsx}", "test/**/*.test.{ts,tsx}"],
    // Integration tests need the local database; they run with `pnpm test:integration`.
    exclude: [...configDefaults.exclude, "test/integration/**"],
    setupFiles: ["test/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        // Generated from the migrations; a CI check keeps it current, so there is nothing to test.
        "src/server/db/database.types.ts",
        // Thin wiring with no logic of its own: the tested handlers do the work, and `next build`
        // plus the end-to-end sign-in run check the connections.
        "src/app/layout.tsx",
        "src/app/**/route.ts",
        "src/server/auth/request-session.ts",
        // These talk to the real database and are tested against it, so their coverage is
        // measured by the integration suite (vitest.integration.config.ts), not here.
        "src/server/rate-limit.ts",
        "src/server/auth/session-client.ts",
        "src/server/profile/profile-repo.ts",
        "src/server/programs/list-programs.ts",
      ],
      thresholds: { lines: 85, branches: 80, functions: 85, statements: 85 },
    },
  },
});
