import {
  mediaPositionRequestSchema,
  mediaPositionResponseSchema,
  type MediaPositionRequest,
  type MediaPositionResponse,
} from "@memory-shoebox/shared";
import { queryOptions } from "@tanstack/react-query";
import { apiFetch, jsonInit } from "@/api/clientHelpers/clientHelpers";

/** Reads a selection counter without opening or marking an item seen. */
export async function fetchMediaPosition({
  request,
  signal,
}: Readonly<{
  request: Readonly<MediaPositionRequest>;
  signal: AbortSignal;
}>): Promise<MediaPositionResponse> {
  signal.throwIfAborted();
  const response = await apiFetch({
    path: "/media/position",
    schema: mediaPositionResponseSchema,
    init: {
      ...jsonInit({
        method: "POST",
        body: mediaPositionRequestSchema.parse(request),
      }),
      signal,
    },
  });
  signal.throwIfAborted();
  return response;
}

/** Member-scoped metadata; callers enable only after current-detail authority. */
export function mediaPositionQueryOptions({
  memberId,
  request,
}: Readonly<{
  memberId: string;
  request: MediaPositionRequest;
}>): ReturnType<
  typeof queryOptions<
    MediaPositionResponse,
    Error,
    MediaPositionResponse,
    ["timeline", string, "media-position", MediaPositionRequest]
  >
> {
  return queryOptions({
    queryKey: ["timeline", memberId, "media-position", request],
    queryFn: ({ signal }) => {
      return fetchMediaPosition({ request, signal });
    },
    staleTime: 30_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
}
