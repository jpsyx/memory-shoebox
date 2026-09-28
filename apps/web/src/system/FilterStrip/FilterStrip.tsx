import { Button } from "@mantine/core";
import type { ReactNode } from "react";
import classes from "@/system/system.module.css";

type Props = {
  count: number;
  children: ReactNode;
  onClear?: () => void;
};

/**
 * What the pile is currently filtered to, carried in a strip under the bar
 * rather than in a panel you have to open. A filter you cannot see is a
 * filter that will be left on by accident, and an archive that silently shows
 * a tenth of itself is the worst failure this surface has.
 */
export function FilterStrip({
  count,
  children,
  onClear,
}: Readonly<Props>): ReactNode {
  return (
    <div className={classes.filterStrip}>
      <span className={classes.filterStripCount}>
        {count.toLocaleString("en-GB")}
      </span>
      {children}
      {onClear === undefined ? null : (
        <div className={classes.filterStripEnd}>
          <Button variant="panel" size="sm" onClick={onClear}>
            Clear, show everything
          </Button>
        </div>
      )}
    </div>
  );
}
