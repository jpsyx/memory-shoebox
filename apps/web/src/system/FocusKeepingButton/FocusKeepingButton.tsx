import { Button, type ButtonProps } from "@mantine/core";
import type { ReactNode } from "react";

type Props = ButtonProps & {
  /**
   * Busy, or with nothing to do: drawn and announced as disabled, and deaf to
   * a press, while it keeps focus.
   */
  isUnavailable: boolean;
  type?: "button" | "submit";
  onClick?: () => void;
};

/**
 * A Mantine `Button` that keeps focus while it cannot be pressed.
 *
 * A focused button that becomes `disabled` loses focus, and the browser drops
 * it on the page behind, where a keyboard user's place is gone. Send, a Save
 * and a dialog's choices are all pressed and then become unavailable in the
 * same moment, so they say so with `aria-disabled` and Mantine's
 * `data-disabled` look instead, and ignore the press themselves. A submit
 * button's press is stopped too, or its form would still be sent.
 *
 * `disabled` itself still passes through, for a state focus cannot be in as
 * it starts, such as Save while "Only" names nobody.
 */
export function FocusKeepingButton({
  isUnavailable,
  onClick,
  type = "button",
  ...buttonProps
}: Readonly<Props>): ReactNode {
  return (
    <Button
      {...buttonProps}
      type={type}
      aria-disabled={isUnavailable ? "true" : undefined}
      data-disabled={isUnavailable || undefined}
      onClick={(event) => {
        if (isUnavailable) {
          event.preventDefault();
          return;
        }
        onClick?.();
      }}
    />
  );
}
