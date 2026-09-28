import { Link, type LinkProps } from "@tanstack/react-router";
import { IconArrowLeft } from "@tabler/icons-react";
import { clsx } from "clsx";
import type { ReactNode } from "react";
import { ICON_PROPS } from "@/system/icons";
import classes from "@/system/system.module.css";

type TopBarProps = {
  readonly title?: string;
  readonly detail?: string;
  /**
   * The way out, where there is one: the words and the destination together.
   *
   * One prop rather than two, so a label with nothing behind it cannot be
   * written. Every surface still to be ported calls this with a `back` word
   * and no destination, because in the prototypes the way out went nowhere,
   * and two optionals would let each of those through the compiler and out
   * to a reader who presses a link that does not move.
   *
   * `to` is typed against the route tree rather than as a string: a plain
   * `string` satisfies `Link`'s `to` without being checked against it.
   */
  readonly back?: {
    readonly label: string;
    readonly to: LinkProps["to"];
    /** Whatever `to` needs, for a destination that carries a parameter. */
    readonly params?: LinkProps["params"];
  };
  readonly children?: ReactNode;
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
}: TopBarProps): ReactNode {
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
        <Link to={back.to} params={back.params} className={classes.backlink}>
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

type PageProps = {
  readonly children: ReactNode;
  readonly wide?: boolean;
};

/** A reading-width page on the panel: 62rem. */
export function Page({ children, wide = false }: PageProps): ReactNode {
  return (
    <main className={wide ? classes.pageWide : classes.page}>{children}</main>
  );
}

type CentredProps = {
  readonly children: ReactNode;
};

/** A surface with nothing but one thing in the middle of the panel. */
export function Centred({ children }: CentredProps): ReactNode {
  return <main className={classes.centred}>{children}</main>;
}

type CardProps = {
  readonly children: ReactNode;
  readonly className?: string;
};

/**
 * The card. One of only two things in the system that may be called one: the
 * sign-in dialog, and the index list of these mockups.
 */
export function Card({ children, className }: CardProps): ReactNode {
  return <div className={clsx(classes.card, className)}>{children}</div>;
}

type SheetProps = {
  readonly children: ReactNode;
  readonly wide?: boolean;
  readonly className?: string;
  readonly label?: string;
};

/**
 * A print-ground panel that holds a form, a table, or a list. Flat contact
 * shadow only: it is paper lying on the enamel, not a raised card.
 */
export function Sheet({
  children,
  wide = false,
  className,
  label,
}: SheetProps): ReactNode {
  return (
    <section
      className={clsx(classes.sheet, wide && classes.sheetWide, className)}
      aria-label={label}
    >
      {children}
    </section>
  );
}

type SheetHeadProps = {
  readonly title: ReactNode;
  readonly children?: ReactNode;
};

/** A sheet's heading row: a title, an optional count, and room on the right. */
export function SheetHead({ title, children }: SheetHeadProps): ReactNode {
  return (
    <div className={classes.sheetHead}>
      <h2 className={classes.headline}>{title}</h2>
      {children === undefined ? null : (
        <div className={classes.sheetHeadSpacer}>{children}</div>
      )}
    </div>
  );
}

type BannerProps = {
  readonly icon?: ReactNode;
  readonly children: ReactNode;
  readonly onPanel?: boolean;
};

/**
 * A quiet strip of explanation, carried by a 3px ink rule rather than by a
 * hue. Used for the things a member has to be told plainly: that an admin
 * sees everything, that a hidden item is simply absent.
 */
export function Banner({
  icon,
  children,
  onPanel = false,
}: BannerProps): ReactNode {
  return (
    <div className={clsx(classes.banner, onPanel && classes.bannerOnPanel)}>
      {icon === undefined ? null : (
        <span className={classes.bannerIcon}>{icon}</span>
      )}
      <div>{children}</div>
    </div>
  );
}
