import {
  mediaNeighborsRequestSchema,
  mediaNeighborsResponseSchema,
  mediaPreviewRequestSchema,
  mediaPreviewResponseSchema,
  type MediaNeighborsRequest,
  type MediaNeighborsResponse,
  type MediaPreview,
  type MediaPreviewRequest,
} from "@memory-shoebox/shared";
import { apiFetch, jsonInit } from "@/api/clientHelpers/clientHelpers";

/** Reads media without opening items or seeding the actual-detail cache. */
export async function fetchMediaPreviews(
  request: MediaPreviewRequest,
  signal: AbortSignal,
): Promise<MediaPreview[]> {
  const response = await apiFetch({
    path: "/media/preview",
    schema: mediaPreviewResponseSchema,
    init: {
      ...jsonInit({
        method: "POST",
        body: mediaPreviewRequestSchema.parse(request),
      }),
      signal,
    },
  });
  return response.items;
}

/** Reads exact filtered neighbors without fetching days or fanning bursts. */
export async function fetchMediaNeighbors(
  request: MediaNeighborsRequest,
  signal: AbortSignal,
): Promise<MediaNeighborsResponse> {
  return apiFetch({
    path: "/media/neighbors",
    schema: mediaNeighborsResponseSchema,
    init: {
      ...jsonInit({
        method: "POST",
        body: mediaNeighborsRequestSchema.parse(request),
      }),
      signal,
    },
  });
}
