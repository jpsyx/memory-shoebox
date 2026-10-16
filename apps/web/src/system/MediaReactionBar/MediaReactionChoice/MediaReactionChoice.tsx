import type { ReactNode } from "react";
import type { Choice } from "../MediaReactionBar.types";
import classes from "./MediaReactionChoice.module.css";

type Props<Value extends string> = {
  choice: Choice<Value>;
  chosen: Value | null | undefined;
  disabled: boolean | undefined;
  onReact: (value: Value) => void;
};

/** Renders the same reaction control inline or inside the overflow popover. */
export function MediaReactionChoice<Value extends string>({
  choice,
  chosen,
  disabled,
  onReact,
}: Readonly<Props<Value>>): ReactNode {
  return (
    <button
      className={classes.mediaReactionChoice}
      type="button"
      aria-label={`React: ${choice.label}`}
      title={choice.title ?? choice.label}
      aria-pressed={chosen === undefined ? undefined : chosen === choice.value}
      disabled={disabled}
      onClick={() => {
        onReact(choice.value);
      }}
    >
      <span className={classes.mediaReactionChoiceEmoji} aria-hidden="true">
        {choice.emoji}
      </span>
    </button>
  );
}
