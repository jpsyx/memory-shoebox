import { useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  PutVideoReactionRequest,
  VideoReaction,
} from "@memory-shoebox/shared";
import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import {
  getVideoReactions,
  videoReactionsQueryOptions,
} from "@/api/videoReactions/videoReactions";
import { refetchItemWhenRefused } from "@/surfaces/Item/itemWrites/itemWriteHelpers/itemWriteHelpers";
import { useVideoReactionWrite } from "./useVideoReactionWrite";

/** Controls and server-confirmed collection shared by the video surface. */
export type VideoReactionsState = {
  reactions: VideoReaction[];
  isLoading: boolean;
  readError: Error | undefined;
  refresh: () => void;
  writeError: Error | undefined;
  isSending: boolean;
  lastAdded: VideoReaction | undefined;
  react: (body: PutVideoReactionRequest) => void;
  remove: (reaction: VideoReaction) => void;
  retry: () => void;
  dismiss: () => void;
};

/** Reads and writes moment reactions with independent, item-scoped caching. */
export function useVideoReactions(
  options: Readonly<{ itemId: string; enabled: boolean }>,
): VideoReactionsState {
  const { itemId, enabled } = options;
  const queryClient = useQueryClient();
  const query = useQuery({
    ...videoReactionsQueryOptions(itemId),
    enabled,
    queryFn: async ({ signal }) => {
      try {
        return await getVideoReactions({ itemId, signal });
      } catch (error) {
        if (
          error instanceof ApiRequestError &&
          [401, 403, 404].includes(error.status)
        ) {
          queryClient.setQueryData(
            videoReactionsQueryOptions(itemId).queryKey,
            [],
          );
          refetchItemWhenRefused({ queryClient, itemId, error });
        }
        throw error;
      }
    },
  });
  const { mutation, send } = useVideoReactionWrite(itemId);
  return {
    reactions: query.isError ? [] : (query.data ?? []),
    isLoading: query.isLoading,
    readError: query.error ?? undefined,
    refresh: () => {
      void query.refetch();
    },
    writeError: mutation.error ?? undefined,
    isSending: mutation.isPending,
    lastAdded: mutation.isSuccess ? mutation.data : undefined,
    react: (body: PutVideoReactionRequest) => {
      send({ kind: "put", itemId, reactionId: crypto.randomUUID(), body });
    },
    remove: (reaction: VideoReaction) => {
      if (reaction.canDelete) {
        send({ kind: "delete", itemId, reactionId: reaction.reactionId });
      }
    },
    retry: () => {
      if (mutation.variables !== undefined) {
        send(mutation.variables);
      }
    },
    dismiss: mutation.reset,
  };
}
