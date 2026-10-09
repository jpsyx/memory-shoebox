import { queryOptions } from "@tanstack/react-query";
import {
  itemDetailSchema,
  personTaggingOptionsResponseSchema,
  type ItemDetail,
  type PersonTaggingOptionsResponse,
} from "@memory-shoebox/shared";
import { apiFetch, jsonInit } from "@/api/clientHelpers/clientHelpers";

/** Item-specific management permissions, checked against the whole catalog. */
export function personTaggingQueryOptions(
  itemId: string,
): ReturnType<
  typeof queryOptions<
    PersonTaggingOptionsResponse,
    Error,
    PersonTaggingOptionsResponse,
    string[]
  >
> {
  return queryOptions({
    queryKey: ["people", "tagging", itemId],
    queryFn: () => {
      return apiFetch({
        path: `/items/${itemId}/people/options`,
        schema: personTaggingOptionsResponseSchema,
      });
    },
  });
}

/** Changes an ad-hoc name everywhere the same person is tagged. */
export function renamePerson(
  options: Readonly<{ itemId: string; personId: string; displayName: string }>,
): Promise<ItemDetail> {
  return apiFetch({
    path: `/items/${options.itemId}/people/${options.personId}`,
    schema: itemDetailSchema,
    init: jsonInit({
      method: "PATCH",
      body: { displayName: options.displayName },
    }),
  });
}

/** Removes a person entirely, including their tag on the current item. */
export function deletePerson(
  options: Readonly<{ itemId: string; personId: string }>,
): Promise<ItemDetail> {
  return apiFetch({
    path: `/items/${options.itemId}/people/${options.personId}`,
    schema: itemDetailSchema,
    init: { method: "DELETE" },
  });
}
