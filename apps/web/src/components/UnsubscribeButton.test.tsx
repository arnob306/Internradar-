// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UnsubscribeButton } from "./UnsubscribeButton";

const ALERT = "11111111-1111-4111-8111-111111111111";

function answer(status: number, body: unknown = {}) {
  const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status })));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("UnsubscribeButton", () => {
  it("asks first, and sends nothing until it is pressed", () => {
    const fetchMock = answer(200);
    render(<UnsubscribeButton alertId={ALERT} />);

    expect(screen.getByRole("button", { name: "Stop alert emails" })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the one-click form to the alert's own link, then says it is done", async () => {
    const fetchMock = answer(200, { success: true, data: { unsubscribed: true } });
    render(<UnsubscribeButton alertId={ALERT} />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Stop alert emails" }));

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`/api/v1/alerts/unsubscribe?alert=${ALERT}`);
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "content-type": "application/x-www-form-urlencoded" });
    expect(init.body).toBe("List-Unsubscribe=One-Click");
    const status = await screen.findByRole("status");
    expect(status.textContent).toMatch(/no longer get alert emails/i);
    expect(document.activeElement).toBe(status);
    expect(screen.queryByRole("button", { name: "Stop alert emails" })).toBeNull();
  });

  it("tells a caller who is going too fast to wait, and keeps the button", async () => {
    answer(429, { success: false, error: { code: "RATE_LIMITED" } });
    render(<UnsubscribeButton alertId={ALERT} />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Stop alert emails" }));

    expect((await screen.findByRole("alert")).textContent).toMatch(/too quickly/i);
    expect((screen.getByRole("button", { name: "Stop alert emails" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("says plainly that it failed, without detail, and lets them try again", async () => {
    answer(500, { success: false, error: { code: "INTERNAL_ERROR", message: "secret detail" } });
    render(<UnsubscribeButton alertId={ALERT} />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Stop alert emails" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/couldn't stop/i);
    expect(alert.textContent).not.toMatch(/secret/);
    expect((screen.getByRole("button", { name: "Stop alert emails" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("says the same when the network fails", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
    render(<UnsubscribeButton alertId={ALERT} />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Stop alert emails" }));

    expect((await screen.findByRole("alert")).textContent).toMatch(/couldn't stop/i);
  });

  it("does not send twice while the first is in flight", async () => {
    let release: (response: Response) => void = () => undefined;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => (release = resolve)));
    vi.stubGlobal("fetch", fetchMock);
    render(<UnsubscribeButton alertId={ALERT} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Stop alert emails" }));
    await user.click(screen.getByRole("button", { name: "Stopping" }));
    release(new Response("{}", { status: 200 }));

    expect(await screen.findByRole("status")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
