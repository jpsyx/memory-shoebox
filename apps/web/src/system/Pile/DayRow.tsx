import type { ReactNode } from "react";
import classes from "@/system/system.module.css";

type Props = {
  children: ReactNode;
};

/** One grid row of the archive: `display: contents`, so the spine can stick. */
export function DayRow({ children }: Readonly<Props>): ReactNode {
  return <section className={classes.day}>{children}</section>;
}
