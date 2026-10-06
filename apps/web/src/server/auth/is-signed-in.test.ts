import { describe, expect, it, vi } from "vitest";
import { isSignedIn } from "./is-signed-in";

function client(getUser: () => Promise<unknown>) {
  return { auth: { getUser } } as unknown as Parameters<typeof isSignedIn>[0];
}

describe("isSignedIn", () => {
  it("is true when the auth server knows the user", async () => {
    expect(await isSignedIn(client(() => Promise.resolve({ data: { user: { id: "u1" } } })))).toBe(true);
  });

  it("is false for a visitor", async () => {
    expect(await isSignedIn(client(() => Promise.resolve({ data: { user: null } })))).toBe(false);
  });

  it("is false, never an error, when the lookup fails, and records a safe summary", async () => {
    const failure = new Error("auth down");
    const log = vi.fn();

    expect(await isSignedIn(client(() => Promise.reject(failure)), log)).toBe(false);
    expect(log).toHaveBeenCalledExactlyOnceWith("auth.is-signed-in", failure);
  });
});
