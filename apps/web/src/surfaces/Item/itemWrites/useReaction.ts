import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import type {
  ItemDetail,
  MemberRef,
  ReactionKind,
  ReactionSummary,
} from "@memory-shoebox/shared";
import { itemQueryOptions } from "@/api/items/items";
import { makeSummaryFromChoice } from "@/system/Reactions/makeSummaryFromChoice/makeSummaryFromChoice";
import { REACTION_FAILURE } from "@/surfaces/Item/itemCopyHelpers/itemCopyHelpers";
import {
  makeWriteScopeFromItemId,
  refetchItemWhenRefused,
} from "@/surfaces/Item/itemWrites/itemWriteHelpers/itemWriteHelpers";
import { useUpdateCachedItem } from "@/surfaces/Item/itemWrites/useUpdateCachedItem";

/** What a reaction row needs. */
export type ReactionWrite = {
  react: (kind: ReactionKind | null) => void;
  error: string | undefined;
};

/** Where one reaction summary lives inside the item, and how to set it. */
export type ReactionTarget = {
  itemId: string;
  /** Carries every id the summary hangs off (`itemWriteHelpers.ts`). */
  mutationKey: string[];
  viewer: MemberRef;
  getSummary: (detail: ItemDetail) => ReactionSummary | undefined;
  makeDetail: (
    options: Readonly<{ detail: ItemDetail; reactions: ReactionSummary }>,
  ) => ItemDetail;
  mutationFn: (
    kind: ReactionKind | null,
  ) => Promise<ReactionSummary | undefined>;
};

/**
 * Reads the one summary a target names in the cached item, and rewrites it.
 *
 * `writeOwnChoice` moves only the viewer's own row, in whatever the cache
 * holds at that moment, so every other member's row stays as the latest
 * answer left it.
 */
function useCachedSummary(options: Readonly<ReactionTarget>): {
  readSummary: () => ReactionSummary | undefined;
  writeSummary: (reactions: ReactionSummary) => void;
  writeOwnChoice: (chosen: ReactionKind | null) => void;
} {
  const queryClient = useQueryClient();
  const updateCachedItem = useUpdateCachedItem(options.itemId);
  const readSummary = () => {
    const detail = queryClient.getQueryData(
      itemQueryOptions(options.itemId).queryKey,
    );
    return detail === undefined ? undefined : options.getSummary(detail);
  };
  const writeSummary = (reactions: ReactionSummary) => {
    updateCachedItem((detail) => {
      return options.makeDetail({ detail, reactions });
    });
  };
  return {
    readSummary,
    writeSummary,
    writeOwnChoice: (chosen) => {
      const current = readSummary();
      if (current !== undefined) {
        writeSummary(
          makeSummaryFromChoice({
            reactions: current,
            chosen,
            viewer: options.viewer,
          }),
        );
      }
    },
  };
}

/**
 * One reaction, written into the cache before the request goes, and put back
 * if it fails.
 *
 * The cache, rather than the control, carries the tap, because the cache is
 * what a failure can roll back: `Reactions` follows `myKind` whenever it
 * moves.
 *
 * **Only the latest tap writes its outcome**, onto whatever the cache holds
 * by then: the answer itself, or for a `204` or a failure, the viewer's own
 * row moved (`items.md` § Reactions).
 */
export function useReaction(options: Readonly<ReactionTarget>): ReactionWrite {
  const queryClient = useQueryClient();
  const { readSummary, writeSummary, writeOwnChoice } =
    useCachedSummary(options);
  // A counter says which tap is the latest, not a comparison of the cache
  // with the tap. The scope delays a tap's request but not its `onMutate`,
  // so an earlier save's answer can land on top of the optimistic summary,
  // and a comparison would then take the tap's own answer for a stale one
  // and drop it. Outcomes never go onto a snapshot from before the tap.
  const latestTapRef = useRef(0);
  const mutation = useMutation({
    mutationKey: options.mutationKey,
    scope: makeWriteScopeFromItemId(options.itemId),
    mutationFn: options.mutationFn,
    onMutate: (kind) => {
      latestTapRef.current += 1;
      const previousKind = readSummary()?.myKind ?? null;
      writeOwnChoice(kind);
      return { tap: latestTapRef.current, previousKind };
    },
    onError: (error, _kind, context) => {
      if (context !== undefined && context.tap === latestTapRef.current) {
        writeOwnChoice(context.previousKind);
      }
      refetchItemWhenRefused({ queryClient, itemId: options.itemId, error });
    },
    onSuccess: (summary, _kind, context) => {
      if (context.tap !== latestTapRef.current) {
        return;
      }
      // A `204` answers with nothing, so our own row comes off what is there.
      if (summary === undefined) {
        writeOwnChoice(null);
      } else {
        writeSummary(summary);
      }
    },
  });
  return {
    react: (kind) => {
      mutation.mutate(kind);
    },
    error: mutation.error === null ? undefined : REACTION_FAILURE,
  };
}
