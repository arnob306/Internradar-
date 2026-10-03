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

  it("draws its logo as decoration, so a screen reader reads the name once", () => {
    const { container } = render(<SiteHeader />);

    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });
});
