import { clsx } from "clsx";
import type { ReactNode } from "react";
import classes from "@/system/system.module.css";

type Props = {
  children: ReactNode;
  wide?: boolean;
  className?: string;
  label?: string;
};

/**
 * A print-ground panel that holds a form, a table, or a list. Flat contact
 * shadow only: it is paper lying on the enamel, not a raised card.
 */
export function Sheet({
  children,
  wide = false,
  className,
  label,
}: Readonly<Props>): ReactNode {
  return (
    <section
      className={clsx(classes.sheet, wide && classes.sheetWide, className)}
      aria-label={label}
    >
      {children}
    </section>
  );
}
