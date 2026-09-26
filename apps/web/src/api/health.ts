import {
  healthResponseSchema,
  type HealthResponse,
} from "@memory-shoebox/shared";
import { queryOptions } from "@tanstack/react-query";
import { apiFetch } from "@/api/client";

/**
 * Query for `GET /api/health`.
 *
 * Exported as shared query options rather than a hook, so the same definition
 * serves a component, a route loader, or a prefetch. The type is left to
 * `queryOptions` to infer: that inference is what ties the query key to the
 * data type at every call site.
 */
export const healthQueryOptions = queryOptions({
  queryKey: ["health"],
  queryFn: (): Promise<HealthResponse> => {
    return apiFetch({ path: "/health", schema: healthResponseSchema });
  },
});
