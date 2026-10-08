import type { ReactElement } from "react";
import { DATE_BASIS_LABELS, type DateBasis } from "../features/timeline/date-basis";

/**
 * How sure a program's date is. The words carry the meaning; the small mark echoes the chart's own
 * language (solid for published dates, dashed for guesses) and is only the picture.
 */
export function DateBasisChip({ basis }: { readonly basis: DateBasis }): ReactElement {
  return (
    <span className="basis-chip" data-basis={basis}>
      <span className="basis-mark" aria-hidden="true" />
      {DATE_BASIS_LABELS[basis]}
    </span>
  );
}
