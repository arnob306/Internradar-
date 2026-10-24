// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FollowProgramButton } from "./FollowProgramButton";

const PROGRAM = "22222222-2222-4222-8222-222222222222";

function answer(status: number, body: unknown = {}) {
  const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status })));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("FollowProgramButton", () => {
  it("offers to follow a program that is not followed yet", () => {
    render(<FollowProgramButton programId={PROGRAM} initiallyFollowing={false} />);

    expect((screen.getByRole("button", { name: "Follow this program" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("follows with a JSON PUT and no body, then says so and offers to stop", async () => {
    const fetchMock = answer(200, { success: true, data: { programId: PROGRAM, following: true } });
    render(<FollowProgramButton programId={PROGRAM} initiallyFollowing={false} />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Follow this program" }));

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`/api/v1/me/follows/${PROGRAM}`);
    expect(init.method).toBe("PUT");
    expect(init.headers).toEqual({ "content-type": "application/json" });
    expect(init.body).toBeUndefined();
    expect(await screen.findByText("You follow this program")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Stop following" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Follow this program" })).toBeNull();
  });

  it("announces the follow and puts focus on that message, since the button it replaces is gone", async () => {
    answer(200, { success: true, data: { programId: PROGRAM, following: true } });
    render(<FollowProgramButton programId={PROGRAM} initiallyFollowing={false} />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Follow this program" }));

    const status = await screen.findByRole("status");
    expect(status.textContent).toContain("You follow this program");
    expect(document.activeElement).toBe(status);
  });

  it("shows a program that is already followed that way, without moving focus", () => {
    render(<FollowProgramButton programId={PROGRAM} initiallyFollowing />);

    expect(screen.getByText("You follow this program")).toBeTruthy();
    expect(document.activeElement).toBe(document.body);
  });

  it("stops following with a JSON DELETE and goes back to offering to follow", async () => {
    const fetchMock = answer(200, { success: true, data: { programId: PROGRAM, following: false } });
    render(<FollowProgramButton programId={PROGRAM} initiallyFollowing />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Stop following" }));

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`/api/v1/me/follows/${PROGRAM}`);
    expect(init.method).toBe("DELETE");
    expect(init.headers).toEqual({ "content-type": "application/json" });
    expect(await screen.findByRole("button", { name: "Follow this program" })).toBeTruthy();
    expect(screen.queryByText("You follow this program")).toBeNull();
  });

  it("asks a signed-out student to sign in, and keeps the button", async () => {
    answer(401, { success: false, error: { code: "UNAUTHENTICATED" } });
    render(<FollowProgramButton programId={PROGRAM} initiallyFollowing={false} />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Follow this program" }));

    expect((await screen.findByRole("alert")).textContent).toMatch(/sign in/i);
    expect((screen.getByRole("button", { name: "Follow this program" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("tells a student who is going too fast to wait", async () => {
    answer(429, { success: false, error: { code: "RATE_LIMITED" } });
    render(<FollowProgramButton programId={PROGRAM} initiallyFollowing={false} />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Follow this program" }));

    expect((await screen.findByRole("alert")).textContent).toMatch(/too quickly/i);
  });

  it("says plainly that it failed when the server errors, without showing detail", async () => {
    answer(500, { success: false, error: { code: "INTERNAL_ERROR", message: "secret detail" } });
    render(<FollowProgramButton programId={PROGRAM} initiallyFollowing={false} />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Follow this program" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/couldn't update/i);
    expect(alert.textContent).not.toMatch(/secret/);
  });

  it("keeps the follow in place and says so when stopping fails", async () => {
    answer(500, { success: false, error: { code: "INTERNAL_ERROR" } });
    render(<FollowProgramButton programId={PROGRAM} initiallyFollowing />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Stop following" }));

    expect((await screen.findByRole("alert")).textContent).toMatch(/couldn't update/i);
    expect(screen.getByText("You follow this program")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Stop following" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("says the same when the network fails, and lets the student try again", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
    render(<FollowProgramButton programId={PROGRAM} initiallyFollowing={false} />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Follow this program" }));

    expect((await screen.findByRole("alert")).textContent).toMatch(/couldn't update/i);
    expect((screen.getByRole("button", { name: "Follow this program" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("does not send twice while a change is in flight", async () => {
    let release: (response: Response) => void = () => undefined;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => (release = resolve)));
    vi.stubGlobal("fetch", fetchMock);
    render(<FollowProgramButton programId={PROGRAM} initiallyFollowing={false} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Follow this program" }));
    await user.click(screen.getByRole("button", { name: "Saving" }));
    release(new Response("{}", { status: 200 }));

    expect(await screen.findByText("You follow this program")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
