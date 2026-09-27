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
import clsx from "clsx";
import { useState, type ReactNode } from "react";
import type { Reaction, ReactionKind } from "@/data/fixtures";
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

interface ReactionEntry {
  readonly kind: ReactionKind;
  readonly word: string;
  readonly icon: Icon;
}

const LIKE: ReactionEntry = {
  kind: "like",
  word: "Like",
  icon: IconThumbUp,
};

function reactionOf(kind: ReactionKind): ReactionEntry {
  return (
    REACTIONS.find((candidate) => {
      return candidate.kind === kind;
    }) ?? LIKE
  );
}

/** The kinds present, in the order the six are defined, commonest first. */
function kindsIn(reactions: readonly Reaction[]): readonly ReactionKind[] {
  const counts = new Map<ReactionKind, number>();
  for (const reaction of reactions) {
    counts.set(reaction.kind, (counts.get(reaction.kind) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => {
      return right[1] - left[1];
    })
    .map(([kind]) => {
      return kind;
    });
}

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
  mine,
  goesTo,
  onPanel = false,
}: {
  readonly reactions: readonly Reaction[];
  readonly mine?: ReactionKind;
  /** A line under the row saying where a reaction goes, on the media only. */
  readonly goesTo?: string;
  /** Set where the row sits on the enamel rather than inside a print. */
  readonly onPanel?: boolean;
}): ReactNode {
  const [chosen, setChosen] = useState<ReactionKind | undefined>(mine);
  const [isPicking, setIsPicking] = useState(false);
  const [isShowingWho, setIsShowingWho] = useState(false);

  const left = reactions.filter((reaction) => {
    return reaction.by !== "you";
  });
  const all: readonly Reaction[] =
    chosen === undefined ? left : [...left, { kind: chosen, by: "You" }];
  const kinds = kindsIn(all);
  const chosenReaction = chosen === undefined ? undefined : reactionOf(chosen);

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
                chosen !== undefined &&
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
                      setChosen(
                        chosen === reaction.kind ? undefined : reaction.kind,
                      );
                      setIsPicking(false);
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

        {all.length === 0 ? null : (
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
                  {kinds.map((kind) => {
                    const entry = reactionOf(kind);
                    return <entry.icon key={kind} {...ICON_PROPS_SMALL} />;
                  })}
                </span>
                {all.length}
              </button>
            </Popover.Target>
            <Popover.Dropdown>
              <div className={classes.reactionWho}>
                {kinds.map((kind) => {
                  const entry = reactionOf(kind);
                  const names = all
                    .filter((reaction) => {
                      return reaction.kind === kind;
                    })
                    .map((reaction) => {
                      return reaction.by;
                    });
                  return (
                    <div key={kind} className={classes.reactionWhoRow}>
                      <span className={classes.reactionWhoKind}>
                        <entry.icon {...ICON_PROPS_SMALL} />
                        {entry.word}
                      </span>
                      <span>{names.join(", ")}</span>
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
