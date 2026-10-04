import {
  createRemovalRequestRequestSchema,
  createRemovalRequestResponseSchema,
  declineRemovalRequestRequestSchema,
  declineRemovalRequestResponseSchema,
  withdrawRemovalRequestResponseSchema,
  type CreateRemovalRequestRequest,
  type DeclineRemovalRequestRequest,
  type RemovalRequestDto,
} from "@memory-shoebox/shared";
import { apiFetch, jsonInit } from "@/api/clientHelpers/clientHelpers";

/** Asks for a visible, tagged item to come down with optional own words. */
export function createRemovalRequest(
  options: Readonly<{ itemId: string; body: CreateRemovalRequestRequest }>,
): Promise<RemovalRequestDto> {
  return apiFetch({
    path: `/items/${encodeURIComponent(options.itemId)}/removal-requests`,
    schema: createRemovalRequestResponseSchema,
    init: jsonInit({
      method: "POST",
      body: createRemovalRequestRequestSchema.parse(options.body),
    }),
  });
}

/** Declines an open ask with compulsory, trimmed responder words. */
export function declineRemovalRequest(
  options: Readonly<{ requestId: string; body: DeclineRemovalRequestRequest }>,
): Promise<RemovalRequestDto> {
  return apiFetch({
    path: `/removal-requests/${encodeURIComponent(options.requestId)}/decline`,
    schema: declineRemovalRequestResponseSchema,
    init: jsonInit({
      method: "POST",
      body: declineRemovalRequestRequestSchema.parse(options.body),
    }),
  });
}

/** Withdraws the member's own open ask without sending a JSON body. */
export function withdrawRemovalRequest(
  requestId: string,
): Promise<RemovalRequestDto> {
  return apiFetch({
    path: `/removal-requests/${encodeURIComponent(requestId)}/withdraw`,
    schema: withdrawRemovalRequestResponseSchema,
    init: { method: "POST" },
  });
}
