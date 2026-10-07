// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SaveProgramButton } from "./SaveProgramButton";

function answer(status: number, body: unknown = {}) {
  const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status })));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("SaveProgramButton", () => {
  it("offers to save a program that is not in the tracker yet", () => {
    render(<SaveProgramButton programId="p1" initiallySaved={false} />);

    expect((screen.getByRole("button", { name: "Save to my tracker" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("sends only the program id, as JSON, and then says it is saved with a link to the tracker", async () => {
    const fetchMock = answer(201, { success: true, data: { id: "a1" } });
    render(<SaveProgramButton programId="p1" initiallySaved={false} />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Save to my tracker" }));

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/v1/me/applications");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "content-type": "application/json" });
    expect(JSON.parse(init.body as string)).toEqual({ programId: "p1" });
    expect(await screen.findByText("Saved")).toBeTruthy();
    expect(screen.getByRole("link", { name: "View in my tracker" }).getAttribute("href")).toBe("/tracker");
    expect(screen.queryByRole("button", { name: "Save to my tracker" })).toBeNull();
  });

  it("shows an already saved program as saved, with no button to press again", () => {
    render(<SaveProgramButton programId="p1" initiallySaved />);

    expect(screen.getByText("Saved")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("treats a program that was already in the tracker (200) the same as a new save (201)", async () => {
    answer(200, { success: true, data: { id: "a1" } });
    render(<SaveProgramButton programId="p1" initiallySaved={false} />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Save to my tracker" }));

    expect(await screen.findByText("Saved")).toBeTruthy();
  });

  it("asks a signed-out student to sign in, and keeps the button", async () => {
    answer(401, { success: false, error: { code: "UNAUTHENTICATED" } });
    render(<SaveProgramButton programId="p1" initiallySaved={false} />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Save to my tracker" }));

    expect((await screen.findByRole("alert")).textContent).toMatch(/sign in/i);
    expect((screen.getByRole("button", { name: "Save to my tracker" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("tells a student who is going too fast to wait", async () => {
    answer(429, { success: false, error: { code: "RATE_LIMITED" } });
    render(<SaveProgramButton programId="p1" initiallySaved={false} />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Save to my tracker" }));

    expect((await screen.findByRole("alert")).textContent).toMatch(/too quickly/i);
  });

  it("says plainly that it failed when the server errors, without showing detail", async () => {
    answer(500, { success: false, error: { code: "INTERNAL_ERROR", message: "secret detail" } });
    render(<SaveProgramButton programId="p1" initiallySaved={false} />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Save to my tracker" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/couldn't save/i);
    expect(alert.textContent).not.toMatch(/secret/);
  });

  it("says the same when the network fails, and lets the student try again", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
    render(<SaveProgramButton programId="p1" initiallySaved={false} />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Save to my tracker" }));

    expect((await screen.findByRole("alert")).textContent).toMatch(/couldn't save/i);
    expect((screen.getByRole("button", { name: "Save to my tracker" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("does not send twice while a save is in flight", async () => {
    let release: (response: Response) => void = () => undefined;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => (release = resolve)));
    vi.stubGlobal("fetch", fetchMock);
    render(<SaveProgramButton programId="p1" initiallySaved={false} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Save to my tracker" }));
    await user.click(screen.getByRole("button", { name: "Saving" }));
    release(new Response("{}", { status: 201 }));

    expect(await screen.findByText("Saved")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
