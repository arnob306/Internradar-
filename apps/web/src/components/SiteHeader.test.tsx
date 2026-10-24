// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const pathname = vi.fn<() => string>();
vi.mock("next/navigation", () => ({ usePathname: () => pathname() }));

import { SiteHeader } from "./SiteHeader";

beforeEach(() => {
  pathname.mockReset().mockReturnValue("/");
});

describe("SiteHeader", () => {
  it("marks only the link for the page being viewed as current", () => {
    pathname.mockReturnValue("/");
    render(<SiteHeader signedIn />);

    const nav = screen.getByRole("navigation", { name: "Main" });
    const current = [...nav.querySelectorAll("a[aria-current='page']")].map((link) => link.textContent);
    expect(current).toEqual(["Timeline"]);
  });

  it("keeps a section's link current on its sub-pages, and Programs on a program page", () => {
    pathname.mockReturnValue("/tracker/anything");
    const { unmount } = render(<SiteHeader signedIn />);
    expect(screen.getByRole("link", { name: "Tracker" }).getAttribute("aria-current")).toBe("page");
    unmount();

    pathname.mockReturnValue("/programs/co/prog");
    render(<SiteHeader />);
    expect(screen.getByRole("link", { name: "Programs" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Timeline" }).getAttribute("aria-current")).toBeNull();
  });

  it("marks nothing as current on a page the navigation does not list", () => {
    pathname.mockReturnValue("/trackers");
    render(<SiteHeader signedIn />);

    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(nav.querySelector("a[aria-current='page']")).toBeNull();
  });

  it("is the page's banner landmark, with the product name linking home", () => {
    render(<SiteHeader />);

    expect(screen.getByRole("banner")).toBeTruthy();
    expect(screen.getByRole("link", { name: /InternRadar/ }).getAttribute("href")).toBe("/");
  });

  it("has a labelled main navigation with Timeline marked as the current page on the home page", () => {
    render(<SiteHeader />);

    const nav = screen.getByRole("navigation", { name: "Main" });
    const timeline = nav.querySelector("a[href='/']");
    expect(timeline?.textContent).toBe("Timeline");
    expect(timeline?.getAttribute("aria-current")).toBe("page");
    expect(nav.querySelector("a[href='/programs']")?.getAttribute("aria-current")).toBeNull();
  });

  it("offers a visitor a way in, and nothing that needs an account", () => {
    render(<SiteHeader signedIn={false} />);

    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(nav.querySelector("a[href='/login']")?.textContent).toBe("Sign in");
    expect(nav.querySelector("a[href='/profile']")).toBeNull();
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
  });

  it("gives a signed-in student their profile and a way out, and no sign-in link", () => {
    render(<SiteHeader signedIn />);

    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(nav.querySelector("a[href='/profile']")?.textContent).toBe("Profile");
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
    expect(nav.querySelector("a[href='/login']")).toBeNull();
  });

  it("gives a signed-in student a link to their tracker, and a visitor none", () => {
    const { unmount } = render(<SiteHeader signedIn />);
    expect(screen.getByRole("link", { name: "Tracker" }).getAttribute("href")).toBe("/tracker");
    unmount();

    render(<SiteHeader />);
    expect(screen.queryByRole("link", { name: "Tracker" })).toBeNull();
  });

  it("links everyone, signed in or not, to the timeline and the list of programs", () => {
    const { unmount } = render(<SiteHeader />);
    expect(screen.getByRole("link", { name: "Timeline" }).getAttribute("href")).toBe("/");
    expect(screen.getByRole("link", { name: "Programs" }).getAttribute("href")).toBe("/programs");
    unmount();

    render(<SiteHeader signedIn />);
    expect(screen.getByRole("link", { name: "Timeline" }).getAttribute("href")).toBe("/");
    expect(screen.getByRole("link", { name: "Programs" }).getAttribute("href")).toBe("/programs");
  });

  it("treats the absence of the prop as a visitor", () => {
    render(<SiteHeader />);

    expect(screen.getByRole("link", { name: "Sign in" })).toBeTruthy();
  });

  it("draws its logo as decoration, so a screen reader reads the name once", () => {
    const { container } = render(<SiteHeader />);

    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });
});
