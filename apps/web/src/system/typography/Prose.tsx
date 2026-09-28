import { clsx } from "clsx";
import type { ReactNode } from "react";
import type { TextBlock } from "@/system/typography/TextBlock.types";
import classes from "@/system/system.module.css";

type Props = TextBlock & { onPanel?: boolean };

/**
 * Prose, capped at 62ch. `onPanel` swaps the quiet ink for the one mixed into
 * the enamel rather than into a white print.
 */
export function Prose({
  children,
  className,
  onPanel = false,
}: Readonly<Props>): ReactNode {
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
