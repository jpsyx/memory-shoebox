import { Table } from "@mantine/core";
import { clsx } from "clsx";
import type { ReactNode } from "react";
import classes from "./PresenceMetric.module.css";
type Props = {
  label: string;
  metricCount: number;
  activeDaysWindowDays: number;
};
/**
 * A presence count includes its active-day denominator only for that metric.
 */
export function PresenceMetric({
  label,
  metricCount,
  activeDaysWindowDays,
}: Readonly<Props>): ReactNode {
  return (
    <Table.Td data-label={label}>
      <span
        className={clsx(
          classes.presenceMetricFigure,
          metricCount === 0 && classes.presenceMetricQuiet,
        )}
      >
        {metricCount.toLocaleString()}
      </span>
      {label === "Days active" ? (
        <div className={classes.presenceMetricQuiet}>
          of {activeDaysWindowDays} days
        </div>
      ) : null}
    </Table.Td>
  );
}
