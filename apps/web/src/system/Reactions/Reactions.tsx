import { Popover } from "@mantine/core";
import { IconThumbUp } from "@tabler/icons-react";
import { clsx } from "clsx";
import { useState, type ReactNode } from "react";
import type {
  MemberRef,
  ReactionKind,
  ReactionSummary,
} from "@memory-shoebox/shared";
import { ICON_PROPS_SMALL } from "@/system/icons";
import { makePresentReactionsFromSummary } from "@/system/Reactions/presentReactions";
import {
  REACTIONS,
  getReactionEntryFromKind,
} from "@/system/Reactions/reactionEntries";
import { Prose } from "@/system/typography/Prose";
import classes from "@/system/system.module.css";

type Props = {
  reactions: ReactionSummary;
  /**
   * Who is looking. Required, because the row answers a tap before the server
   * has heard about it, and a row that moves your count without moving your
   * name leaves you listed under the reaction you just left.
   */
  viewer: MemberRef;
  /** A line under the row saying where a reaction goes, on the media only. */
  goesTo?: string;
  /** Set where the row sits on the enamel rather than inside a print. */
  onPanel?: boolean;
  /**
   * Null takes your own reaction off. The mutation that sends the change to
   * the server is wired in separately.
   */
  onReact?: (kind: ReactionKind | null) => void;
};

/**
 * Reactions on a photograph, a video or a comment.
 *
 * The same component in both places, because they are the same act. For most
 * of the people in a family archive a reaction is the whole of what they will
 * ever leave: it is one tap, and writing a sentence is not, and a grandmother
 * who taps a heart on every photograph of her grandson has said plenty.
 */
export function Reactions({
  reactions,
  viewer,
  goesTo,
  onPanel = false,
  onReact,
}: Readonly<Props>): ReactNode {
  const [chosen, setChosen] = useState<ReactionKind | null>(reactions.myKind);
  const [isPicking, setIsPicking] = useState(false);
  const [isShowingWho, setIsShowingWho] = useState(false);

  const { entries: present, total } = makePresentReactionsFromSummary({
    reactions,
    chosen,
    viewer,
  });
  const chosenReaction =
    chosen === null ? undefined : getReactionEntryFromKind(chosen);

  return (
    <div>
      <div className={classes.reactionRow}>
        <Popover
          opened={isPicking}
          onChange={setIsPicking}
          position="top-start"
          withinPortal
        >
          <Popover.Target>
            <button
              type="button"
              className={clsx(
                classes.reactionButton,
                onPanel && classes.reactionOnPanel,
                chosen !== null &&
                  (onPanel
                    ? classes.reactionOnPanelMine
                    : classes.reactionButtonMine),
              )}
              aria-expanded={isPicking}
              onClick={() => {
                return setIsPicking((open) => {
                  return !open;
                });
              }}
            >
              {chosenReaction === undefined ? (
                <>
                  <IconThumbUp {...ICON_PROPS_SMALL} />
                  React
                </>
              ) : (
                <>
                  <chosenReaction.icon {...ICON_PROPS_SMALL} />
                  {chosenReaction.word}
                </>
              )}
            </button>
          </Popover.Target>
          <Popover.Dropdown>
            <div className={classes.reactionPicker}>
              {REACTIONS.map((reaction) => {
                return (
                  <button
                    key={reaction.kind}
                    type="button"
                    className={clsx(
                      classes.reactionChoice,
                      chosen === reaction.kind && classes.reactionChoiceMine,
                    )}
                    aria-pressed={chosen === reaction.kind}
                    onClick={() => {
                      const nextChosen =
                        chosen === reaction.kind ? null : reaction.kind;
                      setChosen(nextChosen);
                      setIsPicking(false);
                      onReact?.(nextChosen);
                    }}
                  >
                    <reaction.icon {...ICON_PROPS_SMALL} />
                    {reaction.word}
                  </button>
                );
              })}
            </div>
            <Prose className={classes.reactionPicker}>
              Pressing the one you have already left takes it off again.
            </Prose>
          </Popover.Dropdown>
        </Popover>

        {total === 0 ? null : (
          <Popover
            opened={isShowingWho}
            onChange={setIsShowingWho}
            position="top-start"
            withinPortal
          >
            <Popover.Target>
              <button
                type="button"
                className={classes.reactionSummary}
                onClick={() => {
                  return setIsShowingWho((open) => {
                    return !open;
                  });
                }}
              >
                <span className={classes.reactionSummaryIcons}>
                  {present.map((entry) => {
                    const reaction = getReactionEntryFromKind(entry.kind);
                    return (
                      <reaction.icon key={entry.kind} {...ICON_PROPS_SMALL} />
                    );
                  })}
                </span>
                {total}
              </button>
            </Popover.Target>
            <Popover.Dropdown>
              <div className={classes.reactionWho}>
                {present.map((entry) => {
                  const reaction = getReactionEntryFromKind(entry.kind);
                  return (
                    <div key={entry.kind} className={classes.reactionWhoRow}>
                      <span className={classes.reactionWhoKind}>
                        <reaction.icon {...ICON_PROPS_SMALL} />
                        {reaction.word}
                      </span>
                      <span>
                        {entry.members
                          .map((member) => {
                            return member.displayName;
                          })
                          .join(", ")}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Popover.Dropdown>
          </Popover>
        )}
      </div>
      {goesTo === undefined ? null : <Prose onPanel={onPanel}>{goesTo}</Prose>}
    </div>
  );
}
