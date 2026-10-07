import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import {
  videoReactionSchema,
  videoReactionsSchema,
  type PutVideoReactionRequest,
  type VideoReaction,
} from "@memory-shoebox/shared";
import { apiFetch, jsonInit } from "@/api/clientHelpers/clientHelpers";
import { makeItemPathFromItemId } from "@/api/items/items";

/** Fetches visible moment reactions, cancelling reads when their item leaves. */
export function getVideoReactions(
  options: Readonly<{ itemId: string; signal?: AbortSignal }>,
): Promise<VideoReaction[]> {
  return apiFetch({
    path: `${makeItemPathFromItemId(options.itemId)}/video-reactions`,
    schema: videoReactionsSchema,
    init: { signal: options.signal },
  });
}

/** The independently cached, visible item's newest fifty video reactions. */
export function videoReactionsQueryOptions(
  itemId: string,
): ReturnType<
  typeof queryOptions<VideoReaction[], Error, VideoReaction[], string[]>
> {
  return queryOptions({
    queryKey: ["video-reactions", itemId],
    queryFn: ({ signal }): Promise<VideoReaction[]> => {
      return getVideoReactions({ itemId, signal });
    },
    retry: false,
  });
}

/** Persists one gesture under its stable, retryable client identifier. */
export function putVideoReaction(
  options: Readonly<{
    itemId: string;
    reactionId: string;
    body: PutVideoReactionRequest;
  }>,
): Promise<VideoReaction> {
  return apiFetch({
    path: `${makeItemPathFromItemId(options.itemId)}/video-reactions/${encodeURIComponent(options.reactionId)}`,
    schema: videoReactionSchema,
    init: jsonInit({ method: "PUT", body: options.body }),
  });
}

/** Removes an event when its server-provided permission allows it. */
export function deleteVideoReaction(
  options: Readonly<{ itemId: string; reactionId: string }>,
): Promise<void> {
  return apiFetch({
    path: `${makeItemPathFromItemId(options.itemId)}/video-reactions/${encodeURIComponent(options.reactionId)}`,
    schema: z.void(),
    init: { method: "DELETE" },
  });
}
