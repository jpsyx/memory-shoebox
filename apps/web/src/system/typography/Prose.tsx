import { clsx } from "clsx";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import type { TextBlock } from "@/system/typography/TextBlock.types";
import classes from "@/system/system.module.css";

/**
 * A paragraph's own props as well as the system's.
 *
 * Widened from `TextBlock` so a paragraph that is announced can say so:
 * surface 1's rate limit sits outside every field's `aria-describedby` and
 * needs `role="alert"`. Anything else a `<p>` legitimately takes comes with
 * it rather than being added one prop at a time.
 */
type Props = ComponentPropsWithoutRef<"p"> & TextBlock & { onPanel?: boolean };

/**
 * Prose, capped at 62ch. `onPanel` swaps the quiet ink for the one mixed into
 * the enamel rather than into a white print.
 */
export function Prose({
  children,
  className,
  onPanel = false,
  ...paragraphProps
}: Readonly<Props>): ReactNode {
  return (
    <p
      {...paragraphProps}
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
