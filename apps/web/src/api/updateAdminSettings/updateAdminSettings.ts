import {
  getSettingsResponseSchema,
  updateSettingsRequestSchema,
  updateSettingsResponseSchema,
  type UpdateSettingsRequest,
  type UpdateSettingsResponse,
  type GetSettingsResponse,
} from "@memory-shoebox/shared";
import {
  queryOptions,
  type UnusedSkipTokenOptions,
} from "@tanstack/react-query";
import { apiFetch, jsonInit } from "@/api/clientHelpers/clientHelpers";
/**
 * The complete six-key administrative contract, isolated from public
 * settings.
 */
export const adminSettingsQueryOptions = queryOptions({
  queryKey: ["settings", "admin"],
  queryFn: () => {
    return apiFetch({ path: "/settings", schema: getSettingsResponseSchema });
  },
  staleTime: 0,
  retry: false,
} satisfies UnusedSkipTokenOptions<
  GetSettingsResponse,
  Error,
  GetSettingsResponse,
  readonly ["settings", "admin"]
>);
/**
 * Validates nested edits and sends the preview flag exclusively in the query.
 */
export async function updateAdminSettings(
  input: Readonly<UpdateSettingsRequest>,
): Promise<UpdateSettingsResponse> {
  const { preview, ...body } = updateSettingsRequestSchema.parse(input);
  const query = preview === undefined ? "" : `?preview=${preview}`;
  const response = await apiFetch({
    path: `/settings${query}`,
    schema: updateSettingsResponseSchema,
    init: jsonInit({ method: "PATCH", body }),
  });
  if (response.isPreview !== (preview === true)) {
    throw new Error("The settings response has an unexpected preview status.");
  }
  return response;
}
