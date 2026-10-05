import type { AcceptanceContext } from "./acceptance.types.ts";
import { fileURLToPath } from "node:url";
import { createTestApp } from "../../../apps/server/test/helpers/createTestApp.ts";
import { createTestConfig } from "../../../apps/server/test/helpers/createTestConfig.ts";
import { seedAcceptanceMembers } from "./seedAcceptanceMembers.ts";
import { seedAcceptanceGroups } from "./seedAcceptanceGroups.ts";
import { seedAcceptancePhotos } from "./seedAcceptancePhotos.ts";
import { seedAcceptanceItemContext } from "./seedAcceptanceItemContext.ts";
import { seedAcceptanceVideo } from "./seedAcceptanceVideo.ts";
import { registerAcceptanceRoutes } from "./registerAcceptanceRoutes.ts";
/** Resources owned and closed by one acceptance scenario. */
export type AcceptanceCatalog = AcceptanceContext &
  Awaited<ReturnType<typeof seedAcceptanceMembers>> & {
    origin: string;
    group: string;
    itemId: string;
    videoId: string;
  };
type SeededAcceptanceArchive = {
  members: Awaited<ReturnType<typeof seedAcceptanceMembers>>;
  group: string;
  videoId: string;
  mediaByKey: Map<string, string>;
};

function _createAcceptanceApp(
  webDistDirectory: string,
): Promise<AcceptanceContext> {
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

async function _seedArchive(
  database: AcceptanceContext["database"],
): Promise<SeededAcceptanceArchive> {
  const members = await seedAcceptanceMembers(database);
  const { group, only, except } = await seedAcceptanceGroups({
    database,
    rosa: members.viewer.memberId,
    invited: members.invited,
  });
  const mediaByKey = new Map<string, string>();
  await seedAcceptancePhotos({
    database,
    adminId: members.admin.memberId,
    rosa: members.viewer.memberId,
    only,
    except,
    mediaByKey,
  });
  const person = await seedAcceptanceItemContext({
    database,
    adminId: members.admin.memberId,
    rosa: members.viewer.memberId,
  });
  const videoId = await seedAcceptanceVideo({
    database,
    adminId: members.admin.memberId,
    person,
    mediaByKey,
  });
  return { members, group, videoId, mediaByKey };
}

/** Own startup, failed-setup cleanup and successful fixture lifetime. */
export async function createAcceptanceCatalog({
  port = 0,
  isEmpty = false,
  webDistDirectory = "dist",
}: Readonly<{
  port?: number;
  isEmpty?: boolean;
  webDistDirectory?: "dist" | "dist-e2e";
}> = {}): Promise<AcceptanceCatalog> {
  const context = await _createAcceptanceApp(webDistDirectory);
  try {
    const { database } = context;
    const { members, group, videoId, mediaByKey } =
      await _seedArchive(database);
    let origin = "";
    registerAcceptanceRoutes({
      context,
      members,
      mediaByKey,
      getOrigin: () => {
        return origin;
      },
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
