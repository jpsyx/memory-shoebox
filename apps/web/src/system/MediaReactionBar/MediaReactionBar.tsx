import { Popover } from "@mantine/core";
import { IconMessageCircle, IconMoodSmile } from "@tabler/icons-react";
import type { ReactNode } from "react";
import classes from "./MediaReactionBar.module.css";
import type { Choice } from "./MediaReactionBar.types";
import { MediaReactionChoice } from "./MediaReactionChoice/MediaReactionChoice";

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

/**
 * Shared emoji choices and Comment action for photos and timed video reactions.
 */
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
  return (
    <div className={classes.mediaReactionBarArea}>
      <div className={classes.mediaReactionBarControls}>
        <div
          className={classes.mediaReactionBar}
          role="group"
          aria-label={label}
        >
          {choices.slice(0, 6).map((choice) => {
            return (
              <MediaReactionChoice
                key={choice.value}
                choice={choice}
                chosen={chosen}
                disabled={disabled}
                onReact={onReact}
              />
            );
          })}
          {choices.length <= 6 ? null : (
            <Popover position="top" withinPortal>
              <Popover.Target>
                <button
                  className={classes.mediaReactionBarMoreButton}
                  type="button"
                  aria-label="More reactions"
                >
                  <IconMoodSmile size={22} />
                </button>
              </Popover.Target>
              <Popover.Dropdown className={classes.mediaReactionBarDropdown}>
                {choices.slice(6).map((choice) => {
                  return (
                    <MediaReactionChoice
                      key={choice.value}
                      choice={choice}
                      chosen={chosen}
                      disabled={disabled}
                      onReact={onReact}
                    />
                  );
                })}
              </Popover.Dropdown>
            </Popover>
          )}
          <button
            className={classes.mediaReactionBarCommentAction}
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
        <p className={classes.mediaReactionBarHint}>{hint}</p>
      )}
      {children}
    </div>
  );
}
