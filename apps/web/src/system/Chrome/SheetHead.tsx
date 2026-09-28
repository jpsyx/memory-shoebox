import type { ReactNode } from "react";
import classes from "@/system/system.module.css";

type Props = {
  title: ReactNode;
  children?: ReactNode;
};

/** A sheet's heading row: a title, an optional count, and room on the right. */
export function SheetHead({ title, children }: Readonly<Props>): ReactNode {
  return (
    <div className={classes.sheetHead}>
      <h2 className={classes.headline}>{title}</h2>
      {children === undefined ? null : (
        <div className={classes.sheetHeadSpacer}>{children}</div>
      )}
    </div>
  );
}
