import {
  type SetupStatusResponse,
  type SetupProgressResponse,
  createSetupResponseSchema,
  setupStatusResponseSchema,
  setupProgressResponseSchema,
  type CreateSetupRequest,
  type CreateSessionResponse,
} from "@memory-shoebox/shared";
import type { UnusedSkipTokenOptions } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { apiFetch, jsonInit } from "@/api/clientHelpers/clientHelpers";

/** Fresh anonymous availability, re-fetched at every navigation boundary. */
export const setupStatusQueryOptions = queryOptions({
  queryKey: ["setup", "status"],
  queryFn: () => {
    return apiFetch({ path: "/setup", schema: setupStatusResponseSchema });
  },
  staleTime: 0,
  retry: false,
}) satisfies UnusedSkipTokenOptions<
  SetupStatusResponse,
  Error,
  SetupStatusResponse,
  string[]
>;
/** Private durable progress; only active admins request it. */
export const setupProgressQueryOptions = queryOptions({
  queryKey: ["setup", "progress"],
  queryFn: () => {
    return apiFetch({
      path: "/setup/progress",
      schema: setupProgressResponseSchema,
    });
  },
  staleTime: 0,
  retry: false,
}) satisfies UnusedSkipTokenOptions<
  SetupProgressResponse,
  Error,
  SetupProgressResponse,
  string[]
>;
/** Creates the first active admin and ordinary session atomically. */
export function createSetup(
  body: Readonly<CreateSetupRequest>,
): Promise<CreateSessionResponse> {
  return apiFetch({
    path: "/setup",
    schema: createSetupResponseSchema,
    init: jsonInit({ method: "POST", body }),
  });
}
/** Clears durable progress, preserving every account and queued invitation. */
export function completeSetup(): Promise<void> {
  return apiFetch({
    path: "/setup/complete",
    schema: z.void(),
    init: { method: "POST" },
  });
}
