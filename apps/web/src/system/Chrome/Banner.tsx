import { clsx } from "clsx";
import type { ReactNode } from "react";
import classes from "@/system/system.module.css";

type Props = {
  icon?: ReactNode;
  children: ReactNode;
  onPanel?: boolean;
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
}: Readonly<Props>): ReactNode {
  return (
    <div className={clsx(classes.banner, onPanel && classes.bannerOnPanel)}>
      {icon === undefined ? null : (
        <span className={classes.bannerIcon}>{icon}</span>
      )}
      <div>{children}</div>
    </div>
  );
}
