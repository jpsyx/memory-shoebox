import { Button } from "@mantine/core";
import { Link, type LinkProps } from "@tanstack/react-router";
import type { ReactNode } from "react";
import classes from "@/system/system.module.css";

/** Props for one door: where it goes, and what it looks like getting there. */
type Props = {
  to: LinkProps["to"];
  /** Four of the five carry one. Milestones deliberately does not. */
  icon?: ReactNode;
  children: ReactNode;
};

/**
 * One door: a real anchor wearing a button's clothes.
 *
 * The nesting and `classes.barLink` are both taken from
 * `system/ProductBar/BarLink.tsx`, which already solved the two problems an
 * anchor arrives with, the browser's own blue and an underline, and the
 * reason `Link` is called directly rather than through Mantine's `component`
 * prop: only then does `to` keep its literal type and get checked against
 * the route tree. `BarLink` itself is not reused because it requires a
 * `leftSection`, and one of these five has none.
 */
export function AdminDoor({ to, icon, children }: Readonly<Props>): ReactNode {
  return (
    <Link to={to} className={classes.barLink}>
      <Button component="span" variant="default" leftSection={icon}>
        {children}
      </Button>
    </Link>
  );
}
