import { Button } from "@mantine/core";
import {
  IconPlus,
  IconSearch,
  IconUserCircle,
  IconUsers,
} from "@tabler/icons-react";
import { Link, type LinkProps } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { TopBar } from "@/system/Chrome";
import { ICON_PROPS } from "@/system/icons";

type Props = {
  /** What this deployment calls itself: `shoebox.name`. */
  readonly shoeboxName: string;
  /** The viewer's own name, on the way in to their account. */
  readonly memberName: string;
  readonly role: "viewer" | "uploader" | "admin";
  /** The quiet line under the name. Composed by the caller. */
  readonly detail?: string;
};

type BarLinkProps = {
  readonly to: LinkProps["to"];
  /** Whatever `to` needs, for a destination with search parameters. */
  readonly search?: LinkProps["search"];
  readonly variant?: string;
  readonly leftSection: ReactNode;
  readonly children: ReactNode;
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
function _BarLink({
  to,
  search,
  variant,
  leftSection,
  children,
}: BarLinkProps): ReactNode {
  return (
    <Link to={to} search={search}>
      <Button component="span" variant={variant} leftSection={leftSection}>
        {children}
      </Button>
    </Link>
  );
}

/**
 * The product's own top bar.
 *
 * Four plain buttons, never a menu and never a drawer: the pile is the
 * interface, and everything an interface hides behind a hamburger is
 * something this audience will not find. Upload only appears for the roles
 * that can, because a viewer should not be shown an affordance they do not
 * have.
 *
 * Admin surfaces are reached from My account rather than from here. A fifth
 * and sixth button on the bar would cost more than the shortcut is worth, and
 * an admin is by definition the one person who will go looking.
 */
export function ProductBar({
  shoeboxName,
  memberName,
  role,
  detail,
}: Props): ReactNode {
  return (
    <TopBar title={shoeboxName} detail={detail}>
      <_BarLink
        to="/"
        search={{ find: true }}
        variant="panel"
        leftSection={<IconSearch {...ICON_PROPS} />}
      >
        Find
      </_BarLink>
      <_BarLink
        to="/people"
        variant="panel"
        leftSection={<IconUsers {...ICON_PROPS} />}
      >
        People
      </_BarLink>
      {role === "viewer" ? null : (
        <_BarLink to="/upload" leftSection={<IconPlus {...ICON_PROPS} />}>
          Add
        </_BarLink>
      )}
      <_BarLink
        to="/account"
        variant="panel"
        leftSection={<IconUserCircle {...ICON_PROPS} />}
      >
        {memberName}
      </_BarLink>
    </TopBar>
  );
}
