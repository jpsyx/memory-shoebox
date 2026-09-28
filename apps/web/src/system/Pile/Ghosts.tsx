import { clsx } from "clsx";
import type { ReactNode } from "react";
import classes from "@/system/system.module.css";

/** The pile's own footprint, drawn rather than described in a sentence. */
export function Ghosts(): ReactNode {
  return (
    <div className={classes.ghosts} aria-hidden="true">
      <span className={clsx(classes.ghost, classes.ghostWide)} />
      <span className={classes.ghost} />
      <span className={clsx(classes.ghost, classes.ghostTall)} />
      <span className={classes.ghost} />
      <span className={clsx(classes.ghost, classes.ghostWide)} />
      <span className={classes.ghost} />
    </div>
  );
}
