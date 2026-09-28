import {
  IconHeart,
  IconHeartHandshake,
  IconMoodCrazyHappy,
  IconMoodSad,
  IconMoodSuprised,
  IconThumbUp,
  type Icon,
} from "@tabler/icons-react";
import type { ReactionKind } from "@memory-shoebox/shared";

type ReactionEntry = {
  readonly kind: ReactionKind;
  readonly word: string;
  readonly icon: Icon;
};

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

/** The row's entry for a kind, falling back to Like for one not listed. */
export function getReactionEntryFromKind(kind: ReactionKind): ReactionEntry {
  return (
    REACTIONS.find((candidate) => {
      return candidate.kind === kind;
    }) ?? { kind: "like", word: "Like", icon: IconThumbUp }
  );
}
