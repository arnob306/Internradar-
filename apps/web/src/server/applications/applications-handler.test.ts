import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createApplicationHandlers,
  type ApplicationRecord,
  type ApplicationsHandlerDeps,
} from "./applications-handler";

const USER = "11111111-1111-4111-8111-111111111111";
const PROGRAM = "22222222-2222-4222-8222-222222222222";
const APP = "33333333-3333-4333-8333-333333333333";
const NOW = new Date("2026-10-08T01:00:00Z");

function record(overrides: Partial<ApplicationRecord> = {}): ApplicationRecord {
  return {
    id: APP,
    programId: PROGRAM,
    programSlug: "graduate-program",
    programName: "EY Graduate Program",
    companySlug: "ey-australia",
    companyName: "EY Australia",
    cycleYear: 2027,
    status: "saved",
    appliedAt: null,
    notes: null,
    resumeId: null,
    updatedAt: "2026-10-08T00:00:00Z",
    ...overrides,
  };
}

let deps: {
  [K in keyof ApplicationsHandlerDeps]: ReturnType<typeof vi.fn>;
};
let handlers: ReturnType<typeof createApplicationHandlers>;

function request(method: string, body?: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://internradar.test/api/v1/me/applications", {
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
    list: vi.fn().mockResolvedValue([record()]),
    save: vi.fn().mockResolvedValue({ record: record(), created: true }),
    find: vi.fn().mockResolvedValue(record()),
    latestChange: vi.fn().mockResolvedValue({ fromStatus: "applied", toStatus: "interview", isUndo: false }),
    update: vi.fn().mockImplementation(async (_id, change) => record({ ...change })),
    remove: vi.fn().mockResolvedValue(true),
    now: vi.fn().mockReturnValue(NOW),
    log: vi.fn(),
  };
  handlers = createApplicationHandlers(deps as unknown as ApplicationsHandlerDeps);
});

