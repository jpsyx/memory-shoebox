import { fileURLToPath } from "node:url";
import { createTestApp } from "../../../apps/server/test/helpers/createTestApp.ts";
import { createTestConfig } from "../../../apps/server/test/helpers/createTestConfig.ts";
import type { insertSignedInMember } from "../../../apps/server/test/helpers/insertSignedInMember.ts";
import { seedAcceptanceMembers } from "./seedAcceptanceMembers.ts";
import { seedAcceptanceGroups } from "./seedAcceptanceGroups.ts";
import { seedAcceptancePhotos } from "./seedAcceptancePhotos.ts";
import { seedAcceptanceItemContext } from "./seedAcceptanceItemContext.ts";
import { seedAcceptanceVideo } from "./seedAcceptanceVideo.ts";
import { registerAcceptanceRoutes } from "./registerAcceptanceRoutes.ts";
/** Resources owned and closed by one acceptance scenario. */
export type AcceptanceCatalog = Awaited<ReturnType<typeof createTestApp>> & {
  origin: string;
  admin: Awaited<ReturnType<typeof insertSignedInMember>>;
  viewer: Awaited<ReturnType<typeof insertSignedInMember>>;
  secondAdmin: string;
  invited: string;
  group: string;
  itemId: string;
  videoId: string;
};
/** Own startup, failed-setup cleanup and successful fixture lifetime. */
export async function createAcceptanceCatalog(
  port = 0,
  isEmpty = false,
  webDistDirectory: "dist" | "dist-e2e" = "dist",
): Promise<AcceptanceCatalog> {
  const context = await _createAcceptanceApp(webDistDirectory);
  try {
    const { database } = context;
    const { members, group, videoId, mediaByKey } =
      await _seedArchive(database);
    let origin = "";
    registerAcceptanceRoutes(context, members, mediaByKey, () => {
      return origin;
    });
    if (isEmpty) {
      await database.deleteFrom("removal_requests").execute();
      await database.deleteFrom("items").execute();
      await database.deleteFrom("milestones").execute();
    }
    origin = await context.app.listen({ port, host: "127.0.0.1" });
    return {
      ...context,
      ...members,
      origin,
      group,
      itemId: "00000000-0000-4000-8000-000000000012",
      videoId,
    };
  } catch (failure) {
    await context.close();
    throw failure;
  }
}
function _createAcceptanceApp(webDistDirectory: string) {
  return createTestApp({
    config: createTestConfig({
      WEB_DIST_PATH: fileURLToPath(
        new URL(`../../../apps/web/${webDistDirectory}`, import.meta.url),
      ),
    }),
    emailService: "none",
    mailDomainReader: "none",
    clock: () => {
      return new Date();
    },
  });
}

async function _seedArchive(database: AcceptanceCatalog["database"]) {
  const members = await seedAcceptanceMembers(database);
  const { group, only, except } = await seedAcceptanceGroups(
    database,
    members.viewer.memberId,
    members.invited,
  );
  const mediaByKey = new Map<string, string>();
  await seedAcceptancePhotos(
    database,
    members.admin.memberId,
    members.viewer.memberId,
    only,
    except,
    mediaByKey,
  );
  const person = await seedAcceptanceItemContext(
    database,
    members.admin.memberId,
    members.viewer.memberId,
  );
  const videoId = await seedAcceptanceVideo(
    database,
    members.admin.memberId,
    person,
    mediaByKey,
  );
  return { members, group, videoId, mediaByKey };
}
