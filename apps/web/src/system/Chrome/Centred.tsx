import type { ReactNode } from "react";
import classes from "@/system/system.module.css";

type Props = {
  children: ReactNode;
};

/** A surface with nothing but one thing in the middle of the panel. */
export function Centred({ children }: Readonly<Props>): ReactNode {
  return <main className={classes.centred}>{children}</main>;
}
