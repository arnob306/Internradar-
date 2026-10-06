import type { WindowStatus } from "../../components/StatusChip";

/**
 * The window a student cares about: the newest one that has not closed, else the newest of all.
 * Windows are listed newest first. The date text on a card and the eligibility check both use
 * this one rule, so they can never describe or judge different windows.
 */
export function headlineWindow<T extends { readonly status: WindowStatus }>(
  windows: readonly T[],
): T | undefined {
  return windows.find((window) => window.status !== "closed") ?? windows[0];
}
