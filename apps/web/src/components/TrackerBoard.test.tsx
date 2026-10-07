// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApplicationRecord } from "../server/applications/applications-handler";
import { TrackerBoard } from "./TrackerBoard";

function record(overrides: Partial<ApplicationRecord> = {}): ApplicationRecord {
  return {
    id: "a1",
    programId: "p1",
    programSlug: "graduate-program",
    programName: "EY Graduate Program",
    companySlug: "ey-australia",
    companyName: "EY Australia",
    cycleYear: 2027,
    status: "saved",
    appliedAt: null,
    notes: null,
    resumeId: null,
    updatedAt: "2026-10-08T00:00:00Z",
    ...overrides,
  };
}

function answer(status: number, body: unknown = {}) {
  const fetchMock = vi.fn(() =>
    Promise.resolve(status === 204 ? new Response(null, { status }) : new Response(JSON.stringify(body), { status })),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const callOf = (fetchMock: ReturnType<typeof answer>) => fetchMock.mock.calls[0] as unknown as [string, RequestInit];

const row = (name: string) => screen.getByRole("listitem", { name });

afterEach(() => vi.unstubAllGlobals());

describe("TrackerBoard: what it shows", () => {
  it("invites a student with nothing saved to browse programs", () => {
    render(<TrackerBoard initial={[]} />);

    expect(screen.getByText(/haven't saved any programs/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Browse programs" }).getAttribute("href")).toBe("/");
  });

  it("lists each program with its employer, intake and status in words, linking to the program", () => {
    render(<TrackerBoard initial={[record({ status: "interview" })]} />);

    const item = row("EY Graduate Program");
    expect(within(item).getByRole("link", { name: "EY Graduate Program" }).getAttribute("href")).toBe(
      "/programs/ey-australia/graduate-program",
    );
    expect(within(item).getByText("EY Australia")).toBeTruthy();
    expect(within(item).getByText("2027 intake")).toBeTruthy();
    expect(within(item).getByText("Interview")).toBeTruthy();
  });

  it("escapes the slugs in that link", () => {
    render(<TrackerBoard initial={[record({ companySlug: "x y", programSlug: "a/b" })]} />);

    expect(screen.getByRole("link", { name: "EY Graduate Program" }).getAttribute("href")).toBe(
      "/programs/x%20y/a%2Fb",
    );
  });

  it("says when they applied, as the day it was in Melbourne, from the timestamp the database keeps", () => {
    // 14:30 UTC on 1 October is already 2 October in Melbourne.
    render(<TrackerBoard initial={[record({ status: "applied", appliedAt: "2026-10-01T14:30:00+00:00" })]} />);

    expect(within(row("EY Graduate Program")).getByText("Applied 2 October 2026")).toBeTruthy();
  });

  it.each([
    ["saved", ["Applied", "Rejected"]],
    ["applied", ["Online assessment", "Interview", "Rejected"]],
    ["online_assessment", ["Interview", "Rejected"]],
    ["interview", ["Offer", "Rejected"]],
    ["offer", []],
    ["rejected", []],
  ] as const)("from %s offers only the moves the tracker allows", (status, targets) => {
    render(<TrackerBoard initial={[record({ status })]} />);

    const moves = within(row("EY Graduate Program"))
      .queryAllByRole("button", { name: /^Move to / })
      .map((button) => button.textContent);
    expect(moves).toEqual(targets.map((target) => `Move to ${target}`));
  });
});

describe("TrackerBoard: moving an application", () => {
  it("sends only the new status, as JSON, to that application, and shows the answer", async () => {
    const fetchMock = answer(200, { success: true, data: record({ status: "applied", appliedAt: "2026-10-08T05:12:33.123+00:00" }) });
    render(<TrackerBoard initial={[record()]} />);

    await userEvent.setup().click(within(row("EY Graduate Program")).getByRole("button", { name: "Move to Applied" }));

    const [url, init] = callOf(fetchMock);
    expect(url).toBe("/api/v1/me/applications/a1");
    expect(init.method).toBe("PATCH");
    expect(init.headers).toEqual({ "content-type": "application/json" });
    expect(JSON.parse(init.body as string)).toEqual({ status: "applied" });
    expect(await within(row("EY Graduate Program")).findByText("Applied 8 October 2026")).toBeTruthy();
  });

  it("puts the id in the path safely", async () => {
    const fetchMock = answer(200, { success: true, data: record({ id: "a/../b", status: "applied" }) });
    render(<TrackerBoard initial={[record({ id: "a/../b" })]} />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Move to Applied" }));

    expect(callOf(fetchMock)[0]).toBe("/api/v1/me/applications/a%2F..%2Fb");
  });

  it("goes back one step with Undo, sending no data", async () => {
    const fetchMock = answer(200, { success: true, data: record({ status: "saved" }) });
    render(<TrackerBoard initial={[record({ status: "applied", appliedAt: "2026-10-08T05:12:33.123+00:00" })]} />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Undo last move" }));

    const [url, init] = callOf(fetchMock);
    expect(url).toBe("/api/v1/me/applications/a1/undo");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "content-type": "application/json" });
    expect(await screen.findByText("Saved")).toBeTruthy();
  });

  it("says plainly when there is nothing to undo", async () => {
    answer(409, { success: false, error: { code: "NOTHING_TO_UNDO" } });
    render(<TrackerBoard initial={[record({ status: "applied" })]} />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Undo last move" }));

    expect((await screen.findByRole("alert")).textContent).toMatch(/nothing to undo/i);
  });

  it("asks the student to reload when the application changed somewhere else", async () => {
    answer(409, { success: false, error: { code: "CONFLICT" } });
    render(<TrackerBoard initial={[record()]} />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Move to Applied" }));

    expect((await screen.findByRole("alert")).textContent).toMatch(/changed in the meantime.*reload/i);
  });

  it.each([
    [401, /sign in/i],
    [429, /too quickly/i],
    [500, /couldn't update/i],
  ])("explains a %s without showing detail, and keeps the row as it was", async (status, message) => {
    answer(status, { success: false, error: { code: "X", message: "secret detail" } });
    render(<TrackerBoard initial={[record()]} />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Move to Applied" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(message);
    expect(alert.textContent).not.toMatch(/secret/);
    expect(within(row("EY Graduate Program")).getByText("Saved")).toBeTruthy();
  });

  it("treats a network failure like any other failure", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
    render(<TrackerBoard initial={[record()]} />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Move to Applied" }));

    expect((await screen.findByRole("alert")).textContent).toMatch(/couldn't update/i);
  });

  it("does not send a second change while one is in flight", async () => {
    let release: (response: Response) => void = () => undefined;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => (release = resolve)));
    vi.stubGlobal("fetch", fetchMock);
    render(<TrackerBoard initial={[record()]} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Move to Applied" }));
    expect((screen.getByRole("button", { name: "Move to Rejected" }) as HTMLButtonElement).disabled).toBe(true);
    release(new Response(JSON.stringify({ success: true, data: record({ status: "applied" }) }), { status: 200 }));

    expect(await screen.findByText("Applied")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("TrackerBoard: notes", () => {
  it("shows the saved notes and sends them back when changed", async () => {
    const fetchMock = answer(200, { success: true, data: record({ notes: "Cover letter due Friday" }) });
    render(<TrackerBoard initial={[record({ notes: "old" })]} />);
    const user = userEvent.setup();
    const box = screen.getByLabelText("Notes for EY Graduate Program") as HTMLTextAreaElement;
    expect(box.value).toBe("old");

    await user.clear(box);
    await user.type(box, "Cover letter due Friday");
    await user.click(screen.getByRole("button", { name: "Save notes" }));

    expect(JSON.parse(callOf(fetchMock)[1].body as string)).toEqual({ notes: "Cover letter due Friday" });
    expect(callOf(fetchMock)[1].method).toBe("PATCH");
    expect(await screen.findByText("Notes saved")).toBeTruthy();
  });

  it("only offers to save once the notes have changed", async () => {
    render(<TrackerBoard initial={[record({ notes: "old" })]} />);

    expect((screen.getByRole("button", { name: "Save notes" }) as HTMLButtonElement).disabled).toBe(true);
    await userEvent.setup().type(screen.getByLabelText("Notes for EY Graduate Program"), "!");
    expect((screen.getByRole("button", { name: "Save notes" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("limits the notes to what the server accepts", () => {
    render(<TrackerBoard initial={[record()]} />);

    expect((screen.getByLabelText("Notes for EY Graduate Program") as HTMLTextAreaElement).maxLength).toBe(2000);
  });
});

describe("TrackerBoard: removing", () => {
  it("asks before deleting, and cancelling sends nothing", async () => {
    const fetchMock = answer(204);
    render(<TrackerBoard initial={[record()]} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.getByText(/remove this program from your tracker/i)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Keep it" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Remove" })).toBeTruthy();
  });

  it("deletes once confirmed and drops the row", async () => {
    const fetchMock = answer(204);
    render(<TrackerBoard initial={[record(), record({ id: "a2", programName: "Other Program" })]} />);
    const user = userEvent.setup();

    await user.click(within(row("EY Graduate Program")).getByRole("button", { name: "Remove" }));
    await user.click(screen.getByRole("button", { name: "Yes, remove" }));

    const [url, init] = callOf(fetchMock);
    expect(url).toBe("/api/v1/me/applications/a1");
    expect(init.method).toBe("DELETE");
    expect(init.headers).toEqual({ "content-type": "application/json" });
    expect(screen.queryByRole("listitem", { name: "EY Graduate Program" })).toBeNull();
    expect(screen.getByRole("listitem", { name: "Other Program" })).toBeTruthy();
  });

  it("keeps the row and says so when the delete fails", async () => {
    answer(500, { success: false });
    render(<TrackerBoard initial={[record()]} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Remove" }));
    await user.click(screen.getByRole("button", { name: "Yes, remove" }));

    expect((await screen.findByRole("alert")).textContent).toMatch(/couldn't update/i);
    expect(screen.getByRole("listitem", { name: "EY Graduate Program" })).toBeTruthy();
  });
});
