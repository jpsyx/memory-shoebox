import { Button } from "@mantine/core";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Prose } from "@/system/typography/Prose";
import classes from "@/system/system.module.css";

/**
 * The plain sentence and button a milestone-only day stands up with, when
 * the occasion covering it has nothing else attached to it yet.
 *
 * `Link` directly, then a `span` Button inside it: see
 * `system/ProductBar/BarLink.tsx` for why `component={Link}` loses the
 * route-tree check on `to`.
 */
export function MilestoneEmptyPile(): ReactNode {
  return (
    <div className={classes.milestoneEmptyPile}>
      <Prose onPanel>
        Nothing is attached to this one yet, and the day is here anyway.
      </Prose>
      <Link to="/milestones" className={classes.barLink}>
        <Button component="span" variant="panel" size="sm">
          Find photographs for it
        </Button>
      </Link>
    </div>
  );
}
