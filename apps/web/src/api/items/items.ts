import {
  itemDetailSchema,
  type ItemDetail,
  type SetCaptureDateRequest,
  type SetItemPeopleRequest,
  type SetItemTagsRequest,
  type SetItemVisibilityRequest,
  type UpdateItemRequest,
} from "@memory-shoebox/shared";
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import {
  ApiRequestError,
  apiFetch,
  jsonInit,
  type JsonMethod,
} from "@/api/client/client";

/** The exact path one item lives at, below `/api`. */
export function makeItemPathFromItemId(itemId: string): string {
  return `/items/${encodeURIComponent(itemId)}`;
}

/**
 * Where "Download the original" points.
 *
 * A route that redirects to a freshly signed URL rather than a field on
 * `MediaRef` (`items.md` Ruling 9), so the href is built here and the route
 * puts a sensible filename into the download itself.
 */
export function makeOriginalHrefFromItemId(itemId: string): string {
  return `/api${makeItemPathFromItemId(itemId)}/original`;
}

/**
 * The permalink.
 *
 * **Every run of this query counts an open** (`items.md` transformation 9),
 * and surface 17 prints the count. So it refetches on mount, because arriving
 * at a photograph again is opening it again, and never on focus or reconnect,
 * because neither is. Every write answers with what it changed and is put
 * into this entry directly (`surfaces/Item/itemWrites/`), never by
 * invalidating it, which would be one phantom open per tap.
 */
export function itemQueryOptions(
  itemId: string,
): ReturnType<typeof queryOptions<ItemDetail, Error, ItemDetail, string[]>> {
  return queryOptions({
    // Nothing should invalidate or refetch by the `"items"` prefix: doing that
    // while someone is looking at an item records a phantom open. Writes put
    // their answers straight into the entry instead.
    queryKey: ["items", itemId],
    queryFn: (): Promise<ItemDetail> => {
      return apiFetch({
        path: makeItemPathFromItemId(itemId),
        schema: itemDetailSchema,
      });
    },
    staleTime: 0,
    // Once, and only when the server itself failed. A `ZodError` means the
    // server already answered `200` and counted the open, so asking again
    // would count a second; a refusal below `500` is an answer, and a retry
    // only doubles the time it takes to be shown.
    retry: (failureCount, error) => {
      return (
        error instanceof ApiRequestError &&
        error.status >= 500 &&
        failureCount < 1
      );
    },
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

/** One write that answers with the whole item, as five of them do. */
function _writeItemDetail(
  options: Readonly<{
    path: string;
    method: JsonMethod;
    body: unknown;
  }>,
): Promise<ItemDetail> {
  return apiFetch({
    path: options.path,
    schema: itemDetailSchema,
    init: jsonInit({ method: options.method, body: options.body }),
  });
}

/** The alt text override, and nothing else (`PATCH /api/items/:itemId`). */
export function setItemAltText(
  options: Readonly<{ itemId: string; body: UpdateItemRequest }>,
): Promise<ItemDetail> {
  return _writeItemDetail({
    path: makeItemPathFromItemId(options.itemId),
    method: "PATCH",
    body: options.body,
  });
}

/** Replaces the whole tag set. Names, not ids: the field can invent one. */
export function setItemTags(
  options: Readonly<{ itemId: string; body: SetItemTagsRequest }>,
): Promise<ItemDetail> {
  return _writeItemDetail({
    path: `${makeItemPathFromItemId(options.itemId)}/tags`,
    method: "PUT",
    body: options.body,
  });
}

/** Replaces the whole people set: known people by id, new ones by name. */
export function setItemPeople(
  options: Readonly<{ itemId: string; body: SetItemPeopleRequest }>,
): Promise<ItemDetail> {
  return _writeItemDetail({
    path: `${makeItemPathFromItemId(options.itemId)}/people`,
    method: "PUT",
    body: options.body,
  });
}

/** Repoints the item at a rule `findOrCreateVisibilityRule` returned. */
export function setItemVisibility(
  options: Readonly<{ itemId: string; body: SetItemVisibilityRequest }>,
): Promise<ItemDetail> {
  return _writeItemDetail({
    path: `${makeItemPathFromItemId(options.itemId)}/visibility`,
    method: "PATCH",
    body: options.body,
  });
}

/** The hand correction to the capture date, which keeps the clock time. */
export function setItemCaptureDate(
  options: Readonly<{ itemId: string; body: SetCaptureDateRequest }>,
): Promise<ItemDetail> {
  return _writeItemDetail({
    path: `${makeItemPathFromItemId(options.itemId)}/capture-date`,
    method: "POST",
    body: options.body,
  });
}

/** Destroys the record and the file. Answers `204`. */
export function deleteItem(itemId: string): Promise<void> {
  return apiFetch({
    path: makeItemPathFromItemId(itemId),
    schema: z.void(),
    init: { method: "DELETE" },
  });
}
