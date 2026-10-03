import { IconThumbUp } from "@tabler/icons-react";
import type { ReactNode } from "react";
import type { ReactionKind } from "@memory-shoebox/shared";
import { ICON_PROPS_SMALL } from "@/system/icons";
import { getReactionEntryFromKind } from "@/system/Reactions/reactionEntries";

type Props = {
  /** The reaction the row shows as yours, or null for none. */
  chosen: ReactionKind | null;
};

/** What the React action says: "React", or the reaction you have left. */
export function ReactionActionLabel({ chosen }: Readonly<Props>): ReactNode {
  const chosenReaction =
    chosen === null ? undefined : getReactionEntryFromKind(chosen);
  return chosenReaction === undefined ? (
    <>
      <IconThumbUp {...ICON_PROPS_SMALL} />
      React
    </>
  ) : (
    <>
      <chosenReaction.icon {...ICON_PROPS_SMALL} />
      {chosenReaction.word}
    </>
  );
}
