import { Button } from "@mantine/core";
import { Link, type LinkProps } from "@tanstack/react-router";
import type { ReactNode } from "react";
import classes from "@/system/system.module.css";

type Props = {
  to: LinkProps["to"];
  /** Whatever `to` needs, for a destination with search parameters. */
  search?: LinkProps["search"];
  variant?: string;
  leftSection: ReactNode;
  children: ReactNode;
};

/**
 * One bar button, as a real anchor around a styled, inert `Button`.
 *
 * Mantine's `component` prop and `Link`'s route-tree generics do not
 * compose: Mantine's polymorphic factory reads a plain `ComponentProps<typeof
 * Link>` off the bare function reference passed to `component`, which
 * collapses `Link`'s generics to their defaults before `to` ever narrows
 * them, so `to="/definitely-not-a-route"` stops being a compile error.
 * `createLink(Button)`, TanStack Router's own answer to this composition,
 * was tried next; it type-checks `to`, but the resulting component no
 * longer exposes Mantine's `component` prop, so there is no way to make its
 * root a real `<a>` rather than a `<button>` that silently ignores `href`.
 *
 * Reversing the nesting keeps both: `Link` is called directly, so `to` is
 * read off this component's own call site and keeps its literal type, and
 * `Link`'s root is always `<a>`. `Button` renders as a plain `span` inside
 * it, contributing only its look. `UnstyledButton` (what `Button` is built
 * on) already sets `text-decoration: none`, so nothing here has to repeat
 * that reset for the anchor's sake.
 */
export function BarLink({
  to,
  search,
  variant,
  leftSection,
  children,
}: Readonly<Props>): ReactNode {
  return (
    <Link to={to} search={search} className={classes.barLink}>
      <Button component="span" variant={variant} leftSection={leftSection}>
        {children}
      </Button>
    </Link>
  );
}
