import type { ReactNode } from "react";
import classes from "@/system/system.module.css";

type Props = {
  children: ReactNode;
};

/** The multi-column pile. Columns pack flush, crop nothing, leave no holes. */
export function Pile({ children }: Readonly<Props>): ReactNode {
  return <div className={classes.pile}>{children}</div>;
}
