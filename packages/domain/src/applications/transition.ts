/**
 * Where an application can go next (decision D9). Moves only go forward through the funnel, the
 * online assessment can be skipped, and `rejected` can happen at any point before an offer.
 * `offer` and `rejected` are the ends. The one way back is undoing the most recent move.
 */
export const APPLICATION_STATUSES = [
  "saved",
  "applied",
  "online_assessment",
  "interview",
  "offer",
  "rejected",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

const NEXT: Readonly<Record<ApplicationStatus, readonly ApplicationStatus[]>> = {
  saved: ["applied", "rejected"],
  applied: ["online_assessment", "interview", "rejected"],
  online_assessment: ["interview", "rejected"],
  interview: ["offer", "rejected"],
  offer: [],
  rejected: [],
};

export type TransitionResult =
  | { readonly ok: true; readonly status: ApplicationStatus }
  | { readonly ok: false; readonly code: "SAME_STATUS" | "NOT_ALLOWED" };

/** The most recent status change of one application: how it looked before and after. */
export interface StatusChange {
  readonly fromStatus: ApplicationStatus | null;
  readonly toStatus: ApplicationStatus;
  /** True when that change was itself an undo. */
  readonly isUndo?: boolean;
}

export function isApplicationStatus(value: unknown): value is ApplicationStatus {
  return typeof value === "string" && (APPLICATION_STATUSES as readonly string[]).includes(value);
}

export function nextStatuses(from: ApplicationStatus): readonly ApplicationStatus[] {
  return NEXT[from];
}

export function transition(from: ApplicationStatus, to: ApplicationStatus): TransitionResult {
  if (from === to) {
    return { ok: false, code: "SAME_STATUS" };
  }
  return NEXT[from].includes(to) ? { ok: true, status: to } : { ok: false, code: "NOT_ALLOWED" };
}

/**
 * The status an undo returns to, or null when there is nothing to undo: no move yet, only the
 * moment the application was first saved, or a latest move that was itself an undo (the database
 * allows one step back at a time and records it, so undo never walks further back).
 */
export function undoTarget(latest: StatusChange | null): ApplicationStatus | null {
  return latest === null || latest.isUndo === true ? null : latest.fromStatus;
}
