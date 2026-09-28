import type { ReactNode } from "react";
import classes from "@/system/system.module.css";

type Props = {
  children: ReactNode;
  wide?: boolean;
};

/** A reading-width page on the panel: 62rem. */
export function Page({ children, wide = false }: Readonly<Props>): ReactNode {
  return (
    <main className={wide ? classes.pageWide : classes.page}>{children}</main>
  );
}
