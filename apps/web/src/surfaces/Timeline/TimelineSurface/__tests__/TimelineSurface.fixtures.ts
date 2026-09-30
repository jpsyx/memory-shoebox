import { makeDay } from "@/surfaces/Timeline/timelineFixtures";
import type { Answer } from "@/testing/surfaceHarness";
import {
  renderAt,
  respondWith as respondWithShell,
} from "@/testing/surfaceHarness";

/**
 * The canned server and the render, shared by the three `TimelineSurface`
 * test files beside this one.
 *
 * It is a fixture file rather than anything the surface can reach: nothing
 * outside `__tests__/` imports it, which is what keeps the stubbed `fetch`
 * and the memory router out of the product. The day, item and burst shapes
 * it answers with are `Timeline/timelineFixtures.ts`, one directory up,
 * because `DayBlock`'s own unit test needs them too.
 */

/** Everything the timeline asks for, answered the way the server would. */
function _timelineAnswers(): Record<string, Answer> {
  return {
    "GET /api/timeline": {
      body: { days: [makeDay()], nextCursor: null, resultCount: null },
      status: 200,
    },
    "GET /api/timeline/rail": {
      body: {
        days: [{ capturedOn: "2026-09-27", itemCount: 3 }],
        nextCursor: null,
      },
      status: 200,
    },
    "GET /api/filters/facets": {
      body: { tags: [], people: [], resultCount: 3 },
      status: 200,
    },
    "GET /api/tags": { body: { tags: [], nextCursor: null }, status: 200 },
    "GET /api/people": {
      body: { people: [], nextCursor: null, peopleCount: 0 },
      status: 200,
    },
    "POST /api/items/seen": { body: undefined, status: 204 },
  };
}

/** The canned server, with the timeline's routes already answered. */
export function respondWith(
  routes: Readonly<Record<string, Answer>> = {},
): void {
  respondWithShell(routes, _timelineAnswers());
}

/** The pile at one address. Defaults to the whole archive. */
export function renderTimeline(initialPath = "/"): ReturnType<typeof renderAt> {
  return renderAt(initialPath);
}

export { recordedUrls } from "@/testing/surfaceHarness";
