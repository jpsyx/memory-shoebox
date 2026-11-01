import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  peopleRequestSchema,
  type PeopleResponse,
} from "@memory-shoebox/shared";
import { makeNormalisedNameFromName } from "../archive/makeNormalisedNameFromName.ts";
import { readPeopleDirectory } from "../archive/readPeopleDirectory.ts";
import { requireViewer } from "../http/requestContextHelpers.ts";

/**
 * The people directory: `tech-specs/apis/timeline.md`.
 *
 * **`memberId` is absent from every entry**, which is why `DirectoryPerson`
 * wraps `PersonRef` without exposing an account ID. Its `isMember` flag is
 * derived from an active linked account and drives the visible non-member
 * suffix. Photo identities remain independent from archive permissions.
 */
export async function peopleRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/people",
    async (request: FastifyRequest): Promise<PeopleResponse> => {
      const viewer = requireViewer(request);
      const query = peopleRequestSchema.parse(request.query);

      return readPeopleDirectory({
        database: request.server.database,
        b2: request.server.b2,
        viewer,
        search:
          query.q === undefined
            ? undefined
            : makeNormalisedNameFromName(query.q),
        now: request.server.clock(),
      });
    },
  );
}
