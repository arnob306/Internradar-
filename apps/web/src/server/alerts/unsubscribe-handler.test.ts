import { beforeEach, describe, expect, it, vi } from "vitest";
import { createUnsubscribeHandler, type UnsubscribeHandlerDeps } from "./unsubscribe-handler";

const ALERT = "11111111-1111-4111-8111-111111111111";
const OTHER = "99999999-9999-4999-8999-999999999999";
const ONE_CLICK = "List-Unsubscribe=One-Click";

let deps: {
  [K in keyof UnsubscribeHandlerDeps]: ReturnType<typeof vi.fn>;
};
let handle: ReturnType<typeof createUnsubscribeHandler>;

function post(
  options: { query?: string; body?: string; type?: string; method?: string; headers?: Record<string, string> } = {},
): Request {
  const { query = `?alert=${ALERT}`, body = ONE_CLICK, type = "application/x-www-form-urlencoded", method = "POST" } = options;
  return new Request(`https://internradar.test/api/v1/alerts/unsubscribe${query}`, {
    method,
    headers: { "content-type": type, ...options.headers },
    body,
  });
}

async function read(response: Response) {
  return (await response.json()) as { success: boolean; data: unknown; error: { code: string } | null };
}

beforeEach(() => {
  deps = {
    limit: vi.fn().mockReturnValue({ allowed: true, retryAfterSeconds: 1 }),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
    log: vi.fn(),
  };
  handle = createUnsubscribeHandler(deps as unknown as UnsubscribeHandlerDeps);
});

describe("the one-click unsubscribe", () => {
  it("stops alert emails for the alert named in the link", async () => {
    const response = await handle(post());

    expect(response.status).toBe(200);
    expect((await read(response)).data).toEqual({ unsubscribed: true });
    expect(deps.unsubscribe).toHaveBeenCalledExactlyOnceWith(ALERT);
  });

  it("works the way a mail provider sends it: no origin, no cookies, a form body", async () => {
    const response = await handle(post({ headers: { "user-agent": "Mail-Provider/1.0" } }));
    expect(response.status).toBe(200);
  });

  it("is never cached", async () => {
    expect((await handle(post())).headers.get("cache-control")).toBe("no-store");
  });

  it("takes the alert only from the link, never from the body", async () => {
    await handle(post({ body: `${ONE_CLICK}&alert=${OTHER}` }));
    expect(deps.unsubscribe).toHaveBeenCalledExactlyOnceWith(ALERT);
  });

  it("answers the same whichever alert id it is given, so a made-up id tells nobody anything", async () => {
    const real = await (await handle(post())).text();
    const made = await (await handle(post({ query: `?alert=${OTHER}` }))).text();
    expect(made).toBe(real);
  });

  it.each([
    ["no alert", ""],
    ["an empty alert", "?alert="],
    ["a word", "?alert=hello"],
    ["a uuid with a tail", `?alert=${ALERT}x`],
    ["a uuid and an injection", `?alert=${ALERT}%27%3B+drop+table`],
  ])("refuses %s without touching anything", async (_name, query) => {
    const response = await handle(post({ query }));

    expect(response.status).toBe(400);
    expect((await read(response)).error?.code).toBe("VALIDATION_ERROR");
    expect(deps.unsubscribe).not.toHaveBeenCalled();
  });

  it("refuses a body that is not the one-click form", async () => {
    const response = await handle(post({ body: "hello=world" }));
    expect(response.status).toBe(400);
    expect(deps.unsubscribe).not.toHaveBeenCalled();
  });

  it("refuses anything but a form", async () => {
    const response = await handle(post({ type: "application/json", body: JSON.stringify({ "List-Unsubscribe": "One-Click" }) }));
    expect(response.status).toBe(415);
    expect(deps.unsubscribe).not.toHaveBeenCalled();
  });

  it("refuses a body that is far bigger than the form", async () => {
    const response = await handle(post({ body: `${ONE_CLICK}&x=${"a".repeat(5000)}` }));
    expect(response.status).toBe(400);
    expect(deps.unsubscribe).not.toHaveBeenCalled();
  });

  it("slows down a caller who asks too often, before doing anything else", async () => {
    deps.limit.mockReturnValue({ allowed: false, retryAfterSeconds: 42 });

    const response = await handle(post());

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("42");
    expect((await read(response)).error?.code).toBe("RATE_LIMITED");
    expect(deps.unsubscribe).not.toHaveBeenCalled();
  });

  it("answers a failure generically and logs only a safe summary", async () => {
    const failure = new Error('function "unsubscribe_from_alert" does not exist');
    deps.unsubscribe.mockRejectedValue(failure);

    const response = await handle(post());

    expect(response.status).toBe(500);
    const text = JSON.stringify(await read(response));
    expect(text).not.toContain("unsubscribe_from_alert");
    expect(deps.log).toHaveBeenCalledExactlyOnceWith("api.alerts.unsubscribe", failure);
  });
});
