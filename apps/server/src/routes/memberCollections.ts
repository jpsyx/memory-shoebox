import type { FastifyInstance } from "fastify";
import {
  memberCollectionParamsSchema,
  type MemberCollectionResponse,
} from "@memory-shoebox/shared";
import { requireViewer } from "../http/requestContextHelpers.ts";
import { readMemberCollectionIdentity } from "../members/readMemberCollectionIdentity.ts";

/** Serves only the public identity needed by an authenticated archive heading. */
export async function memberCollectionsRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get(
    "/member-collections/:memberId",
    async (request): Promise<MemberCollectionResponse> => {
      requireViewer(request);
      const { memberId } = memberCollectionParamsSchema.parse(request.params);
      return {
        member: await readMemberCollectionIdentity({
          database: request.server.database,
          b2: request.server.b2,
          memberId,
          now: request.server.clock().toISOString(),
        }),
      };
    },
  );
}
