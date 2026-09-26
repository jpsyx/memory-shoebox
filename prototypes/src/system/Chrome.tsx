import { IconArrowLeft } from "@tabler/icons-react";
import { clsx } from "clsx";
import type { ReactNode } from "react";
import { ICON_PROPS } from "@/system/icons";
import classes from "@/system/system.module.css";

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
}: {
  readonly title?: string;
  readonly detail?: string;
  readonly back?: string;
  readonly children?: ReactNode;
}): ReactNode {
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
        <button type="button" className={classes.backlink}>
          <IconArrowLeft {...ICON_PROPS} />
          {back}
        </button>
      )}
      {children === undefined ? null : (
        <div className={classes.barActions}>{children}</div>
      )}
    </header>
  );
}

/** A reading-width page on the panel: 62rem. */
export function Page({
  children,
  wide = false,
}: {
  readonly children: ReactNode;
  readonly wide?: boolean;
}): ReactNode {
  return (
    <main className={wide ? classes.pageWide : classes.page}>{children}</main>
  );
}

/** A surface with nothing but one thing in the middle of the panel. */
export function Centred({
  children,
}: {
  readonly children: ReactNode;
}): ReactNode {
  return <main className={classes.centred}>{children}</main>;
}

/**
 * The card. One of only two things in the system that may be called one: the
 * sign-in dialog, and the index list of these mockups.
 */
export function Card({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}): ReactNode {
  return <div className={clsx(classes.card, className)}>{children}</div>;
}

/**
 * A print-ground panel that holds a form, a table, or a list. Flat contact
 * shadow only: it is paper lying on the enamel, not a raised card.
 */
export function Sheet({
  children,
  wide = false,
  className,
  label,
}: {
  readonly children: ReactNode;
  readonly wide?: boolean;
  readonly className?: string;
  readonly label?: string;
}): ReactNode {
  return (
    <section
      className={clsx(classes.sheet, wide && classes.sheetWide, className)}
      aria-label={label}
    >
      {children}
    </section>
  );
}

/** A sheet's heading row: a title, an optional count, and room on the right. */
export function SheetHead({
  title,
  children,
}: {
  readonly title: ReactNode;
  readonly children?: ReactNode;
}): ReactNode {
  return (
    <div className={classes.sheetHead}>
      <h2 className={classes.headline}>{title}</h2>
      {children === undefined ? null : (
        <div className={classes.sheetHeadSpacer}>{children}</div>
      )}
    </div>
  );
}

/**
 * A quiet strip of explanation, carried by a 3px ink rule rather than by a
 * hue. Used for the things a member has to be told plainly: that an admin
 * sees everything, that a hidden item is simply absent.
 */
export function Banner({
  icon,
  children,
  onPanel = false,
}: {
  readonly icon?: ReactNode;
  readonly children: ReactNode;
  readonly onPanel?: boolean;
}): ReactNode {
  return (
    <div className={clsx(classes.banner, onPanel && classes.bannerOnPanel)}>
      {icon === undefined ? null : (
        <span className={classes.bannerIcon}>{icon}</span>
      )}
      <div>{children}</div>
    </div>
  );
}
