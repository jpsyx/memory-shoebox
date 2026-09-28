import type { ReactNode } from "react";
import classes from "@/system/system.module.css";

type Props = {
  children: ReactNode;
};

/** A row of chips that wraps rather than scrolling sideways. */
export function ChipRow({ children }: Readonly<Props>): ReactNode {
  return <div className={classes.chipRow}>{children}</div>;
}
