import type { Answer } from "@/testing/surfaceHarness";
import { renderAt, respondWith } from "@/testing/surfaceHarness";

/**
 * The canned server and the render for the one suite beside this file.
 *
 * It is a fixture file rather than anything the surface can reach: only
 * `PeopleSurface.test.tsx` imports it, which is what keeps the stubbed
 * `fetch` and the memory router out of the product.
 */

/** Everything the directory asks for, answered the way the server would. */
function _peopleAnswers(): Record<string, Answer> {
  return {
    "GET /api/people": {
      body: { people: [], nextCursor: null, peopleCount: 0 },
      status: 200,
    },
  };
}

/** The canned server, with the directory's route already answered. */
export function respondWithPeople(
  routes: Readonly<Record<string, Answer>> = {},
): void {
  respondWith(routes, _peopleAnswers());
}

/** The directory at one address. Defaults to the whole of it. */
export function renderPeople(
  initialPath = "/people",
): ReturnType<typeof renderAt> {
  return renderAt(initialPath);
}

export { recordedUrls } from "@/testing/surfaceHarness";
