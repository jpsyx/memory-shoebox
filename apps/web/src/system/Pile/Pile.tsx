import type { ReactNode } from "react";
import classes from "@/system/system.module.css";

type Props = {
  children: ReactNode;
};

/** A day's prints fill rows from left to right, retaining their proportions. */
export function Pile({ children }: Readonly<Props>): ReactNode {
  return <div className={classes.pile}>{children}</div>;
}
