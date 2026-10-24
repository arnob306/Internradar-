import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSessionClient } from "../../src/server/auth/session-client";
import { signOutThisDevice } from "../../src/server/auth/sign-out-session";
import { cleanTestUsers, MemoryJar, newTestUser, sessionEnv, withAdmin } from "./helpers";

beforeEach(() => withAdmin(cleanTestUsers));
afterEach(() => withAdmin(cleanTestUsers));

async function twoDevices() {
  const user = newTestUser();
  const laptop = createSessionClient(new MemoryJar(), { env: sessionEnv() });
  const phone = createSessionClient(new MemoryJar(), { env: sessionEnv() });
  expect((await laptop.auth.signUp(user)).error).toBeNull();
  expect((await phone.auth.signInWithPassword(user)).error).toBeNull();
  return { laptop, phone };
}

const signedIn = async (client: ReturnType<typeof createSessionClient>) =>
  (await client.auth.getUser()).data.user !== null;

describe("signOutThisDevice", () => {
  it("ends this device's session", async () => {
    const { laptop } = await twoDevices();

    await signOutThisDevice(laptop);

    expect(await signedIn(laptop)).toBe(false);
  });

  it("leaves the same account's other devices signed in", async () => {
    const { laptop, phone } = await twoDevices();

    await signOutThisDevice(laptop);

    expect(await signedIn(phone)).toBe(true);
  });

  it("is safe to call when already signed out", async () => {
    const { laptop } = await twoDevices();
    await signOutThisDevice(laptop);

    await expect(signOutThisDevice(laptop)).resolves.toBeUndefined();
  });
});
