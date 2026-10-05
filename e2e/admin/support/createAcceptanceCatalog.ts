import { getMediaResponseFromFile } from "./getMediaResponseFromFile.ts";
import { fileURLToPath } from "node:url";
import { createTestApp } from "../../../apps/server/test/helpers/createTestApp.ts";
import { createTestConfig } from "../../../apps/server/test/helpers/createTestConfig.ts";
import { insertSignedInMember } from "../../../apps/server/test/helpers/insertSignedInMember.ts";
import {
  insertMember,
  insertSession,
  insertInvitation,
} from "../../../apps/server/test/helpers/seedHelpers/memberSeedHelpers.ts";
import {
  insertRemovalRequest,
  insertInstanceSetting,
} from "../../../apps/server/test/helpers/seedHelpers/miscSeedHelpers.ts";
import { insertItem } from "../../../apps/server/test/helpers/seedHelpers/itemSeedHelpers.ts";
import {
  insertRendition,
  insertPerson,
  insertItemPerson,
  insertItemView,
  insertMilestone,
  insertItemMilestone,
} from "../../../apps/server/test/helpers/seedHelpers/archiveSeedHelpers.ts";
import {
  insertGroup,
  insertGroupMember,
  insertVisibilityRule,
  insertVisibilityRuleSubject,
} from "../../../apps/server/test/helpers/seedHelpers/visibilitySeedHelpers.ts";

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
/** Own a migrated catalog, disposable sessions and actual local media bytes. */
export async function createAcceptanceCatalog(
  port = 0,
  isEmpty = false,
  webDistDirectory: "dist" | "dist-e2e" = "dist",
): Promise<AcceptanceCatalog> {
  const now = new Date().toISOString();
  const context = await createTestApp({
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
  try {
    const { app, database, b2 } = context;
    const admin = await insertSignedInMember({
      database,
      token: "step9-admin-browser-evidence",
      member: {
        id: "00000000-0000-4000-8000-000000000001",
        display_name: "Elena",
        email: "elena@example.com",
        role: "admin",
      },
      session: { device_label: "Chrome on Mac" },
    });
    const secondAdmin = await insertMember(database, {
      id: "00000000-0000-4000-8000-000000000002",
      display_name: "Mateo",
      email: "mateo@example.com",
      role: "admin",
    });
    const viewer = await insertSignedInMember({
      database,
      token: "acceptance-tagged-viewer",
      member: {
        id: "00000000-0000-4000-8000-000000000003",
        display_name: "Abuela Rosa",
        email: "rosa@example.com",
        role: "viewer",
      },
    });
    const rosa = viewer.memberId;
    const invited = await insertMember(database, {
      id: "00000000-0000-4000-8000-000000000004",
      display_name: "Lucía",
      email: "lucia@example.com",
      status: "invited",
      joined_at: null,
      last_signed_in_at: null,
      last_seen_at: null,
    });
    await insertInvitation(database, {
      memberId: invited,
      invitedByMemberId: admin.memberId,
      expires_at: new Date(Date.parse(now) + 7 * 86_400_000).toISOString(),
      last_sent_at: new Date(Date.parse(now) - 86_400_000).toISOString(),
    });
    await insertSession(database, {
      memberId: rosa,
      device_label: "Safari on iPhone",
    });
    await insertInstanceSetting(database, {
      key: "shoebox.name",
      value: "The Ruiz Shoebox",
    });
    await insertInstanceSetting(database, {
      key: "shoebox.timezone",
      value: "Europe/Madrid",
    });
    const group = await insertGroup(database, {
      id: "00000000-0000-4000-8000-000000000005",
      name: "Cousins",
    });
    await insertGroupMember(database, { groupId: group, memberId: rosa });
    await insertGroupMember(database, { groupId: group, memberId: invited });
    const only = await insertVisibilityRule(database, { mode: "only" });
    const except = await insertVisibilityRule(database, { mode: "except" });
    await insertVisibilityRuleSubject(database, {
      ruleId: only,
      groupId: group,
    });
    await insertVisibilityRuleSubject(database, {
      ruleId: except,
      groupId: group,
    });
    const mediaByKey = new Map<string, string>();
    const media = ["highChair", "bath", "the-walk-poster"];
    for (let position = 0; position < media.length; position += 1) {
      const itemId = await insertItem(database, {
        uploadedBy: admin.memberId,
        id: `00000000-0000-4000-8000-${String(position + 10).padStart(12, "0")}`,
        captured_at: `2026-09-27T0${position}:30:00.000Z`,
        captured_on: "2026-09-27",
        seq: position + 1,
        alt_text: "A family memory",
        width: 800,
        height: 600,
        ...(position === 0
          ? { visibility_rule_id: only }
          : position === 1
            ? { visibility_rule_id: except }
            : {}),
      });
      for (const purpose of ["thumb", "display", "original"]) {
        const key = `evidence/${position}/${purpose}.jpg`;
        const filename = `${media[position]}.jpg`;
        mediaByKey.set(key, filename);
        await insertRendition(database, { itemId, purpose, storage_key: key });
      }
      if (position === 2)
        await insertItemView(database, {
          memberId: rosa,
          itemId,
          first_opened_at: now,
          last_opened_at: now,
          open_count: 2,
        });
    }
    const person = await insertPerson(database, {
      displayName: "Abuela Rosa",
      member_id: rosa,
    });
    await insertItemPerson(database, {
      itemId: "00000000-0000-4000-8000-000000000012",
      personId: person,
    });
    await insertRemovalRequest(database, {
      item_id: "00000000-0000-4000-8000-000000000012",
      requestedByMemberId: rosa,
      itemUploaderMemberId: admin.memberId,
      state: "open",
      resolved_at: null,
      resolved_by_member_id: null,
      decline_reason: null,
      reason: "Please take this one down.",
    });
    const milestone = await insertMilestone(database, {
      name: "The first week",
      startsOn: "2026-09-27",
      endsOn: "2026-09-27",
      created_by: admin.memberId,
    });
    await insertItemMilestone(database, {
      itemId: "00000000-0000-4000-8000-000000000012",
      milestoneId: milestone,
    });
    const videoId = await insertItem(database, {
      uploadedBy: admin.memberId,
      id: "00000000-0000-4000-8000-000000000013",
      seq: 4,
      kind: "video",
      content_type: "video/mp4",
      duration_ms: 10000,
      captured_at: "2026-09-27T03:30:00.000Z",
      captured_on: "2026-09-27",
      width: 960,
      height: 540,
      alt_text: "A family walk",
    });
    await insertItemPerson(database, { itemId: videoId, personId: person });
    for (const purpose of ["thumb", "poster", "video_mp4", "video_webm"]) {
      const filename =
        purpose === "video_mp4"
          ? "the-walk.mp4"
          : purpose === "video_webm"
            ? "the-walk.webm"
            : purpose === "thumb"
              ? "the-walk-thumb.jpg"
              : "the-walk-poster.jpg";
      const key = `evidence/video/${purpose}`;
      mediaByKey.set(key, filename);
      await insertRendition(database, {
        itemId: videoId,
        purpose,
        storage_key: key,
        content_type: purpose.startsWith("video")
          ? `video/${purpose === "video_mp4" ? "mp4" : "webm"}`
          : "image/jpeg",
        width: 960,
        height: 540,
      });
    }
    b2.presignGet = async ({ key }) => {
      return `${origin}/api/evidence/media/${encodeURIComponent(key)}`;
    };
    app.get<{ Params: { key: string } }>(
      "/api/evidence/media/:key",
      async (request, reply) => {
        const filename = mediaByKey.get(request.params.key);
        if (!filename) return reply.code(404).send();
        const path = fileURLToPath(
          new URL(
            `../../fixtures/cartoon-media/web/${filename}`,
            import.meta.url,
          ),
        );
        const mediaResponse = await getMediaResponseFromFile({
          path,
          range: request.headers.range,
        });
        return reply
          .code(mediaResponse.status)
          .headers(mediaResponse.headers)
          .send(mediaResponse.body);
      },
    );
    app.post<{ Body: { lastAdmin?: boolean } }>(
      "/api/evidence/scenario",
      async (request) => {
        if (request.body.lastAdmin !== undefined)
          await database
            .updateTable("members")
            .set({ role: request.body.lastAdmin ? "uploader" : "admin" })
            .where("id", "=", secondAdmin)
            .execute();
        return { ok: true };
      },
    );
    app.get<{ Params: { role: string }; Querystring: { to?: string } }>(
      "/api/evidence/session/:role",
      async (request, reply) => {
        const session = request.params.role === "viewer" ? viewer : admin;
        const target =
          request.query.to?.startsWith("/") &&
          !request.query.to.startsWith("//")
            ? request.query.to
            : "/";
        return reply
          .header(
            "set-cookie",
            `shoebox_session=${session.token}; Path=/; HttpOnly; SameSite=Lax`,
          )
          .redirect(target);
      },
    );
    if (isEmpty) {
      await database.deleteFrom("removal_requests").execute();
      await database.deleteFrom("items").execute();
      await database.deleteFrom("milestones").execute();
    }
    const origin = await app.listen({ port, host: "127.0.0.1" });
    return {
      ...context,
      origin,
      admin,
      viewer,
      secondAdmin,
      invited,
      group,
      itemId: "00000000-0000-4000-8000-000000000012",
      videoId,
    };
  } catch (failure) {
    await context.close();
    throw failure;
  }
}
