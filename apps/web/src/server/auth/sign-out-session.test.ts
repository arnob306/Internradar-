import { describe, expect, it, vi } from "vitest";
import { SignOutError, signOutThisDevice } from "./sign-out-session";

function client(result: { error: { code?: string; message: string } | null }) {
  const signOut = vi.fn(() => Promise.resolve(result));
  return { signOut, client: { auth: { signOut } } as unknown as Parameters<typeof signOutThisDevice>[0] };
}

describe("signOutThisDevice: the failure paths a real database cannot easily produce", () => {
  it("asks for the local scope, never the library's global default", async () => {
    const { signOut, client: stub } = client({ error: null });

    await signOutThisDevice(stub);

    expect(signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
  });

  it("fails with only the service's error code, never its message", async () => {
    const { client: stub } = client({ error: { code: "session_not_found", message: "secret internal detail" } });

    const failure = await signOutThisDevice(stub).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(SignOutError);
    expect((failure as SignOutError).code).toBe("session_not_found");
    expect((failure as Error).message).not.toContain("secret");
  });

  it("says 'unknown' when the service gives no code", async () => {
    const { client: stub } = client({ error: { message: "boom" } });

    expect(((await signOutThisDevice(stub).catch((error: unknown) => error)) as SignOutError).code).toBe("unknown");
  });
});
