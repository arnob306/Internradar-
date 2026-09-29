import js from "@eslint/js";
import tseslint from "typescript-eslint";

/**
 * Guards from the architecture docs, enforced mechanically:
 *  - packages/domain never reads the system clock; "now" is injected (test plan §1).
 *  - The Supabase service-role key is only referenced inside
 *    apps/web/src/server/admin/ (ADR-005). VERIFY: Supabase is renaming its keys;
 *    if the variable name changes, update SERVICE_ROLE_PATTERN below.
 */
const SERVICE_ROLE_PATTERN = "SERVICE_ROLE";

const domainClockRules = [
  {
    selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
    message: "Do not read the system clock in packages/domain. Take a Clock and call clock.now().",
  },
  {
    selector: "NewExpression[callee.name='Date'][arguments.length=0]",
    message: "new Date() reads the system clock. Take a Clock, or pass an explicit value.",
  },
];

const serviceRoleRules = [
  {
    selector: `Identifier[name=/${SERVICE_ROLE_PATTERN}/]`,
    message: "The service-role key may only be used in apps/web/src/server/admin/.",
  },
  {
    selector: `Literal[value=/${SERVICE_ROLE_PATTERN}/]`,
    message: "The service-role key may only be used in apps/web/src/server/admin/.",
  },
];

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/coverage/**",
      "**/.venv/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["packages/domain/src/**/*.ts"],
    ignores: ["**/*.test.ts"],
    rules: { "no-restricted-syntax": ["error", ...domainClockRules] },
  },
  {
    files: ["apps/web/src/**/*.{ts,tsx}"],
    ignores: ["apps/web/src/server/admin/**"],
    rules: { "no-restricted-syntax": ["error", ...serviceRoleRules] },
  },
);
