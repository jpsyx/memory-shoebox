import type { ReactNode, Ref } from "react";
import classes from "@/system/system.module.css";

type Props = {
  children: ReactNode;
  component?: "main" | "section";
  /**
   * The seen latch observes every print inside this element. One observer
   * for the whole pile rather than a ref per print, which is why the
   * element itself has to be reachable.
   */
  ref?: Ref<HTMLElement>;
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
  ref,
}: Readonly<Props>): ReactNode {
  return (
    <Component ref={ref} className={classes.archive}>
      {children}
    </Component>
  );
}
