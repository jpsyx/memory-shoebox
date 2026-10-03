import { Link, type LinkProps } from "@tanstack/react-router";
import type { ReactNode } from "react";
import classes from "@/system/system.module.css";

type Props = {
  children: ReactNode;
  to: LinkProps["to"];
  search?: LinkProps["search"];
};

/**
 * A tag or a person that goes somewhere when pressed: the pile, filtered by
 * it.
 *
 * Drawn exactly as a `Chip`, because it is the same label, but a link rather
 * than a button. A chip with nothing to do would be a focusable button that
 * does nothing, and a person in this product is a filter rather than a
 * profile (`PRODUCT.md` § The archive), so pressing one opens the pile of
 * their photographs.
 */
export function ChipLink({ children, to, search }: Readonly<Props>): ReactNode {
  return (
    <Link to={to} search={search} className={classes.chip}>
      {children}
    </Link>
  );
}
