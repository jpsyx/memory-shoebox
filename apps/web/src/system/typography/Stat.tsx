import type { ReactNode } from "react";
import classes from "@/system/system.module.css";

type Props = {
  figure: ReactNode;
  label: string;
};

/** A figure over a label: the shape every count in the system takes. */
export function Stat({ figure, label }: Readonly<Props>): ReactNode {
  return (
    <div className={classes.stat}>
      <span className={classes.statFigure}>{figure}</span>
      <span className={classes.statLabel}>{label}</span>
    </div>
  );
}
