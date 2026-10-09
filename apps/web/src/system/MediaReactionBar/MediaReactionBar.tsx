import { Popover } from "@mantine/core";
import { IconMessageCircle, IconMoodSmile } from "@tabler/icons-react";
import type { ReactNode } from "react";
import classes from "./MediaReactionBar.module.css";

type Choice<Value extends string> = {
  value: Value;
  emoji: string;
  label: string;
  title?: string;
};
type Props<Value extends string> = {
  choices: ReadonlyArray<Choice<Value>>;
  label: string;
  commentLabel: string;
  chosen?: Value | null;
  disabled?: boolean;
  hint?: ReactNode;
  /** A reaction summary alongside the controls, without an extra row. */
  summary?: ReactNode;
  children?: ReactNode;
  onReact: (value: Value) => void;
  onComment: () => void;
};

/** Shared emoji choices and Comment action for photos and timed video reactions. */
export function MediaReactionBar<Value extends string>({
  choices,
  label,
  commentLabel,
  chosen,
  disabled,
  hint,
  summary,
  children,
  onReact,
  onComment,
}: Readonly<Props<Value>>): ReactNode {
  const renderChoice = (choice: Choice<Value>) => {
    return (
      <button
        className={classes.emojiButton}
        key={choice.value}
        type="button"
        aria-label={`React: ${choice.label}`}
        title={choice.title ?? choice.label}
        aria-pressed={
          chosen === undefined ? undefined : chosen === choice.value
        }
        disabled={disabled}
        onClick={() => {
          onReact(choice.value);
        }}
      >
        {choice.emoji}
      </button>
    );
  };
  return (
    <div className={classes.reactionArea}>
      <div className={classes.reactionControls}>
        <div className={classes.reactionBar} role="group" aria-label={label}>
          {choices.slice(0, 6).map(renderChoice)}
          {choices.length <= 6 ? null : (
            <Popover position="top" withinPortal>
              <Popover.Target>
                <button
                  className={classes.moreButton}
                  type="button"
                  aria-label="More reactions"
                >
                  <IconMoodSmile size={22} />
                </button>
              </Popover.Target>
              <Popover.Dropdown className={classes.reactionDropdown}>
                {choices.slice(6).map(renderChoice)}
              </Popover.Dropdown>
            </Popover>
          )}
          <button
            className={classes.commentAction}
            type="button"
            aria-label={commentLabel}
            onClick={onComment}
          >
            <IconMessageCircle size={19} />
            <span>Comment</span>
          </button>
        </div>
        {summary}
      </div>
      {hint === undefined ? null : (
        <p className={classes.reactionHint}>{hint}</p>
      )}
      {children}
    </div>
  );
}
