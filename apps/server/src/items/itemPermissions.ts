import type { ItemCapabilities, ItemsErrorCode } from "@memory-shoebox/shared";
import { ApiError } from "../http/ApiError.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";

/**
 * Who may change an item, split by consequence rather than by table.
 *
 * `conventions.md` § Who may change an item is binding and this module is its
 * only implementation:
 *
 * | Action                     | Who                                       |
 * | --------------------------- | ------------------------------------------ |
 * | Delete, visibility, date   | The **item's** uploader, or admin        |
 * | Tags, people, alt text     | **Any** uploader or admin, on what they see |
 *
 * The first group is destructive or changes who can see something, so it
 * belongs to whoever put it there. The second is additive and is better for
 * being collective: whoever recognises the face should be able to say so.
 *
 * This slice had assumed the uploader role for visibility and was wrong
 * (`items.md` Ruling 1), which is the reason the two predicates live in one
 * file with the table above between them.
 */

/** Any uploader or admin: the additive half. */
function _mayEditItemContent(viewer: Viewer): boolean {
  return viewer.isAdmin || viewer.role === "uploader";
}

/**
 * The item's own uploader, or an admin: the access-changing half.
 *
 * Exported because the selection save (`POST /api/items/visibility`) applies
 * it per item rather than raising on the first miss: it skips what the caller
 * does not own and reports how many, so it needs the predicate itself and not
 * the guard built on it.
 *
 * @param options.viewer The request's viewer.
 * @param options.uploadedBy `items.uploaded_by`.
 */
export function mayChangeItemAccess(options: {
  viewer: Viewer;
  uploadedBy: string;
}): boolean {
  return (
    options.viewer.isAdmin || options.viewer.memberId === options.uploadedBy
  );
}

/**
 * Refuses a viewer who may not add to an item they can see.
 *
 * Call it **after** `getVisibleItemOr404`, never before: a 403 raised on an
 * item the caller cannot see would confirm that the id exists.
 *
 * @param options.viewer The request's viewer.
 * @param options.code The 403 this route carries.
 */
export function assertMayEditItemContent(options: {
  viewer: Viewer;
  code: ItemsErrorCode;
}): void {
  if (!_mayEditItemContent(options.viewer)) {
    throw ApiError.forbidden(options.code);
  }
}

/**
 * Refuses a viewer who may not delete an item, move its date, or change who
 * can see it.
 *
 * Call it after `getVisibleItemOr404`, for the reason on the guard above.
 *
 * @param options.viewer The request's viewer.
 * @param options.uploadedBy `items.uploaded_by`.
 * @param options.code The 403 this route carries.
 */
export function assertMayChangeItemAccess(options: {
  viewer: Viewer;
  uploadedBy: string;
  code: ItemsErrorCode;
}): void {
  if (!mayChangeItemAccess(options)) {
    throw ApiError.forbidden(options.code);
  }
}

/**
 * What this viewer may do here, from the same two predicates the guards use.
 *
 * Computing them anywhere else is how a button and the request it sends stop
 * agreeing, which is invisible in the interface until somebody presses it.
 *
 * `canRequestRemoval` is three conditions and not one: the tag gate
 * (`removals.md` § The tag gate, which owns it), the absence of an open
 * request of this viewer's, and not being the uploader, who deletes rather
 * than asks. The tag gate only ever subtracts: it never admits a viewer to an
 * item the predicate excluded, because this is only ever called on a row that
 * has already come back from `getVisibleItemOr404`.
 *
 * @param options.viewer The request's viewer.
 * @param options.uploadedBy `items.uploaded_by`.
 * @param options.isPeopleTagged Whether the viewer's linked person is tagged.
 * @param options.hasOpenRemovalRequest Whether this viewer already asked.
 */
export function makeItemCapabilitiesFromItem(options: {
  viewer: Viewer;
  uploadedBy: string;
  isPeopleTagged: boolean;
  hasOpenRemovalRequest: boolean;
}): ItemCapabilities {
  const mayEditContent = _mayEditItemContent(options.viewer);
  const mayChangeAccess = mayChangeItemAccess(options);

  return {
    canSetVisibility: mayChangeAccess,
    canEditTags: mayEditContent,
    canEditPeople: mayEditContent,
    canDescribe: mayEditContent,
    canFixCaptureDate: mayChangeAccess,
    canDelete: mayChangeAccess,
    canRequestRemoval:
      options.isPeopleTagged &&
      !options.hasOpenRemovalRequest &&
      options.viewer.memberId !== options.uploadedBy,
    canSeeViewers: options.viewer.isAdmin,
  };
}
