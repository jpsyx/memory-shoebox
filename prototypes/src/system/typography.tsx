import { clsx } from "clsx";
import type { ReactNode } from "react";
import classes from "@/system/system.module.css";

interface TextBlockProps {
  readonly children: ReactNode;
  readonly className?: string;
  readonly id?: string;
}

/** The single lede on a surface, capped at 24ch. Familjen Grotesk 700. */
export function Lede({ children, className, id }: TextBlockProps): ReactNode {
  return (
    <h1 className={clsx(classes.lede, className)} id={id}>
      {children}
    </h1>
  );
}

/** A count or a section heading in figure type. */
export function Headline({ children, className }: TextBlockProps): ReactNode {
  return <h2 className={clsx(classes.headline, className)}>{children}</h2>;
}

/** A smaller heading: an index card title, the name in the top bar. */
export function TitleText({ children, className }: TextBlockProps): ReactNode {
  return <h3 className={clsx(classes.title, className)}>{children}</h3>;
}

/** Tracked Archivo Narrow caps. Month names, section labels, markers. */
export function LabelText({
  children,
  className,
  component: Component = "p",
}: TextBlockProps & {
  readonly component?: "p" | "span" | "h2" | "h3" | "h4" | "dt";
}): ReactNode {
  return (
    <Component className={clsx(classes.label, className)}>{children}</Component>
  );
}

/**
 * Prose, capped at 62ch. `onPanel` swaps the quiet ink for the one mixed into
 * the enamel rather than into a white print.
 */
export function Prose({
  children,
  className,
  onPanel = false,
}: TextBlockProps & { readonly onPanel?: boolean }): ReactNode {
  return (
    <p
      className={clsx(
        classes.prose,
        onPanel && classes.proseOnPanel,
        className,
      )}
    >
      {children}
    </p>
  );
}

/** A figure over a label: the shape every count in the system takes. */
export function Stat({
  figure,
  label,
}: {
  readonly figure: ReactNode;
  readonly label: string;
}): ReactNode {
  return (
    <div className={classes.stat}>
      <span className={classes.statFigure}>{figure}</span>
      <span className={classes.statLabel}>{label}</span>
    </div>
  );
}