describe("every response", () => {
  it("is private and never cached, because it is one student's own record", async () => {
    const response = await handlers.list(request("GET"));
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});

describe("GET the list", () => {
  it("is for signed-in students only", async () => {
    deps.getUserId.mockResolvedValue(null);
    const response = await handlers.list(request("GET"));
    expect(response.status).toBe(401);
    expect((await read(response)).error?.code).toBe("UNAUTHENTICATED");
    expect(deps.list).not.toHaveBeenCalled();
  });

  it("returns the student's applications", async () => {
    const body = await read(await handlers.list(request("GET")));
    expect(body.success).toBe(true);
    expect(body.data).toEqual([record()]);
  });

  it("answers a failure generically and logs only a safe summary", async () => {
    const failure = new Error('relation "applications" does not exist');
    deps.list.mockRejectedValue(failure);
    const response = await handlers.list(request("GET"));
    expect(response.status).toBe(500);
    expect(JSON.stringify(await read(response))).not.toContain("relation");
    expect(deps.log).toHaveBeenCalledExactlyOnceWith("api.applications.list", failure);
  });
});

describe("POST save a program", () => {
  const save = (body: unknown = { programId: PROGRAM }, headers?: Record<string, string>) =>
    handlers.create(request("POST", body, headers));

  it("refuses another site's origin before doing anything else", async () => {
    const response = await save(undefined, { origin: "https://evil.test" });
    expect(response.status).toBe(403);
    expect(deps.getUserId).not.toHaveBeenCalled();
  });

  it("refuses anything but JSON", async () => {
    const response = await handlers.create(request("POST", "x", { "content-type": "text/plain" }));
    expect(response.status).toBe(415);
  });

  it("is for signed-in students only", async () => {
    deps.getUserId.mockResolvedValue(null);
    expect((await save()).status).toBe(401);
    expect(deps.save).not.toHaveBeenCalled();
  });

  it("slows down a student who saves too fast, before reading the body", async () => {
    deps.allowWrite.mockResolvedValue(false);
    const response = await save();
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(deps.save).not.toHaveBeenCalled();
  });

  it.each([
    ["not JSON", "{oops"],
    ["not an object", "[]"],
    ["no program", {}],
    ["a status from the client", { programId: PROGRAM, status: "offer" }],
    ["someone else's id", { programId: PROGRAM, userId: "x" }],
  ])("refuses a body that is %s", async (_name, body) => {
    const response = await save(body);
    expect(response.status).toBe(400);
    expect((await read(response)).error?.code).toBe("VALIDATION_ERROR");
    expect(deps.save).not.toHaveBeenCalled();
  });

  it("refuses an enormous body", async () => {
    expect((await save("x".repeat(9000))).status).toBe(400);
    expect(deps.save).not.toHaveBeenCalled();
  });

  it("creates it for the session's student, and says where it is", async () => {
    const response = await save();
    expect(response.status).toBe(201);
    expect(response.headers.get("location")).toBe(`/api/v1/me/applications/${APP}`);
    expect(deps.save).toHaveBeenCalledExactlyOnceWith(USER, PROGRAM);
    expect((await read(response)).data).toEqual(record());
  });

  it("returns the one they already had, without pretending it is new", async () => {
    deps.save.mockResolvedValue({ record: record(), created: false });
    const response = await save();
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("says the program does not exist when it is missing or not published", async () => {
    deps.save.mockResolvedValue(null);
    const response = await save();
    expect(response.status).toBe(404);
    expect((await read(response)).error?.code).toBe("PROGRAM_NOT_FOUND");
  });

  it("answers a failure generically and logs a safe summary", async () => {
    const failure = new Error("connection refused");
    deps.save.mockRejectedValue(failure);
    const response = await save();
    expect(response.status).toBe(500);
    expect(deps.log).toHaveBeenCalledExactlyOnceWith("api.applications.save", failure);
  });
});

describe("GET one application", () => {
  const get = (id: string) => handlers.get(request("GET"), id);

  it("is for signed-in students only", async () => {
    deps.getUserId.mockResolvedValue(null);
    expect((await get(APP)).status).toBe(401);
  });

  it.each(["abc", "../x", `${APP}x`])("is not found for the invalid id %j, without asking the database", async (id) => {
    expect((await get(id)).status).toBe(404);
    expect(deps.find).not.toHaveBeenCalled();
  });

  it("is not found when it is not theirs or does not exist", async () => {
    deps.find.mockResolvedValue(null);
    const response = await get(APP);
    expect(response.status).toBe(404);
    expect((await read(response)).error?.code).toBe("NOT_FOUND");
  });

  it("returns it", async () => {
    expect((await read(await get(APP))).data).toEqual(record());
  });
});

describe("PATCH an application", () => {
  const patch = (body: unknown, id = APP) => handlers.patch(request("PATCH", body), id);

  it("refuses another site's origin first", async () => {
    const response = await handlers.patch(request("PATCH", { notes: "x" }, { origin: "https://evil.test" }), APP);
    expect(response.status).toBe(403);
  });

  it("is for signed-in students only", async () => {
    deps.getUserId.mockResolvedValue(null);
    expect((await patch({ notes: "x" })).status).toBe(401);
  });

  it("slows down a student who changes things too fast", async () => {
    deps.allowWrite.mockResolvedValue(false);
    expect((await patch({ notes: "x" })).status).toBe(429);
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("refuses an invalid id without asking the database", async () => {
    expect((await patch({ notes: "x" }, "nope")).status).toBe(404);
    expect(deps.find).not.toHaveBeenCalled();
  });

  it("refuses a malformed change", async () => {
    const response = await patch({ status: "withdrawn" });
    expect(response.status).toBe(400);
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("is not found when it is not theirs", async () => {
    deps.find.mockResolvedValue(null);
    expect((await patch({ notes: "x" })).status).toBe(404);
  });

  it("records the day a student applies, from the server's clock", async () => {
    const response = await patch({ status: "applied" });
    expect(response.status).toBe(200);
    expect(deps.update).toHaveBeenCalledExactlyOnceWith(
      APP,
      { status: "applied", appliedAt: NOW.toISOString() },
      "saved",
    );
  });

  it("does not touch the applied date on a later move", async () => {
    deps.find.mockResolvedValue(record({ status: "applied", appliedAt: "2026-09-01T00:00:00Z" }));
    await patch({ status: "interview" });
    expect(deps.update).toHaveBeenCalledExactlyOnceWith(APP, { status: "interview" }, "applied");
  });

  it("lets a student reject a program they only saved, with no applied date", async () => {
    await patch({ status: "rejected" });
    expect(deps.update).toHaveBeenCalledExactlyOnceWith(APP, { status: "rejected" }, "saved");
  });

  it.each([
    ["backwards", "applied", "saved"],
    ["skipping ahead", "saved", "interview"],
    ["out of an offer", "offer", "rejected"],
    ["to the same status", "applied", "applied"],
  ])("refuses a move %s", async (_name, from, to) => {
    deps.find.mockResolvedValue(record({ status: from as ApplicationRecord["status"], appliedAt: "2026-09-01T00:00:00Z" }));
    const response = await patch({ status: to });
    expect(response.status).toBe(409);
    expect((await read(response)).error?.code).toBe("INVALID_TRANSITION");
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("changes notes alone without a status move, guarding against a concurrent change", async () => {
    await patch({ notes: "Phone screen Friday" });
    expect(deps.update).toHaveBeenCalledExactlyOnceWith(APP, { notes: "Phone screen Friday" }, "saved");
  });

  it("says so when the application changed under them", async () => {
    deps.update.mockResolvedValue(null);
    const response = await patch({ status: "applied" });
    expect(response.status).toBe(409);
    expect((await read(response)).error?.code).toBe("CONFLICT");
  });

  it("answers a failure generically and logs a safe summary", async () => {
    const failure = new Error("boom");
    deps.update.mockRejectedValue(failure);
    const response = await patch({ notes: "x" });
    expect(response.status).toBe(500);
    expect(deps.log).toHaveBeenCalledExactlyOnceWith("api.applications.update", failure);
  });
});

describe("POST undo", () => {
  const undo = (id = APP) => handlers.undo(request("POST", {}), id);

  beforeEach(() => {
    deps.find.mockResolvedValue(record({ status: "interview", appliedAt: "2026-09-01T00:00:00Z" }));
  });

  it("refuses another site's origin first", async () => {
    expect((await handlers.undo(request("POST", {}, { origin: "https://evil.test" }), APP)).status).toBe(403);
  });

  it("is for signed-in students only", async () => {
    deps.getUserId.mockResolvedValue(null);
    expect((await undo()).status).toBe(401);
  });

  it("is not found when it is not theirs", async () => {
    deps.find.mockResolvedValue(null);
    expect((await undo()).status).toBe(404);
  });

  it("moves back to where it was, guarding against a concurrent change", async () => {
    const response = await undo();
    expect(response.status).toBe(200);
    expect(deps.update).toHaveBeenCalledExactlyOnceWith(APP, { status: "applied" }, "interview");
  });

  it.each([
    ["there is no earlier move", { fromStatus: null, toStatus: "saved", isUndo: false }],
    ["the last move was itself an undo", { fromStatus: "interview", toStatus: "applied", isUndo: true }],
    ["there is no history", null],
  ])("says there is nothing to undo when %s", async (_name, change) => {
    deps.latestChange.mockResolvedValue(change);
    const response = await undo();
    expect(response.status).toBe(409);
    expect((await read(response)).error?.code).toBe("NOTHING_TO_UNDO");
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("says so when the application changed under them", async () => {
    deps.update.mockResolvedValue(null);
    expect((await undo()).status).toBe(409);
  });
});

describe("DELETE an application", () => {
  const remove = (id = APP) => handlers.remove(request("DELETE"), id);

  it("refuses another site's origin first", async () => {
    expect((await handlers.remove(request("DELETE", undefined, { origin: "https://evil.test" }), APP)).status).toBe(403);
  });

  it("is for signed-in students only", async () => {
    deps.getUserId.mockResolvedValue(null);
    expect((await remove()).status).toBe(401);
  });

  it("removes it and sends nothing back", async () => {
    const response = await remove();
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(deps.remove).toHaveBeenCalledExactlyOnceWith(APP);
  });

  it("is not found when it is not theirs", async () => {
    deps.remove.mockResolvedValue(false);
    expect((await remove()).status).toBe(404);
  });

  it("refuses an invalid id without asking the database", async () => {
    expect((await remove("../x")).status).toBe(404);
    expect(deps.remove).not.toHaveBeenCalled();
  });
});
