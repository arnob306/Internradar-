// @vitest-environment jsdom
import { DISCIPLINES } from "@internradar/domain";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProfileInput } from "../features/profile/profile-input";
import { ProfileForm } from "./ProfileForm";

const EMPTY: ProfileInput = {
  expectedGraduation: null,
  degreeLevel: null,
  disciplines: [],
  isDoubleDegree: false,
  planningHonours: false,
  citizenship: null,
  university: null,
  emailAlerts: true,
};

const SAVED: ProfileInput = {
  expectedGraduation: { year: 2027, month: 6 },
  degreeLevel: "undergraduate",
  disciplines: ["computer_science"],
  isDoubleDegree: false,
  planningHonours: true,
  citizenship: "au_citizen",
  university: "Monash University",
  emailAlerts: false,
};

function answer(status: number, body: unknown = {}) {
  const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status })));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function sentBody(fetchMock: ReturnType<typeof answer>): unknown {
  const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  return JSON.parse(init.body as string);
}

function show(initial: ProfileInput = EMPTY) {
  render(<ProfileForm initial={initial} currentYear={2026} />);
  return userEvent.setup();
}

afterEach(() => vi.unstubAllGlobals());

describe("ProfileForm: what it asks", () => {
  it("shows what was saved before", () => {
    show(SAVED);

    expect((screen.getByLabelText("Graduation month") as HTMLSelectElement).value).toBe("6");
    expect((screen.getByLabelText("Graduation year") as HTMLSelectElement).value).toBe("2027");
    expect((screen.getByLabelText("Degree level") as HTMLSelectElement).value).toBe("undergraduate");
    expect((screen.getByLabelText("University") as HTMLInputElement).value).toBe("Monash University");
    expect((screen.getByLabelText("Computer science") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText(/Email me when/) as HTMLInputElement).checked).toBe(false);
  });

  it("offers every degree area in the vocabulary as a checkbox, and nothing else", () => {
    show();

    const group = screen.getByRole("group", { name: "Degree areas" });
    expect(within(group).getAllByRole("checkbox")).toHaveLength(DISCIPLINES.length);
  });

  it("explains that graduation means the last degree they will finish, and asks about honours", () => {
    show();

    expect(screen.getByText(/last degree you will finish/i)).toBeTruthy();
    expect(screen.getByLabelText(/planning an honours year/i)).toBeTruthy();
  });

  it("makes citizenship optional, with 'Prefer not to say' first and a plain reason it is asked", () => {
    show();

    const select = screen.getByLabelText("Citizenship or residency") as HTMLSelectElement;
    expect(select.options[0]?.textContent).toBe("Prefer not to say");
    expect(select.value).toBe("");
    expect(screen.getByText(/only used to check programs.+never shown/i)).toBeTruthy();
  });

  it("offers graduation years from this year to eight years ahead", () => {
    show();

    const years = Array.from((screen.getByLabelText("Graduation year") as HTMLSelectElement).options).map(
      (option) => option.value,
    );
    expect(years).toEqual(["", "2026", "2027", "2028", "2029", "2030", "2031", "2032", "2033", "2034"]);
  });

  it("keeps a saved graduation year that falls outside that range selectable", () => {
    show({ ...EMPTY, expectedGraduation: { year: 2040, month: 11 } });

    expect((screen.getByLabelText("Graduation year") as HTMLSelectElement).value).toBe("2040");
  });

  it("stops at six degree areas, and says why the rest are unavailable", async () => {
    const user = show();
    const group = screen.getByRole("group", { name: "Degree areas" });
    for (const box of within(group).getAllByRole("checkbox").slice(0, 6)) {
      await user.click(box);
    }

    const rest = within(group).getAllByRole("checkbox").slice(6) as HTMLInputElement[];
    expect(rest.every((box) => box.disabled)).toBe(true);
    expect(screen.getByText("You can pick up to 6.")).toBeTruthy();
  });
});

