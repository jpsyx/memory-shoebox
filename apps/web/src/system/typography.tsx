import { clsx } from "clsx";
import type { ReactNode } from "react";
import classes from "@/system/system.module.css";

type TextBlock = {
  readonly children: ReactNode;
  readonly className?: string;
  readonly id?: string;
};

type LedeProps = TextBlock;

/** The single lede on a surface, capped at 24ch. Familjen Grotesk 700. */
export function Lede({ children, className, id }: LedeProps): ReactNode {
  return (
    <h1 className={clsx(classes.lede, className)} id={id}>
      {children}
    </h1>
  );
}

type HeadlineProps = TextBlock;

/** A count or a section heading in figure type. */
export function Headline({ children, className }: HeadlineProps): ReactNode {
  return <h2 className={clsx(classes.headline, className)}>{children}</h2>;
}

type TitleTextProps = TextBlock;

/** A smaller heading: an index card title, the name in the top bar. */
export function TitleText({ children, className }: TitleTextProps): ReactNode {
  return <h3 className={clsx(classes.title, className)}>{children}</h3>;
}

type LabelTextProps = TextBlock & {
  readonly component?: "p" | "span" | "h2" | "h3" | "h4" | "dt";
};

/** Tracked Archivo Narrow caps. Month names, section labels, markers. */
export function LabelText({
  children,
  className,
  component: Component = "p",
}: LabelTextProps): ReactNode {
  return (
    <Component className={clsx(classes.label, className)}>{children}</Component>
  );
}

type ProseProps = TextBlock & { readonly onPanel?: boolean };

/**
 * Prose, capped at 62ch. `onPanel` swaps the quiet ink for the one mixed into
 * the enamel rather than into a white print.
 */
export function Prose({
  children,
  className,
  onPanel = false,
}: ProseProps): ReactNode {
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

type StatProps = {
  readonly figure: ReactNode;
  readonly label: string;
};

/** A figure over a label: the shape every count in the system takes. */
export function Stat({ figure, label }: StatProps): ReactNode {
  return (
    <div className={classes.stat}>
      <span className={classes.statFigure}>{figure}</span>
      <span className={classes.statLabel}>{label}</span>
    </div>
  );
}
