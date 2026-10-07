import { Banner } from "@/system/Chrome/Banner";
import { ICON_PROPS } from "@/system/icons";
import { Prose } from "@/system/typography/Prose";
import { IconInfoCircle } from "@tabler/icons-react";
import dayjs from "dayjs";
import type { ReactNode } from "react";
import type { MilestoneSpan } from "./MilestoneDateFields";
type Props = {
  span: MilestoneSpan;
  coveredDates: string[];
  selectionLabel: string;
};
function _isDateOutsideSpan({
  date,
  span,
}: Readonly<{ date: string; span: Readonly<MilestoneSpan> }>): boolean {
  const day = dayjs(date);
  return (
    span.startsOn !== undefined &&
    (day.isBefore(dayjs(span.startsOn), "day") ||
      day.isAfter(dayjs(span.endsOn ?? span.startsOn), "day"))
  );
}
/** Explains how the chosen dates relate to the selected photographs. */
export function MilestoneDateFeedback({
  span,
  coveredDates,
  selectionLabel,
}: Readonly<
  Omit<Props, "span" | "coveredDates"> & {
    span: Readonly<MilestoneSpan>;
    coveredDates: readonly string[];
  }
>): ReactNode {
  const outsideCount = coveredDates.filter((date) => {
    return _isDateOutsideSpan({ date, span });
  }).length;
  return (
    <>
      {outsideCount === 0 ? null : (
        <Banner icon={<IconInfoCircle {...ICON_PROPS} />}>
          <b>
            {outsideCount} of {selectionLabel} were taken outside these dates.
          </b>{" "}
          They will stay attached. After saving, you can adjust the occasion's
          dates or the photographs' capture dates.
        </Banner>
      )}
      {coveredDates.length === 0 || span.startsOn === undefined ? (
        <Prose>Choose dates to find photographs for this occasion.</Prose>
      ) : null}
    </>
  );
}
