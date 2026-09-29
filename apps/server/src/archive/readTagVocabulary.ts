import type { TagsResponse } from "@memory-shoebox/shared";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import { readTagCounts } from "./readVocabularyCounts.ts";

/**
 * The tag vocabulary route's response shape: `GET /api/tags`.
 *
 * `readTagCounts` is shared with `readFacets`, so it hands back the raw
 * counts (id, name, and the normalised name neither route's response
 * carries) rather than either one's shape. This is that route's own thin
 * wrapper, in the spirit of `readPeopleDirectory`: it applies `q` and drops
 * `nameNormalized` before the response leaves the archive layer, so the
 * handler reads like its siblings and does not shape its own response.
 *
 * @param options.database The Kysely handle.
 * @param options.viewer The request's viewer.
 * @param options.search The `q` parameter, already normalised.
 */
export async function readTagVocabulary(options: {
  database: DatabaseExecutor;
  viewer: Viewer;
  search: string | undefined;
}): Promise<TagsResponse> {
  const counts = await readTagCounts({
    database: options.database,
    viewer: options.viewer,
  });

  return {
    tags: counts
      .filter((count) => {
        return (
          options.search === undefined ||
          count.nameNormalized.includes(options.search)
        );
      })
      .map((count) => {
        return {
          tag: { tagId: count.id, name: count.name },
          itemCount: count.itemCount,
        };
      }),
    nextCursor: null,
  };
}
