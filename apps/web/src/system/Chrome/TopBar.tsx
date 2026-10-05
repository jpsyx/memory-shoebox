import { Link, type LinkProps } from "@tanstack/react-router";
import { IconArrowLeft } from "@tabler/icons-react";
import type { MouseEvent, ReactNode } from "react";
import { ICON_PROPS } from "@/system/icons";
import classes from "@/system/system.module.css";

/** The way out of a page: the words and the destination together. */
type BackLink = {
  label: string;
  to: LinkProps["to"];
  /** Whatever `to` needs, for a destination that carries a parameter. */
  params?: LinkProps["params"];
  /** The destination's search, for a way back to one day of the pile. */
  search?: LinkProps["search"];
  /**
   * Runs before the link navigates. Calling `preventDefault` stops it, which
   * is how the item page goes back through history instead when there is
   * history to go back through.
   */
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
};

type Props = {
  title?: string;
  detail?: string;
  /**
   * The way out, where there is one: the words and the destination together.
   *
   * One prop rather than two, so a label with nothing behind it cannot be
   * written. Every surface still to be ported calls this with a `back` word
   * and no destination, because in the drawn references the way out went nowhere,
   * and two optionals would let each of those through the compiler and out
   * to a reader who presses a link that does not move.
   *
   * `to` is typed against the route tree rather than as a string: a plain
   * `string` satisfies `Link`'s `to` without being checked against it.
   */
  back?: Readonly<BackLink>;
  children?: ReactNode;
};

/**
 * The sticky opaque top bar. Never translucent, never blurred, at any width:
 * a floating frosted header is the exact pattern this world refuses.
 *
 * It appears in two shapes. On the archive it carries the instance title and
 * a quiet count; on an item it carries a back link instead, because an item
 * is somewhere you went and the way out has to be the first thing on the bar.
 */
export function TopBar({
  title,
  detail,
  back,
  children,
}: Readonly<Props>): ReactNode {
  return (
    <header className={classes.bar}>
      {back === undefined ? (
        <p className={classes.barName}>
          <span className={classes.barNameTitle}>{title}</span>
          {detail === undefined ? null : (
            <span className={classes.barNameSub}>{detail}</span>
          )}
        </p>
      ) : (
        <Link
          to={back.to}
          params={back.params}
          search={back.search}
          onClick={back.onClick}
          className={classes.backlink}
        >
          <IconArrowLeft {...ICON_PROPS} />
          {back.label}
        </Link>
      )}
      {children === undefined ? null : (
        <div className={classes.barActions}>{children}</div>
      )}
    </header>
  );
}
