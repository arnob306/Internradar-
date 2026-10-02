import { defineConfig } from "vitest/config";

export default defineConfig({
  // Next rewrites tsconfig's jsx to "preserve", so the test transform sets it explicitly.
  // Vite 8 transforms with oxc, not esbuild.
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    include: ["src/**/*.test.{ts,tsx}", "test/**/*.test.{ts,tsx}"],
    setupFiles: ["test/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}"],
      thresholds: { lines: 85, branches: 80, functions: 85, statements: 85 },
    },
  },
});