describe("ProfileForm: saving", () => {
  it("sends exactly the profile as a JSON PUT, then confirms in words", async () => {
    const fetchMock = answer(200, { success: true });
    const user = show(EMPTY);

    await user.selectOptions(screen.getByLabelText("Graduation month"), "11");
    await user.selectOptions(screen.getByLabelText("Graduation year"), "2027");
    await user.selectOptions(screen.getByLabelText("Degree level"), "honours");
    await user.click(screen.getByLabelText("Law"));
    await user.click(screen.getByLabelText(/doing a double degree/i));
    await user.selectOptions(screen.getByLabelText("Citizenship or residency"), "nz_citizen");
    await user.type(screen.getByLabelText("University"), "  RMIT  ");
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/v1/me/profile");
    expect(init.method).toBe("PUT");
    expect((init.headers as Record<string, string>)["content-type"]).toBe("application/json");
    expect(sentBody(fetchMock)).toEqual({
      expectedGraduation: { year: 2027, month: 11 },
      degreeLevel: "honours",
      disciplines: ["law"],
      isDoubleDegree: true,
      planningHonours: false,
      citizenship: "nz_citizen",
      university: "  RMIT  ",
      emailAlerts: true,
    });
    expect((await screen.findByRole("status")).textContent).toBe("Profile saved.");
  });

  it("sends nothing for what was left blank", async () => {
    const fetchMock = answer(200, { success: true });
    const user = show(EMPTY);

    await user.click(screen.getByRole("button", { name: "Save profile" }));

    expect(sentBody(fetchMock)).toMatchObject({
      expectedGraduation: null,
      degreeLevel: null,
      citizenship: null,
      university: null,
      disciplines: [],
    });
  });

  it("does not send a half-chosen graduation date, and says what to fix", async () => {
    const fetchMock = answer(200, { success: true });
    const user = show(EMPTY);

    await user.selectOptions(screen.getByLabelText("Graduation month"), "6");
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    expect(fetchMock).not.toHaveBeenCalled();
    const message = screen.getByText("Choose both a month and a year, or leave both empty.");
    expect(message.getAttribute("role")).toBe("alert");
    expect(screen.getByLabelText("Graduation month").getAttribute("aria-describedby")).toContain(message.id);
  });

  it("shows the server's message beside the field it is about", async () => {
    answer(400, {
      success: false,
      error: { code: "VALIDATION_ERROR", fields: [{ field: "university", message: "university must be plain text." }] },
    });
    const user = show(EMPTY);

    await user.click(screen.getByRole("button", { name: "Save profile" }));

    const message = await screen.findByText("university must be plain text.");
    expect(screen.getByLabelText("University").getAttribute("aria-describedby")).toContain(message.id);
    expect(screen.getByLabelText("University").getAttribute("aria-invalid")).toBe("true");
  });

  it("tells a signed-out student to sign in again, with a link back here", async () => {
    answer(401, { success: false });
    const user = show(EMPTY);

    await user.click(screen.getByRole("button", { name: "Save profile" }));

    const link = await screen.findByRole("link", { name: "Sign in again" });
    expect(link.getAttribute("href")).toBe("/login?next=%2Fprofile");
  });

  it("explains a rate limit and a failure without details, keeping everything typed", async () => {
    answer(429, { success: false });
    const user = show(SAVED);
    await user.click(screen.getByRole("button", { name: "Save profile" }));
    expect(await screen.findByText("You're saving too quickly. Wait a minute, then try again.")).toBeTruthy();

    answer(500, { success: false });
    await user.click(screen.getByRole("button", { name: "Save profile" }));
    expect(await screen.findByText("We couldn't save your profile. Try again in a moment.")).toBeTruthy();
    expect((screen.getByLabelText("University") as HTMLInputElement).value).toBe("Monash University");
    expect(document.body.textContent).not.toMatch(/500/);
  });

  it("disables the button while saving so a double click saves once", async () => {
    let finish: (response: Response) => void = () => undefined;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => (finish = resolve)));
    vi.stubGlobal("fetch", fetchMock);
    const user = show(EMPTY);

    await user.click(screen.getByRole("button", { name: "Save profile" }));
    const button = screen.getByRole("button", { name: "Saving" }) as HTMLButtonElement;
    await user.click(button);

    expect(button.disabled).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    finish(new Response("{}", { status: 200 }));
  });
});
