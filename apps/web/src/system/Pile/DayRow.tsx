import type { ReactNode } from "react";
import classes from "@/system/system.module.css";

type Props = {
  children: ReactNode;
};

/**
 * One bounded day subgrid keeps its sticky summary out of the next day and
 * footer.
 */
export function DayRow({ children }: Readonly<Props>): ReactNode {
  return <section className={classes.day}>{children}</section>;
}
