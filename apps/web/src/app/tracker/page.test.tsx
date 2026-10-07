// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const listApplications = vi.fn();
const redirect = vi.fn((path: string) => {
  throw new Error(`redirected to ${path}`);
});
const logFailure = vi.fn();

vi.mock("next/navigation", () => ({ redirect: (path: string) => redirect(path) }));
vi.mock("../../server/log", () => ({ logFailure: (...args: unknown[]) => logFailure(...args) }));
vi.mock("../../server/auth/request-session", () => ({
  sessionClientForRequest: () => Promise.resolve({ auth: { getUser }, marker: "session-client" }),
}));
vi.mock("../../server/applications/applications-repo", () => ({
  listApplications: (...args: unknown[]) => listApplications(...args),
}));
vi.mock("../../components/TrackerBoard", () => ({
  TrackerBoard: (props: { initial: { id: string }[] }) => (
    <div data-testid="board" data-ids={props.initial.map((item) => item.id).join(",")} />
  ),
}));

import TrackerPage from "./page";

beforeEach(() => {
  getUser.mockReset().mockResolvedValue({ data: { user: { id: "u1" } } });
  listApplications.mockReset().mockResolvedValue([{ id: "a1" }, { id: "a2" }]);
  redirect.mockClear();
  logFailure.mockReset();
});

describe("the tracker page", () => {
  it("sends a visitor to sign-in, remembering the tracker, if the proxy let them through", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    await expect(TrackerPage()).rejects.toThrow("redirected to /login?next=%2Ftracker");
    expect(listApplications).not.toHaveBeenCalled();
  });

  it("gives the board the student's own applications, read with their session", async () => {
    render(await TrackerPage());

    expect(screen.getByRole("heading", { level: 1, name: "Your tracker" })).toBeTruthy();
    expect(listApplications).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ marker: "session-client" }));
    expect(screen.getByTestId("board").dataset["ids"]).toBe("a1,a2");
  });

  it("says so, and logs only a safe summary, when the applications cannot be read", async () => {
    listApplications.mockRejectedValue(new Error("db password=hunter2"));

    render(await TrackerPage());

    expect(screen.getByText(/couldn't load your tracker/i)).toBeTruthy();
    expect(screen.queryByTestId("board")).toBeNull();
    expect(logFailure).toHaveBeenCalledWith("page.tracker.load", expect.any(Error));
    expect(document.body.textContent).not.toMatch(/hunter2/);
  });
});
