import type { ReactNode } from "react";
import classes from "@/system/system.module.css";

type Props = {
  children: ReactNode;
  component?: "main" | "section";
};

/**
 * The two-column archive frame: the spine, then the field it holds still.
 *
 * It is the page's landmark on the timeline and a plain section wherever the
 * pile appears under something else, such as a set of results.
 */
export function Archive({
  children,
  component: Component = "main",
}: Readonly<Props>): ReactNode {
  return <Component className={classes.archive}>{children}</Component>;
}
