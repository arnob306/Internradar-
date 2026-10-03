import type { ReactElement } from "react";

export type WindowStatus = "open" | "upcoming" | "closed" | "unknown";

const LABELS: Readonly<Record<WindowStatus, string>> = {
  open: "Open",
  upcoming: "Opening soon",
  closed: "Closed",
  unknown: "Dates not published",
};

// Icons are drawn from simple strokes so they inherit the chip's text colour.
const ICON_PATHS: Readonly<Record<WindowStatus, ReactElement>> = {
  open: <path d="m5 12 5 5 9-10" />,
  upcoming: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  closed: (
    <>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  unknown: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.7M12 17h.01" />
    </>
  ),
};

/** Whether applications are open. The words carry the meaning; colour and the icon support them. */
export function StatusChip({ status }: { readonly status: WindowStatus }): ReactElement {
  return (
    <span className="chip" data-status={status}>
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {ICON_PATHS[status]}
      </svg>
      {LABELS[status]}
    </span>
  );
}
