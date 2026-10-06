// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const loadProfile = vi.fn();
const redirect = vi.fn((path: string) => {
  throw new Error(`redirected to ${path}`);
});
const logFailure = vi.fn();

vi.mock("next/navigation", () => ({ redirect: (path: string) => redirect(path) }));
vi.mock("../../server/log", () => ({ logFailure: (...args: unknown[]) => logFailure(...args) }));
vi.mock("../../server/auth/request-session", () => ({
  sessionClientForRequest: () => Promise.resolve({ auth: { getUser } }),
}));
vi.mock("../../server/profile/profile-repo", () => ({ loadProfile: (...args: unknown[]) => loadProfile(...args) }));
vi.mock("../../components/ProfileForm", () => ({
  ProfileForm: (props: { initial: { university: string | null }; currentYear: number }) => (
    <div data-testid="form" data-university={props.initial.university ?? ""} data-year={props.currentYear} />
  ),
}));

import ProfilePage from "./page";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-03T14:00:00Z"));
  getUser.mockReset().mockResolvedValue({ data: { user: { id: "u1" } } });
  loadProfile.mockReset().mockResolvedValue(null);
  redirect.mockClear();
  logFailure.mockReset();
});

describe("the profile page", () => {
  it("sends a visitor to sign-in, remembering the profile, if the proxy let them through", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    await expect(ProfilePage()).rejects.toThrow("redirected to /login?next=%2Fprofile");
    expect(loadProfile).not.toHaveBeenCalled();
  });

  it("shows an empty form to someone who has not saved a profile yet", async () => {
    render(await ProfilePage());

    expect(screen.getByRole("heading", { level: 1, name: "Your profile" })).toBeTruthy();
    expect(screen.getByTestId("form").dataset["university"]).toBe("");
  });

  it("shows what was saved, and gives the form the Melbourne year", async () => {
    loadProfile.mockResolvedValue({ university: "Monash University" });

    render(await ProfilePage());

    expect(screen.getByTestId("form").dataset["university"]).toBe("Monash University");
    // 14:00 UTC on 3 Oct is already 4 Oct in Melbourne, and still 2026.
    expect(screen.getByTestId("form").dataset["year"]).toBe("2026");
  });

  it("explains the purpose of the page in one sentence", async () => {
    render(await ProfilePage());

    expect(screen.getByText(/used to check which programs you can apply for/i)).toBeTruthy();
  });

  it("shows a calm message, and records the failure safely, if the profile cannot be loaded", async () => {
    const failure = new Error("connection refused");
    loadProfile.mockRejectedValue(failure);

    render(await ProfilePage());

    expect(screen.getByText(/couldn.t load your profile/i)).toBeTruthy();
    expect(screen.queryByTestId("form")).toBeNull();
    expect(logFailure).toHaveBeenCalledExactlyOnceWith("page.profile.load", failure);
  });
});
