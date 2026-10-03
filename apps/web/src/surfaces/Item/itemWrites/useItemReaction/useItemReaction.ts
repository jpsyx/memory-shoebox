import type { MemberRef } from "@memory-shoebox/shared";
import { clearItemReaction, setItemReaction } from "@/api/reactions/reactions";
import { makeItemDetailFromItemReactions } from "@/surfaces/Item/itemWrites/itemCacheHelpers/itemCacheHelpers";
import {
  useReaction,
  type ReactionWrite,
} from "@/surfaces/Item/itemWrites/useReaction";

/** The reaction on the photograph or the video itself. */
export function useItemReaction(
  options: Readonly<{ itemId: string; viewer: MemberRef }>,
): ReactionWrite {
  const { itemId } = options;
  return useReaction({
    itemId,
    mutationKey: ["items", itemId, "reaction"],
    viewer: options.viewer,
    getSummary: (detail) => {
      return detail.reactions;
    },
    makeDetail: makeItemDetailFromItemReactions,
    mutationFn: (kind) => {
      return kind === null
        ? clearItemReaction(itemId).then(() => {
            return undefined;
          })
        : setItemReaction({ itemId, kind });
    },
  });
}
