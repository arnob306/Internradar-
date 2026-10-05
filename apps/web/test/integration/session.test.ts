import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSessionClient } from "../../src/server/auth/session-client";
import { cleanTestUsers, MemoryJar, newTestUser, sessionEnv, withAdmin } from "./helpers";

beforeEach(() => withAdmin(cleanTestUsers));
afterEach(() => withAdmin(cleanTestUsers));

describe("the session, as cookies, against real Supabase Auth", () => {
  it("signs a user in and keeps them signed in across separate requests", async () => {
    const jar = new MemoryJar();
    const user = newTestUser();

    const signUp = await createSessionClient(jar, { env: sessionEnv() }).auth.signUp(user);
    expect(signUp.error).toBeNull();

    // A later request is a brand-new client that has only the cookies to go on.
    const later = await createSessionClient(jar, { env: sessionEnv() }).auth.getUser();
    expect(later.error).toBeNull();
    expect(later.data.user?.email).toBe(user.email);
  });

  it("sets only cookies that are httpOnly, SameSite=Lax and site-wide", async () => {
    const jar = new MemoryJar();

    await createSessionClient(jar, { env: sessionEnv() }).auth.signUp(newTestUser());

    expect(jar.cookies.size).toBeGreaterThan(0);
    for (const [name, { options }] of jar.cookies) {
      expect(options["httpOnly"], `${name} httpOnly`).toBe(true);
      expect(options["sameSite"], `${name} sameSite`).toBe("lax");
      expect(options["path"], `${name} path`).toBe("/");
      expect(options, `${name} domain`).not.toHaveProperty("domain");
    }
  });

  it("marks them Secure in production", async () => {
    const jar = new MemoryJar();

    await createSessionClient(jar, { env: sessionEnv(), production: true }).auth.signUp(newTestUser());

    for (const [name, { options }] of jar.cookies) {
      expect(options["secure"], `${name} secure`).toBe(true);
    }
  });

  it("treats a visitor with no cookies as anonymous", async () => {
    const { data } = await createSessionClient(new MemoryJar(), { env: sessionEnv() }).auth.getUser();

    expect(data.user).toBeNull();
  });

  it("treats tampered cookies as anonymous, never as someone else", async () => {
    const jar = new MemoryJar();
    await createSessionClient(jar, { env: sessionEnv() }).auth.signUp(newTestUser());
    for (const [name, stored] of jar.cookies) {
      jar.cookies.set(name, { ...stored, value: `${stored.value.slice(0, -6)}XXXXXX` });
    }

    const { data } = await createSessionClient(jar, { env: sessionEnv() }).auth.getUser();

    expect(data.user).toBeNull();
  });

  it("signs out: the cookies go, and the next request is anonymous", async () => {
    const jar = new MemoryJar();
    const client = createSessionClient(jar, { env: sessionEnv() });
    await client.auth.signUp(newTestUser());

    await client.auth.signOut();

    expect(jar.cookies.size).toBe(0);
    const { data } = await createSessionClient(jar, { env: sessionEnv() }).auth.getUser();
    expect(data.user).toBeNull();
  });

  it("hands back cache headers to put on any response that sets a session cookie", async () => {
    const received: Record<string, string>[] = [];

    await createSessionClient(new MemoryJar(), {
      env: sessionEnv(),
      onHeaders: (headers) => received.push(headers),
    }).auth.signUp(newTestUser());

    expect(received.length).toBeGreaterThan(0);
    const cacheControl = Object.entries(received[0] ?? {}).find(([name]) => name.toLowerCase() === "cache-control");
    expect(cacheControl?.[1]).toMatch(/no-store|no-cache|private/);
  });
});
