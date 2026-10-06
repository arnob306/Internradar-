// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import LoginPage from "./page";

vi.mock("../../components/LoginForm", () => ({
  LoginForm: (props: { next: string; notice?: string }) => (
    <div data-testid="form" data-next={props.next} data-notice={props.notice ?? ""} />
  ),
}));

async function show(params: Record<string, string | string[] | undefined> = {}) {
  render(await LoginPage({ searchParams: Promise.resolve(params) }));
  return screen.getByTestId("form");
}

describe("the sign-in page", () => {
  it("has a heading and goes to the profile by default", async () => {
    const form = await show();

    expect(screen.getByRole("heading", { level: 1, name: "Sign in" })).toBeTruthy();
    expect(form.dataset["next"]).toBe("/profile");
  });

  it("carries a safe destination through to the form", async () => {
    expect((await show({ next: "/tracker" })).dataset["next"]).toBe("/tracker");
  });

  it.each(["//evil.example", "https://evil.example", "/\\evil.example", ["/profile", "/tracker"]])(
    "replaces the unsafe destination %j with the profile",
    async (next) => {
      expect((await show({ next })).dataset["next"]).toBe("/profile");
    },
  );

  it("passes the reason for being sent back on, as a code for the form to interpret", async () => {
    expect((await show({ error: "invalid_link" })).dataset["notice"]).toBe("invalid_link");
  });
});
