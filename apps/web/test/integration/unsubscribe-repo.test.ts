import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AlertStoreError, unsubscribeFromAlert } from "../../src/server/alerts/unsubscribe-repo";
import { anonClient, cleanTestData, cleanTestUsers, insertProgram, signedInUser, withAdmin } from "./helpers";

const clean = () =>
  withAdmin(async (db) => {
    await cleanTestUsers(db);
    await cleanTestData(db);
  });

beforeEach(clean);
afterEach(clean);

/** A student with email on, and one alert sent to them. Returns both ids. */
async function studentWithAlert(): Promise<{ userId: string; alertId: string }> {
  const { userId } = await signedInUser();
  return withAdmin(async (db) => {
    const programId = await insertProgram(db, {
      company: "acme",
      slug: "grad",
      name: "Acme Graduate Program",
      windows: [{ cycleYear: 2027, status: "upcoming", opensOn: "2027-02-01", opensPrecision: "month" }],
    });
    const window = await db.query<{ id: string }>("select id from public.program_windows where program_id = $1", [
      programId,
    ]);
    await db.query(
      `insert into public.profiles (user_id, email_alerts) values ($1, true)
       on conflict (user_id) do update set email_alerts = true`,
      [userId],
    );
    const alert = await db.query<{ id: string }>(
      `insert into public.alerts (user_id, program_id, program_window_id, kind, dedupe_key)
       values ($1, $2, $3, 'opened', 'event:1') returning id`,
      [userId, programId, window.rows[0]?.id],
    );
    return { userId, alertId: alert.rows[0]?.id ?? "" };
  });
}

const alertsOn = (userId: string) =>
  withAdmin(
    async (db) =>
      (await db.query<{ email_alerts: boolean }>("select email_alerts from public.profiles where user_id = $1", [userId]))
        .rows[0]?.email_alerts,
  );

describe("stopping alert emails from the link in an email", () => {
  it("turns them off for the alert's owner, for a visitor who is not signed in", async () => {
    const { userId, alertId } = await studentWithAlert();

    await unsubscribeFromAlert(anonClient(), alertId);

    expect(await alertsOn(userId)).toBe(false);
  });

  it("changes nobody when the id matches no alert, and says nothing about it", async () => {
    const { userId } = await studentWithAlert();

    await expect(unsubscribeFromAlert(anonClient(), "99999999-9999-4999-8999-999999999999")).resolves.toBeUndefined();

    expect(await alertsOn(userId)).toBe(true);
  });

  it("can be repeated", async () => {
    const { userId, alertId } = await studentWithAlert();

    await unsubscribeFromAlert(anonClient(), alertId);
    await expect(unsubscribeFromAlert(anonClient(), alertId)).resolves.toBeUndefined();

    expect(await alertsOn(userId)).toBe(false);
  });

  it("fails with only a database code, never its message", async () => {
    // Not a uuid, so the database itself refuses it.
    const failure = await unsubscribeFromAlert(anonClient(), "not-a-uuid").catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AlertStoreError);
    expect((failure as AlertStoreError).code).not.toBe("");
    expect((failure as AlertStoreError).message).not.toContain("unsubscribe_from_alert");
  });
});
