import { clsx } from "clsx";
import type { ReactNode } from "react";
import classes from "@/system/system.module.css";

type Props = {
  children: ReactNode;
  className?: string;
};

/**
 * The card. One of only two things in the system that may be called one: the
 * sign-in dialog, and the index list of these mockups.
 */
export function Card({ children, className }: Readonly<Props>): ReactNode {
  return <div className={clsx(classes.card, className)}>{children}</div>;
}
