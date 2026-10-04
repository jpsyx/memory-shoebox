import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  timelineRailRequestSchema,
  timelineRequestSchema,
  type TimelineRailResponse,
  type TimelineResponse,
} from "@memory-shoebox/shared";
import { readRailDays } from "../archive/readRailDays.ts";
import { readTimelinePage } from "../archive/readTimelinePage.ts";
import {
  makeTimelineFilterFromQuery,
  type TimelineFilter,
} from "../archive/selectionFilterHelpers.ts";
import {
  getPageStateFromTimelineCursor,
  makeDigestFromFilter,
  type TimelinePageState,
} from "../archive/timelineCursorHelpers/timelineCursorHelpers.ts";
import { ApiError } from "../http/ApiError.ts";
import { requireViewer } from "../http/requestContextHelpers.ts";

/**
 * Decodes the cursor, or refuses the request.
 *
 * Two failures and one status: a cursor that does not decode and a cursor
 * whose digest names a different selection are both `400 invalid_request` with
 * `details.fieldErrors.cursor`. The second matters more than it looks: a
 * client that changed the filter without resetting the cursor would otherwise
 * get a page ranked against a different feed, with bands opening twice.
 */
function _getPageStateFromCursor(options: {
  cursor: string | undefined;
  filter: Readonly<TimelineFilter>;
}): TimelinePageState | undefined {
  if (options.cursor === undefined) {
    return undefined;
  }
  const state = getPageStateFromTimelineCursor(options.cursor);
  if (
    state === undefined ||
    state.filterDigest !== makeDigestFromFilter(options.filter)
  ) {
    throw ApiError.invalidRequest({
      cursor: ["This cursor does not belong to this selection."],
    });
  }
  return state;
}

/**
 * The day stream: `tech-specs/apis/timeline.md`.
 *
 * **One route, not two.** The `filtered` state of surface 2 and the results of
 * surface 6 are this endpoint with query parameters set: a filtered archive is
 * not a different object, and an API that made it one would invite the two to
 * drift.
 *
 * No `403` and no `404` exist here. The route addresses no row by id, and an
 * invisible item is simply absent from the page and from every count on it,
 * which is the same thing the 404 rule buys elsewhere.
 */
export async function timelineRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/timeline",
    async (request: FastifyRequest): Promise<TimelineResponse> => {
      const viewer = requireViewer(request);
      const query = timelineRequestSchema.parse(request.query);
      const filter = makeTimelineFilterFromQuery(query);

      return readTimelinePage({
        database: request.server.database,
        b2: request.server.b2,
        viewer,
        filter,
        limit: query.limit,
        cursor: _getPageStateFromCursor({ cursor: query.cursor, filter }),
        now: request.server.clock(),
        logger: request.log,
      });
    },
  );

  app.get(
    "/timeline/rail",
    async (request: FastifyRequest): Promise<TimelineRailResponse> => {
      const viewer = requireViewer(request);
      // `limit` and `cursor` are rejected by the schema rather than ignored:
      // the rail's whole job is to be complete, and silently accepting them
      // would let somebody build a paginated one by accident.
      const query = timelineRailRequestSchema.parse(request.query);

      return {
        days: await readRailDays({
          database: request.server.database,
          viewer,
          filter: makeTimelineFilterFromQuery(query),
        }),
        // Always null, present only to satisfy the collection envelope.
        nextCursor: null,
      };
    },
  );
}
