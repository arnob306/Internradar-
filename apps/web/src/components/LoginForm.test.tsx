// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoginForm } from "./LoginForm";

function answer(status: number, body: unknown = {}) {
  const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status })));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

async function submit(email: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email address"), email);
  await user.click(screen.getByRole("button", { name: "Email me a link" }));
}

describe("LoginForm", () => {
  it("asks for one thing, an email address, and says there is no password", () => {
    render(<LoginForm next="/profile" />);

    const input = screen.getByLabelText("Email address");
    expect(input.getAttribute("type")).toBe("email");
    expect(input.getAttribute("autocomplete")).toBe("email");
    expect(screen.getByText(/no password/i)).toBeTruthy();
  });

  it("posts the address and the destination as JSON to the magic-link endpoint", async () => {
    const fetchMock = answer(200, { success: true });
    render(<LoginForm next="/tracker" />);

    await submit("student@example.com");

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/v1/auth/magic-link");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["content-type"]).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({ email: "student@example.com", next: "/tracker" });
  });

  it("replaces the form with a confirmation naming the address, in the same words as the button", async () => {
    answer(200, { success: true });
    render(<LoginForm next="/profile" />);

    await submit("student@example.com");

    expect(await screen.findByRole("heading", { name: "Check your inbox" })).toBeTruthy();
    expect(screen.getByText("student@example.com")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Email me a link" })).toBeNull();
  });

  it("lets them go back and use a different address", async () => {
    answer(200, { success: true });
    render(<LoginForm next="/profile" />);
    await submit("typo@example.com");
    await screen.findByRole("heading", { name: "Check your inbox" });

    await userEvent.setup().click(screen.getByRole("button", { name: "Use a different email" }));

    expect(screen.getByLabelText("Email address")).toBeTruthy();
  });

  it("announces the confirmation to screen readers", async () => {
    answer(200, { success: true });
    render(<LoginForm next="/profile" />);

    await submit("student@example.com");

    expect((await screen.findByRole("status")).textContent).toContain("student@example.com");
  });

  it("says what is wrong with the address and what to do, linked to the field", async () => {
    answer(400, { success: false, error: { code: "VALIDATION_ERROR" } });
    render(<LoginForm next="/profile" />);

    await submit("not-an-email");

    const message = await screen.findByText("Enter a valid email address, like name@university.edu.au.");
    expect(message.getAttribute("role")).toBe("alert");
    const input = screen.getByLabelText("Email address");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toContain(message.id);
  });

  it("explains a rate limit with the wait, and keeps the address they typed", async () => {
    answer(429, { success: false, error: { code: "RATE_LIMITED" } });
    render(<LoginForm next="/profile" />);

    await submit("student@example.com");

    expect(await screen.findByText("Too many emails sent. Wait a minute, then try again.")).toBeTruthy();
    expect((screen.getByLabelText("Email address") as HTMLInputElement).value).toBe("student@example.com");
  });

  it.each([
    ["a server error", () => answer(500, { success: false })],
    ["no connection", () => vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("offline"))))],
  ])("explains %s without blaming them or showing details", async (_name, arrange) => {
    arrange();
    render(<LoginForm next="/profile" />);

    await submit("student@example.com");

    expect(await screen.findByText("We couldn't send the email. Try again in a moment.")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/500|TypeError|offline/);
  });

  it("disables the button while sending so a double click sends one email", async () => {
    let finish: (response: Response) => void = () => undefined;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => (finish = resolve)));
    vi.stubGlobal("fetch", fetchMock);
    render(<LoginForm next="/profile" />);

    await submit("student@example.com");
    const button = screen.getByRole("button", { name: "Sending" });

    expect((button as HTMLButtonElement).disabled).toBe(true);
    finish(new Response("{}", { status: 200 }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  });

  it("opens with the expired-link explanation when sent back from a bad link", () => {
    render(<LoginForm next="/profile" notice="invalid_link" />);

    expect(screen.getByText("That link has expired or was already used. Request a new one.")).toBeTruthy();
  });

  it("ignores an unknown notice code instead of showing it", () => {
    render(<LoginForm next="/profile" notice="<script>alert(1)</script>" />);

    expect(document.body.textContent).not.toContain("script");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
