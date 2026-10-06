// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SignOutButton } from "./SignOutButton";

afterEach(() => vi.unstubAllGlobals());

describe("SignOutButton", () => {
  it("posts JSON to the sign-out endpoint, then sends the student to the home page", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response("{}", { status: 200 })));
    vi.stubGlobal("fetch", fetchMock);
    const done = vi.fn();
    render(<SignOutButton onSignedOut={done} />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Sign out" }));

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/v1/auth/sign-out");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["content-type"]).toBe("application/json");
    expect(done).toHaveBeenCalledOnce();
  });

  it("stays put and says what to do if signing out fails, without details", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("{}", { status: 500 }))));
    const done = vi.fn();
    render(<SignOutButton onSignedOut={done} />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Sign out" }));

    expect((await screen.findByRole("alert")).textContent).toBe("We couldn't sign you out. Try again.");
    expect(done).not.toHaveBeenCalled();
  });

  it("treats a lost connection the same way", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("offline"))));
    render(<SignOutButton onSignedOut={vi.fn()} />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Sign out" }));

    expect((await screen.findByRole("alert")).textContent).not.toMatch(/offline|TypeError/);
  });

  it("is disabled while signing out so a double click signs out once", async () => {
    let finish: (response: Response) => void = () => undefined;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => (finish = resolve)));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<SignOutButton onSignedOut={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Sign out" }));
    await user.click(screen.getByRole("button", { name: "Signing out" }));

    expect(fetchMock).toHaveBeenCalledOnce();
    finish(new Response("{}", { status: 200 }));
  });
});
