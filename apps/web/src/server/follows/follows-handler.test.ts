import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFollowHandlers, type FollowsHandlerDeps } from "./follows-handler";

const USER = "11111111-1111-4111-8111-111111111111";
const PROGRAM = "22222222-2222-4222-8222-222222222222";

let deps: {
  [K in keyof FollowsHandlerDeps]: ReturnType<typeof vi.fn>;
};
let handlers: ReturnType<typeof createFollowHandlers>;

function request(method: string, body?: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`https://internradar.test/api/v1/me/follows/${PROGRAM}`, {
    method,
    headers: { "content-type": "application/json", ...headers },
    ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  });
}

async function read(response: Response) {
  return (await response.json()) as { success: boolean; data: unknown; error: { code: string } | null };
}

beforeEach(() => {
  deps = {
    getUserId: vi.fn().mockResolvedValue(USER),
    allowWrite: vi.fn().mockResolvedValue(true),
    follow: vi.fn().mockResolvedValue(true),
    unfollow: vi.fn().mockResolvedValue(undefined),
    log: vi.fn(),
  };
  handlers = createFollowHandlers(deps as unknown as FollowsHandlerDeps);
});

describe.each([
  ["PUT follow", "follow", "follow"],
  ["DELETE unfollow", "unfollow", "unfollow"],
] as const)("%s", (_name, handlerName, depName) => {
  const call = (req: Request = request("PUT"), id: string = PROGRAM) => handlers[handlerName](req, id);

  it("is private and never cached, because it is one student's own choice", async () => {
    expect((await call()).headers.get("cache-control")).toBe("private, no-store");
  });

  it("refuses another site's origin before doing anything else", async () => {
    const response = await call(request("PUT", undefined, { origin: "https://evil.test" }));
    expect(response.status).toBe(403);
    expect(deps.getUserId).not.toHaveBeenCalled();
  });

  it("refuses anything but JSON", async () => {
    const response = await call(request("PUT", "x", { "content-type": "text/plain" }));
    expect(response.status).toBe(415);
  });

  it("is for signed-in students only, and does not count a visitor against any limit", async () => {
    deps.getUserId.mockResolvedValue(null);
    const response = await call();
    expect(response.status).toBe(401);
    expect((await read(response)).error?.code).toBe("UNAUTHENTICATED");
    expect(deps.allowWrite).not.toHaveBeenCalled();
    expect(deps[depName]).not.toHaveBeenCalled();
  });

  it("slows down a student who changes follows too fast", async () => {
    deps.allowWrite.mockResolvedValue(false);
    const response = await call();
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect((await read(response)).error?.code).toBe("RATE_LIMITED");
    expect(deps[depName]).not.toHaveBeenCalled();
  });

  it.each(["not-a-uuid", "", "22222222-2222-4222-8222-22222222222", `${PROGRAM}; drop table`])(
    "answers 'not found' for a program id that cannot exist (%j)",
    async (id) => {
      const response = await call(request("PUT"), id);
      expect(response.status).toBe(404);
      expect((await read(response)).error?.code).toBe("PROGRAM_NOT_FOUND");
      expect(deps[depName]).not.toHaveBeenCalled();
    },
  );

  it("uses the signed-in student, never one named in the request", async () => {
    await call(request("PUT", { user_id: "99999999-9999-4999-8999-999999999999", userId: "x" }));
    expect(deps[depName]).toHaveBeenCalledExactlyOnceWith(USER, PROGRAM);
  });

  it("answers a failure generically and logs only a safe summary", async () => {
    const failure = new Error('relation "program_follows" does not exist');
    deps[depName]!.mockRejectedValue(failure);
    const response = await call();
    expect(response.status).toBe(500);
    const text = JSON.stringify(await read(response));
    expect(text).not.toContain("relation");
    expect(text).not.toContain("program_follows");
    expect(deps.log).toHaveBeenCalledExactlyOnceWith(`api.follows.${depName}`, failure);
  });
});

describe("PUT follow", () => {
  it("follows the program and says so", async () => {
    const response = await handlers.follow(request("PUT"), PROGRAM);
    expect(response.status).toBe(200);
    const body = await read(response);
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ programId: PROGRAM, following: true });
    expect(deps.follow).toHaveBeenCalledExactlyOnceWith(USER, PROGRAM);
  });

  it("answers 404 for a program that does not exist or is not published", async () => {
    deps.follow.mockResolvedValue(false);
    const response = await handlers.follow(request("PUT"), PROGRAM);
    expect(response.status).toBe(404);
    expect((await read(response)).error?.code).toBe("PROGRAM_NOT_FOUND");
  });
});

describe("DELETE unfollow", () => {
  it("stops following and says so", async () => {
    const response = await handlers.unfollow(request("DELETE"), PROGRAM);
    expect(response.status).toBe(200);
    const body = await read(response);
    expect(body.data).toEqual({ programId: PROGRAM, following: false });
    expect(deps.unfollow).toHaveBeenCalledExactlyOnceWith(USER, PROGRAM);
  });
});
