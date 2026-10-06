import type { Envelope } from "@internradar/domain";
import { describe, expect, it, vi } from "vitest";
import type { ProfileInput } from "../../features/profile/profile-input";
import { createProfileHandlers } from "./profile-handler";

const SITE = "https://internradar.example";
const USER_ID = "00000000-0000-4000-8000-0000000000aa";

const SAVED: ProfileInput = {
  expectedGraduation: { year: 2027, month: 6 },
  degreeLevel: "undergraduate",
  disciplines: ["computer_science"],
  isDoubleDegree: false,
  planningHonours: false,
  citizenship: "au_citizen",
  university: "University of Melbourne",
  emailAlerts: true,
};

interface Options {
  userId?: string | null;
  profile?: ProfileInput | null;
  allowed?: boolean;
  saveFails?: Error;
}

function setup({ userId = USER_ID, profile = null, allowed = true, saveFails }: Options = {}) {
  const save = vi.fn<(id: string, input: ProfileInput) => Promise<void>>(() =>
    saveFails === undefined ? Promise.resolve() : Promise.reject(saveFails),
  );
  const load = vi.fn(() => Promise.resolve(profile));
  const allowWrite = vi.fn(() => Promise.resolve(allowed));
  const log = vi.fn();
  const handlers = createProfileHandlers({ getUserId: () => Promise.resolve(userId), load, save, allowWrite, log });
  return { ...handlers, load, save, allowWrite, log };
}

function put(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${SITE}/api/v1/me/profile`, {
    method: "PUT",
    headers: { origin: SITE, "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function get(): Request {
  return new Request(`${SITE}/api/v1/me/profile`);
}

async function read(response: Response) {
  return (await response.json()) as Envelope<ProfileInput>;
}

describe("GET /api/v1/me/profile", () => {
  it("returns the signed-in student's own profile", async () => {
    const { GET } = setup({ profile: SAVED });

    const response = await GET(get());

    expect(response.status).toBe(200);
    expect(await read(response)).toMatchObject({ success: true, data: SAVED, error: null });
  });

  it("returns an empty profile, with alerts on, for someone who has not saved one", async () => {
    const response = await setup({ profile: null }).GET(get());

    expect((await read(response)).data).toEqual({
      expectedGraduation: null,
      degreeLevel: null,
      disciplines: [],
      isDoubleDegree: false,
      planningHonours: false,
      citizenship: null,
      university: null,
      emailAlerts: true,
    });
  });

  it("answers 401 to a visitor, and does not touch the database", async () => {
    const { GET, load } = setup({ userId: null });

    const response = await GET(get());

    expect(response.status).toBe(401);
    expect((await read(response)).error?.code).toBe("UNAUTHENTICATED");
    expect(load).not.toHaveBeenCalled();
  });

  it("is private and never cached, since it holds a student's details", async () => {
    const response = await setup({ profile: SAVED }).GET(get());

    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});

describe("PUT /api/v1/me/profile", () => {
  it("saves the profile under the session's user and echoes it back", async () => {
    const { PUT, save } = setup();

    const response = await PUT(put(SAVED));

    expect(response.status).toBe(200);
    expect(await read(response)).toMatchObject({ success: true, data: SAVED });
    expect(save).toHaveBeenCalledExactlyOnceWith(USER_ID, SAVED);
  });

  it("answers 401 to a visitor before it reads, or even parses, anything they sent", async () => {
    const { PUT, save, allowWrite } = setup({ userId: null });

    const response = await PUT(put("this is not even json"));

    expect(response.status).toBe(401);
    expect(save).not.toHaveBeenCalled();
    expect(allowWrite).not.toHaveBeenCalled();
  });

  it("refuses a foreign origin with 403 and a non-JSON request with 415, before anything else", async () => {
    const { PUT, save } = setup();

    const foreign = await PUT(put(SAVED, { origin: "https://evil.example" }));
    const form = await PUT(put("a=b", { "content-type": "application/x-www-form-urlencoded" }));

    expect(foreign.status).toBe(403);
    expect(form.status).toBe(415);
    expect(save).not.toHaveBeenCalled();
  });

  it("answers 429 with a Retry-After once the student has saved too often, without saving", async () => {
    const { PUT, save } = setup({ allowed: false });

    const response = await PUT(put(SAVED));

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect((await read(response)).error?.code).toBe("RATE_LIMITED");
    expect(save).not.toHaveBeenCalled();
  });

  it("rejects an invalid profile with 400 and a field error for each problem", async () => {
    const { PUT, save } = setup();

    const response = await PUT(put({ degreeLevel: "diploma", citizenship: "martian" }));

    expect(response.status).toBe(400);
    const body = await read(response);
    expect(body.error?.code).toBe("VALIDATION_ERROR");
    expect(body.error?.fields?.map((field) => field.field).sort()).toEqual(["citizenship", "degreeLevel"]);
    expect(save).not.toHaveBeenCalled();
  });

  it("ignores no one's say-so about who owns the profile: a user_id in the body is refused", async () => {
    const { PUT, save } = setup();

    const response = await PUT(put({ ...SAVED, user_id: "00000000-0000-4000-8000-0000000000bb" }));

    expect(response.status).toBe(400);
    expect((await read(response)).error?.fields?.map((field) => field.field)).toEqual(["user_id"]);
    expect(save).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid JSON", "{not json"],
    ["an array", "[]"],
    ["null", "null"],
  ])("rejects a body that is %s with 400", async (_name, raw) => {
    const { PUT, save } = setup();

    expect((await PUT(put(raw))).status).toBe(400);
    expect(save).not.toHaveBeenCalled();
  });

  it("rejects an oversized body", async () => {
    const { PUT, save } = setup();

    // A perfectly valid profile, padded with whitespace: only the size limit can refuse this, not
    // the validation, so it proves the limit itself works.
    const response = await PUT(put(`${JSON.stringify(SAVED)}${" ".repeat(20_000)}`));

    expect(response.status).toBe(400);
    expect(save).not.toHaveBeenCalled();
  });

  it("answers 500 without leaking, logs only a safe summary, and never echoes what was submitted", async () => {
    const failure = new Error('insert into profiles failed: citizenship "au_citizen" for user 00000000');
    const { PUT, log } = setup({ saveFails: failure });

    const response = await PUT(put(SAVED));
    const text = JSON.stringify(await read(response));

    expect(response.status).toBe(500);
    expect(text).not.toMatch(/insert|profiles|au_citizen|University of Melbourne/);
    expect(log).toHaveBeenCalledExactlyOnceWith("api.profile.save", failure);
  });

  it("is private and never cached, success or failure", async () => {
    const good = await setup().PUT(put(SAVED));
    const bad = await setup().PUT(put({ degreeLevel: "diploma" }));

    expect(good.headers.get("cache-control")).toBe("private, no-store");
    expect(bad.headers.get("cache-control")).toBe("private, no-store");
  });
});
