import type { ReactNode } from "react";
import { LabelText } from "@/system/typography/LabelText";
import classes from "@/system/system.module.css";

type Props = {
  heading: string;
  children: ReactNode;
};

/**
 * The comments panel. Comments are the only social surface in the product, so
 * they get a print ground of their own and real room to read in.
 */
export function Talk({ heading, children }: Readonly<Props>): ReactNode {
  return (
    <section className={classes.talk} aria-label="Comments">
      <LabelText component="h2">{heading}</LabelText>
      {children}
    </section>
  );
}
