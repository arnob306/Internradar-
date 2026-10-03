import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { inject } from "vitest";
import { createSessionClient, type CookieJar } from "../../src/server/auth/session-client";
import { cleanTestUsers, newTestUser, withAdmin } from "./helpers";

interface Stored {
  value: string;
  options: Record<string, unknown>;
}

/** A browser's cookie store, in memory: what the server read and wrote, so a test can inspect it. */
class MemoryJar implements CookieJar {
  readonly cookies = new Map<string, Stored>();

  getAll(): { name: string; value: string }[] {
    return [...this.cookies].map(([name, stored]) => ({ name, value: stored.value }));
  }

  set(name: string, value: string, options: Record<string, unknown>): void {
    // A cookie set to expire immediately is a deletion, as in a real browser.
    if (value === "" || options["maxAge"] === 0) {
      this.cookies.delete(name);
      return;
    }
    this.cookies.set(name, { value, options });
  }
}

function env() {
  return { SUPABASE_URL: inject("supabaseUrl"), SUPABASE_ANON_KEY: inject("supabaseAnonKey") };
}

beforeEach(() => withAdmin(cleanTestUsers));
afterEach(() => withAdmin(cleanTestUsers));

describe("the session, as cookies, against real Supabase Auth", () => {
  it("signs a user in and keeps them signed in across separate requests", async () => {
    const jar = new MemoryJar();
    const user = newTestUser();

    const signUp = await createSessionClient(jar, { env: env() }).auth.signUp(user);
    expect(signUp.error).toBeNull();

    // A later request is a brand-new client that has only the cookies to go on.
    const later = await createSessionClient(jar, { env: env() }).auth.getUser();
    expect(later.error).toBeNull();
    expect(later.data.user?.email).toBe(user.email);
  });

  it("sets only cookies that are httpOnly, SameSite=Lax and site-wide", async () => {
    const jar = new MemoryJar();

    await createSessionClient(jar, { env: env() }).auth.signUp(newTestUser());

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

    await createSessionClient(jar, { env: env(), production: true }).auth.signUp(newTestUser());

    for (const [name, { options }] of jar.cookies) {
      expect(options["secure"], `${name} secure`).toBe(true);
    }
  });

  it("treats a visitor with no cookies as anonymous", async () => {
    const { data } = await createSessionClient(new MemoryJar(), { env: env() }).auth.getUser();

    expect(data.user).toBeNull();
  });

  it("treats tampered cookies as anonymous, never as someone else", async () => {
    const jar = new MemoryJar();
    await createSessionClient(jar, { env: env() }).auth.signUp(newTestUser());
    for (const [name, stored] of jar.cookies) {
      jar.cookies.set(name, { ...stored, value: `${stored.value.slice(0, -6)}XXXXXX` });
    }

    const { data } = await createSessionClient(jar, { env: env() }).auth.getUser();

    expect(data.user).toBeNull();
  });

  it("signs out: the cookies go, and the next request is anonymous", async () => {
    const jar = new MemoryJar();
    const client = createSessionClient(jar, { env: env() });
    await client.auth.signUp(newTestUser());

    await client.auth.signOut();

    expect(jar.cookies.size).toBe(0);
    const { data } = await createSessionClient(jar, { env: env() }).auth.getUser();
    expect(data.user).toBeNull();
  });

  it("hands back cache headers to put on any response that sets a session cookie", async () => {
    const received: Record<string, string>[] = [];

    await createSessionClient(new MemoryJar(), {
      env: env(),
      onHeaders: (headers) => received.push(headers),
    }).auth.signUp(newTestUser());

    expect(received.length).toBeGreaterThan(0);
    const cacheControl = Object.entries(received[0] ?? {}).find(([name]) => name.toLowerCase() === "cache-control");
    expect(cacheControl?.[1]).toMatch(/no-store|no-cache|private/);
  });
});
