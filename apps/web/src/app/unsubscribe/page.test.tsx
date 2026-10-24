// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../components/UnsubscribeButton", () => ({
  UnsubscribeButton: (props: { alertId: string }) => <button data-alert={props.alertId}>Stop alert emails</button>,
}));

import UnsubscribePage, { metadata } from "./page";

const ALERT = "11111111-1111-4111-8111-111111111111";
const search = (alert?: string | string[]) => ({ searchParams: Promise.resolve(alert === undefined ? {} : { alert }) });

describe("the unsubscribe page", () => {
  it("asks first, in plain words, and only offers the button for the alert in the link", async () => {
    render(await UnsubscribePage(search(ALERT)));

    expect(screen.getByRole("heading", { level: 1, name: "Stop alert emails?" })).toBeTruthy();
    expect(screen.getByText(/no longer get emails when programs you follow open or change/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Stop alert emails" }).getAttribute("data-alert")).toBe(ALERT);
  });

  it.each([
    ["no alert", undefined],
    ["a word", "hello"],
    ["a uuid with a tail", `${ALERT}x`],
    ["several alerts", [ALERT, ALERT]],
  ])("says the link does not look right for %s, and offers nothing to press", async (_name, alert) => {
    render(await UnsubscribePage(search(alert)));

    expect(screen.getByText(/this link doesn.t look right/i)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("is kept out of search engines and does not pass the link on to other sites", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(metadata.referrer).toBe("no-referrer");
  });
});
