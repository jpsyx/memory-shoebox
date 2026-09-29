import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  filterFacetsRequestSchema,
  type FilterFacetsResponse,
} from "@memory-shoebox/shared";
import { readFacets } from "../archive/readFacets.ts";
import { makeTimelineFilterFromQuery } from "../archive/selectionFilterHelpers.ts";
import { requireViewer } from "../http/requestContextHelpers.ts";

/**
 * The filter surface's chip counts: `tech-specs/apis/timeline.md`.
 *
 * Selections AND across and within dimensions: two tags means both tags, and a
 * tag plus a person plus a date range means all three. That is what makes the
 * `none` state reachable and what its copy is about.
 *
 * An unknown tag or person id is not an error here either: it narrows the
 * selection to nothing, exactly as a real id with no matches would.
 */
export async function filtersRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/filters/facets",
    async (request: FastifyRequest): Promise<FilterFacetsResponse> => {
      const viewer = requireViewer(request);
      const query = filterFacetsRequestSchema.parse(request.query);

      return readFacets({
        database: request.server.database,
        viewer,
        filter: makeTimelineFilterFromQuery(query),
      });
    },
  );
}
