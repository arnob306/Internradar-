// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SiteHeader } from "./SiteHeader";

describe("SiteHeader", () => {
  it("is the page's banner landmark, with the product name linking home", () => {
    render(<SiteHeader />);

    expect(screen.getByRole("banner")).toBeTruthy();
    expect(screen.getByRole("link", { name: /InternRadar/ }).getAttribute("href")).toBe("/");
  });

  it("has a labelled main navigation with Programs marked as the current page", () => {
    render(<SiteHeader />);

    const nav = screen.getByRole("navigation", { name: "Main" });
    const programs = nav.querySelector("a[href='/']");
    expect(programs?.textContent).toBe("Programs");
    expect(programs?.getAttribute("aria-current")).toBe("page");
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

  it("treats the absence of the prop as a visitor", () => {
    render(<SiteHeader />);

    expect(screen.getByRole("link", { name: "Sign in" })).toBeTruthy();
  });

  it("draws its logo as decoration, so a screen reader reads the name once", () => {
    const { container } = render(<SiteHeader />);

    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });
});
