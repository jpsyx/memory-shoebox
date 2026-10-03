import type { ItemDetail } from "@memory-shoebox/shared";
import { renderAt, respondWith, type Answer } from "@/testing/surfaceHarness";

/**
 * The canned server and the render for the item route, shared by every suite
 * under `surfaces/Item/`.
 *
 * Answers the item itself, the two vocabularies its editors suggest from, and
 * `GET /api/members` and `GET /api/groups` with `404`, which is what those
 * routes answer for now. A case that needs a write answered passes it in
 * `routes`; anything unanswered is a `404`, which is the surfaceHarness's own
 * default.
 *
 * @param options.detail What `GET /api/items/:itemId` answers.
 * @param options.routes Further answers keyed by `"METHOD /path"`.
 */
export function respondWithItem(
  options: Readonly<{
    detail: Readonly<ItemDetail>;
    routes?: Readonly<Record<string, Answer>>;
  }>,
): void {
  const { detail, routes = {} } = options;
  respondWith(routes, {
    [`GET /api/items/${detail.itemId}`]: { body: detail, status: 200 },
    "GET /api/people": {
      body: { people: [], nextCursor: null, peopleCount: 0 },
      status: 200,
    },
    "GET /api/tags": { body: { tags: [], nextCursor: null }, status: 200 },
    "GET /api/members": {
      body: { error: "not_found", message: "No such route." },
      status: 404,
    },
    "GET /api/groups": {
      body: { error: "not_found", message: "No such route." },
      status: 404,
    },
  });
}

/** The item page for one id, through the real router. */
export function renderItem(itemId: string): ReturnType<typeof renderAt> {
  return renderAt(`/items/${itemId}`);
}

export {
  getRecordedCountFromLine,
  getRecordedBodyFromRequest,
  recordedRequests,
  recordedUrls,
} from "@/testing/surfaceHarness";
