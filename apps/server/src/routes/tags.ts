import type { FastifyInstance, FastifyRequest } from "fastify";
import { tagsRequestSchema, type TagsResponse } from "@memory-shoebox/shared";
import { makeNormalisedNameFromName } from "../archive/makeNormalisedNameFromName.ts";
import { readTagVocabulary } from "../archive/readTagVocabulary.ts";
import { requireViewer } from "../http/requestContextHelpers.ts";

/**
 * The tag vocabulary: `tech-specs/apis/timeline.md`.
 *
 * **Not paginated, deliberately.** The aggregate scans `item_tags` whole
 * whichever page is asked for, so cursoring would save serialisation and
 * nothing else, while a partial vocabulary makes a type-ahead lie. The
 * vocabulary is bounded by how much a family types, not by how much it
 * photographs.
 *
 * `q` is applied in the application over the same normalised name the column
 * holds, because the aggregate is already in memory and because folding case
 * for "Sofía" is something JavaScript does and SQLite's ASCII-only `LIKE` does
 * not.
 */
export async function tagsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/tags", async (request: FastifyRequest): Promise<TagsResponse> => {
    const viewer = requireViewer(request);
    const query = tagsRequestSchema.parse(request.query);

    return readTagVocabulary({
      database: request.server.database,
      viewer,
      search:
        query.q === undefined ? undefined : makeNormalisedNameFromName(query.q),
    });
  });
}
