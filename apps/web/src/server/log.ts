/**
 * Record a failure on the server without recording anything sensitive. The repository and its
 * logs are public, and a database error's message can name tables, columns or connection
 * details, so only three things are ever written: where it happened, what kind of error it was,
 * and a short database error code if it carries one (such as "42P01"). Never the message,
 * never the stack, and never the value that was thrown.
 */
export function logFailure(scope: string, error: unknown): void {
  const entry: Record<string, string> = {
    level: "error",
    scope,
    error: error instanceof Error ? error.name : "NonError",
  };

  const code = error instanceof Error ? (error as { code?: unknown }).code : undefined;
  if (typeof code === "string" && code.length > 0 && code.length <= 20) {
    entry["code"] = code;
  }

  console.error(JSON.stringify(entry));
}
