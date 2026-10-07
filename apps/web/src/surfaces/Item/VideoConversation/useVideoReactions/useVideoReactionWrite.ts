import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import { useRef } from "react";
import type {
  PutVideoReactionRequest,
  VideoReaction,
} from "@memory-shoebox/shared";
import {
  deleteVideoReaction,
  putVideoReaction,
  videoReactionsQueryOptions,
} from "@/api/videoReactions/videoReactions";
import { itemQueryOptions } from "@/api/items/items";
import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import {
  makeWriteScopeFromItemId,
  refetchItemWhenRefused,
} from "@/surfaces/Item/itemWrites/itemWriteHelpers/itemWriteHelpers";

type Write = { itemId: string; reactionId: string } & (
  | { kind: "put"; body: PutVideoReactionRequest }
  | { kind: "delete" }
);

/** Applies only server-confirmed events, never recreating a cleared cache. */
function _getSavedReactions(
  options: Readonly<{
    reactions: VideoReaction[];
    saved: VideoReaction | undefined;
    write: Write;
  }>,
): VideoReaction[] {
  const remaining = options.reactions.filter((event) => {
    return event.reactionId !== options.write.reactionId;
  });
  return options.saved === undefined
    ? remaining
    : [options.saved, ...remaining]
        .sort((left, right) => {
          return (
            right.createdAt.localeCompare(left.createdAt) ||
            right.reactionId.localeCompare(left.reactionId)
          );
        })
        .slice(0, 50);
}

/** A scoped reaction write retains its exact payload for an explicit retry. */
export function useVideoReactionWrite(itemId: string): {
  mutation: UseMutationResult<VideoReaction | undefined, Error, Write>;
  send: (write: Write) => void;
} {
  const queryClient = useQueryClient();
  const inFlight = useRef(false);
  const mutation = useMutation({
    mutationKey: ["video-reactions", itemId, "write"],
    scope: makeWriteScopeFromItemId(itemId),
    onMutate: async (write) => {
      await queryClient.cancelQueries({
        queryKey: videoReactionsQueryOptions(write.itemId).queryKey,
      });
    },
    mutationFn: async (write: Write): Promise<VideoReaction | undefined> => {
      if (write.kind === "put") {
        return putVideoReaction(write);
      }
      await deleteVideoReaction(write);
      return undefined;
    },
    onSuccess: (saved, write) => {
      if (
        queryClient.getQueryData(itemQueryOptions(write.itemId).queryKey) ===
        undefined
      ) {
        return;
      }
      queryClient.setQueryData(
        videoReactionsQueryOptions(write.itemId).queryKey,
        (reactions) => {
          return reactions === undefined
            ? reactions
            : _getSavedReactions({ reactions, saved, write });
        },
      );
    },
    onError: (error, write) => {
      if (
        error instanceof ApiRequestError &&
        [401, 403, 404].includes(error.status)
      ) {
        void queryClient.cancelQueries({
          queryKey: videoReactionsQueryOptions(write.itemId).queryKey,
        });
        queryClient.setQueryData(
          videoReactionsQueryOptions(write.itemId).queryKey,
          [],
        );
      }
      if (error instanceof ApiRequestError && error.status === 403) {
        void queryClient.refetchQueries({
          queryKey: videoReactionsQueryOptions(write.itemId).queryKey,
          exact: true,
          type: "active",
        });
      }
      refetchItemWhenRefused({ queryClient, itemId: write.itemId, error });
    },
    onSettled: () => {
      inFlight.current = false;
    },
  });
  const send = (write: Write) => {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    mutation.mutate(write);
  };
  return { mutation, send };
}
