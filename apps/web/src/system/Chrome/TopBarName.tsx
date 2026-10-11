import { Link, type LinkProps } from "@tanstack/react-router";
import type { ReactNode } from "react";
import classes from "@/system/system.module.css";

type Props = {
  title: string | undefined;
  detail: string | undefined;
  to: LinkProps["to"] | undefined;
};

/** The bar's name, optionally linking to a destination with no search filters. */
export function TopBarName({ title, detail, to }: Readonly<Props>): ReactNode {
  const content = (
    <>
      <span className={classes.barNameTitle}>{title}</span>
      {detail === undefined ? null : (
        <span className={classes.barNameSub}>{detail}</span>
      )}
    </>
  );
  return to === undefined ? (
    <p className={classes.barName}>{content}</p>
  ) : (
    <Link to={to} search={{}} className={classes.barName}>
      {content}
    </Link>
  );
}
