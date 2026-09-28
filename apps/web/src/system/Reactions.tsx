import { Popover } from "@mantine/core";
import {
  IconHeart,
  IconHeartHandshake,
  IconMoodCrazyHappy,
  IconMoodSad,
  IconMoodSuprised,
  IconThumbUp,
  type Icon,
} from "@tabler/icons-react";
import { clsx } from "clsx";
import { useState, type ReactNode } from "react";
import type {
  MemberRef,
  ReactionKind,
  ReactionSummary,
} from "@memory-shoebox/shared";
import { ICON_PROPS_SMALL } from "@/system/icons";
import { Prose } from "@/system/typography";
import classes from "@/system/system.module.css";

/**
 * The six ways of saying something without writing it.
 *
 * Every one carries its word. Facebook and LinkedIn lean on a hover tooltip
 * to say what a face means, and this world refuses any interaction that needs
 * hover or a gesture somebody has to discover, so the word is simply printed
 * beside the mark.
 *
 * They are stroked and monochrome rather than the coloured emoji everyone
 * else uses. Colour in this system means one thing, and a row of six bright
 * badges would say "you have not seen this yet" six times over.
 */
export const REACTIONS: readonly ReactionEntry[] = [
  { kind: "like", word: "Like", icon: IconThumbUp },
  { kind: "love", word: "Love", icon: IconHeart },
  { kind: "care", word: "Care", icon: IconHeartHandshake },
  { kind: "haha", word: "Haha", icon: IconMoodCrazyHappy },
  { kind: "wow", word: "Wow", icon: IconMoodSuprised },
  { kind: "sad", word: "Sad", icon: IconMoodSad },
];

type ReactionEntry = {
  readonly kind: ReactionKind;
  readonly word: string;
  readonly icon: Icon;
};

const LIKE: ReactionEntry = {
  kind: "like",
  word: "Like",
  icon: IconThumbUp,
};

function _reactionOf(kind: ReactionKind): ReactionEntry {
  return (
    REACTIONS.find((candidate) => {
      return candidate.kind === kind;
    }) ?? LIKE
  );
}

type Props = {
  readonly reactions: ReactionSummary;
  /**
   * Who is looking. Required, because the row answers a tap before the server
   * has heard about it, and a row that moves your count without moving your
   * name leaves you listed under the reaction you just left.
   */
  readonly viewer: MemberRef;
  /** A line under the row saying where a reaction goes, on the media only. */
  readonly goesTo?: string;
  /** Set where the row sits on the enamel rather than inside a print. */
  readonly onPanel?: boolean;
  /** Null takes your own reaction off. Step 5a wires the mutation. */
  readonly onReact?: (kind: ReactionKind | null) => void;
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
}: Props): ReactNode {
  const [chosen, setChosen] = useState<ReactionKind | null>(reactions.myKind);
  const [isPicking, setIsPicking] = useState(false);
  const [isShowingWho, setIsShowingWho] = useState(false);

  /*
   * The server's rows with your own choice moved to wherever it is now, name
   * and count together. The picker has to answer the tap before the mutation
   * step 5a wires has been anywhere near a server, and moving only the count
   * would leave you listed under the reaction you just moved away from, which
   * reads as a bug rather than as latency.
   */
  const adjusted = reactions.kinds.map((entry) => {
    const wasMine = reactions.myKind === entry.kind;
    const isMine = chosen === entry.kind;
    if (wasMine === isMine) {
      return entry;
    }
    return {
      ...entry,
      count: entry.count + (isMine ? 1 : -1),
      members: isMine
        ? [...entry.members, viewer]
        : entry.members.filter((member) => {
            return member.memberId !== viewer.memberId;
          }),
    };
  });
  const present = [
    ...adjusted,
    ...(chosen !== null &&
    !adjusted.some((entry) => {
      return entry.kind === chosen;
    })
      ? [{ kind: chosen, count: 1, members: [viewer] }]
      : []),
  ].filter((entry) => {
    return entry.count > 0;
  });
  const total = present.reduce((sum, entry) => {
    return sum + entry.count;
  }, 0);
  const chosenReaction = chosen === null ? undefined : _reactionOf(chosen);

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
                      const next =
                        chosen === reaction.kind ? null : reaction.kind;
                      setChosen(next);
                      setIsPicking(false);
                      onReact?.(next);
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
                    const reaction = _reactionOf(entry.kind);
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
                  const reaction = _reactionOf(entry.kind);
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
