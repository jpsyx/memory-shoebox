import {
  insertVisibilityRule,
  insertVisibilityRuleSubject,
  insertItem,
  insertComment,
  NOW,
} from "../helpers/seedHelpers/seedHelpers.ts";
import { readCommentThread } from "../../src/items/readCommentThread.ts";
import { makeViewer } from "../helpers/makeViewer.ts";
import { makeQueryCountingDatabaseFromDatabase } from "../helpers/makeQueryCountingDatabaseFromDatabase.ts";
import { publishMemberAvatar } from "../../src/avatars/publishMemberAvatar.ts";
import { readMemberRefs } from "../../src/archive/readMemberRefs.ts";
import { getMeDtoFromMemberId } from "../../src/members/getMeDtoFromMemberId.ts";
import { describe, expect, it } from "vitest";
import { sql } from "kysely";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";

const body = {
  expectedAvatarId: null,
  contentType: "image/jpeg",
  byteSize: 1024,
  crop: { centerX: 0.5, centerY: 0.5, zoom: 1 },
};
const unknownId = "019f1234-0000-7000-8000-000000000009";
describe("private avatar lifecycle", () => {
  it("allows incomplete viewers to reserve immutable own keys and keeps reads private and nullable", async () => {
    const { app, database, close } = await createTestApp();
    try {
      const viewer = await insertSignedInMember({
        database,
        member: {
          role: "viewer",
          display_name: null,
          profile_completed_at: null,
        },
      });
      const headers = { cookie: viewer.cookie };
      const reservation = await app.inject({
        method: "POST",
        url: "/api/me/avatar-uploads",
        headers,
        payload: body,
      });
      expect(reservation.statusCode).toBe(201);
      expect(reservation.json().expiresAt).toBe(
        new Date(Date.parse(NOW) + 600000).toISOString(),
      );
      const row = await database
        .selectFrom("member_avatar_uploads")
        .selectAll()
        .executeTakeFirstOrThrow();
      expect(row.storage_key).toBe(
        `avatars/${viewer.memberId}/${reservation.json().avatarId}.webp`,
      );
      expect(row.member_id).toBe(viewer.memberId);
      expect(await database.selectFrom("items").selectAll().execute()).toEqual(
        [],
      );
      expect(
        await database.selectFrom("upload_sessions").selectAll().execute(),
      ).toEqual([]);
      expect(
        await database.selectFrom("outbound_emails").selectAll().execute(),
      ).toEqual([]);
      for (const memberId of [viewer.memberId, unknownId]) {
        const response = await app.inject({
          method: "GET",
          url: `/api/members/${memberId}/avatar`,
          headers,
        });
        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ avatar: null });
      }
      expect(
        (
          await app.inject({
            method: "GET",
            url: `/api/members/${viewer.memberId}/avatar`,
          })
        ).statusCode,
      ).toBe(401);
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/me/avatar-uploads",
            headers,
            payload: { ...body, byteSize: 10485761 },
          })
        ).statusCode,
      ).toBe(400);
    } finally {
      await close();
    }
  });
});

async function fixture() {
  const context = await createTestApp();
  const owner = await insertSignedInMember({
    database: context.database,
    member: { role: "viewer" },
  });
  const other = await insertSignedInMember({
    database: context.database,
    token: "other",
    member: { role: "admin" },
  });
  const reserve = async (expectedAvatarId: string | null = null) => {
    const response = await context.app.inject({
      method: "POST",
      url: "/api/me/avatar-uploads",
      headers: { cookie: owner.cookie },
      payload: { ...body, expectedAvatarId },
    });
    expect(response.statusCode).toBe(201);
    return response.json().avatarId as string;
  };
  const publish = async (avatarId: string, memberId = owner.memberId) => {
    // A2 owns raw-byte validation/storage. This models its durable claim, not a successful HTTP PUT.
    await context.database
      .updateTable("member_avatar_uploads")
      .set({ state: "uploading" })
      .where("id", "=", avatarId)
      .where("state", "=", "reserved")
      .execute();
    await publishMemberAvatar({
      database: context.database,
      memberId,
      avatarId,
      outputByteSize: 1234,
      now: NOW,
    });
  };
  const current = async () => {
    return (
      await context.database
        .selectFrom("members")
        .select("avatar_id")
        .where("id", "=", owner.memberId)
        .executeTakeFirstOrThrow()
    ).avatar_id;
  };
  return { ...context, owner, other, reserve, publish, current };
}

describe("atomic avatar publication", () => {
  it("hides other owners' uploads exactly like missing IDs and publishes idempotently without storage I/O", async () => {
    const context = await fixture();
    try {
      const avatarId = await context.reserve();
      for (const candidate of [avatarId, unknownId])
        await expect(
          context.publish(candidate, context.other.memberId),
        ).rejects.toMatchObject({
          statusCode: 404,
          code: "avatar_upload_not_found",
        });
      expect(await context.current()).toBeNull();
      await context.publish(avatarId);
      await context.publish(avatarId);
      expect(await context.current()).toBe(avatarId);
      expect(context.b2.calls).not.toContain("putObject");
      expect(
        await context.database
          .selectFrom("pending_object_deletions")
          .selectAll()
          .execute(),
      ).toEqual([]);
    } finally {
      await context.close();
    }
  });
  it("preserves the winner when two reserved uploads race and refuses stale removals", async () => {
    const context = await fixture();
    try {
      const older = await context.reserve();
      const newer = await context.reserve();
      await context.publish(newer);
      await expect(context.publish(older)).rejects.toMatchObject({
        statusCode: 409,
        code: "avatar_changed",
      });
      const stale = await context.app.inject({
        method: "DELETE",
        url: "/api/me/avatar",
        headers: { cookie: context.owner.cookie },
        payload: { expectedAvatarId: null },
      });
      expect(stale.statusCode).toBe(409);
      expect(stale.json().error).toBe("avatar_changed");
      expect(await context.current()).toBe(newer);
      const staleReservation = await context.app.inject({
        method: "POST",
        url: "/api/me/avatar-uploads",
        headers: { cookie: context.owner.cookie },
        payload: body,
      });
      expect(staleReservation.statusCode).toBe(409);
      expect(staleReservation.json().error).toBe("avatar_changed");
      expect(
        await context.database
          .selectFrom("pending_object_deletions")
          .selectAll()
          .execute(),
      ).toEqual([]);
    } finally {
      await context.close();
    }
  });
  it("rolls back replacement and removal if durable cleanup enqueue fails", async () => {
    const context = await fixture();
    try {
      const initial = await context.reserve();
      await context.publish(initial);
      const replacement = await context.reserve(initial);
      await sql`create trigger fail_avatar_cleanup before insert on pending_object_deletions begin select raise(abort, 'cleanup failure'); end`.execute(
        context.database,
      );
      await expect(context.publish(replacement)).rejects.toThrow(
        "cleanup failure",
      );
      expect(await context.current()).toBe(initial);
      expect(
        (
          await context.database
            .selectFrom("member_avatar_uploads")
            .select("state")
            .where("id", "=", initial)
            .executeTakeFirstOrThrow()
        ).state,
      ).toBe("published");
      expect(
        (
          await context.database
            .selectFrom("member_avatar_uploads")
            .select("state")
            .where("id", "=", replacement)
            .executeTakeFirstOrThrow()
        ).state,
      ).toBe("uploading");
      const response = await context.app.inject({
        method: "DELETE",
        url: "/api/me/avatar",
        headers: { cookie: context.owner.cookie },
        payload: { expectedAvatarId: initial },
      });
      expect(response.statusCode).toBe(500);
      expect(await context.current()).toBe(initial);
      await sql`drop trigger fail_avatar_cleanup`.execute(context.database);
      await context.publish(replacement);
      await expect(
        context.database
          .deleteFrom("member_avatar_uploads")
          .where("id", "=", replacement)
          .execute(),
      ).rejects.toThrow(/foreign key/i);
      await context.database
        .deleteFrom("member_avatar_uploads")
        .where("id", "=", initial)
        .execute();
      expect(
        (
          await context.database
            .selectFrom("member_avatar_uploads")
            .select("expected_avatar_id")
            .where("id", "=", replacement)
            .executeTakeFirstOrThrow()
        ).expected_avatar_id,
      ).toBe(initial);
      const queued = await context.database
        .selectFrom("pending_object_deletions")
        .select("storage_key")
        .execute();
      expect(queued).toEqual([
        { storage_key: `avatars/${context.owner.memberId}/${initial}.webp` },
      ]);
      const removed = await context.app.inject({
        method: "DELETE",
        url: "/api/me/avatar",
        headers: { cookie: context.owner.cookie },
        payload: { expectedAvatarId: replacement },
      });
      expect(removed.statusCode).toBe(200);
      expect(removed.json().me.member.avatar).toBeNull();
    } finally {
      await context.close();
    }
  });
  it("requires a live claimed upload and active owner, leaving current images unchanged", async () => {
    const context = await fixture();
    try {
      const avatarId = await context.reserve();
      await expect(
        publishMemberAvatar({
          database: context.database,
          memberId: context.owner.memberId,
          avatarId,
          outputByteSize: 1234,
          now: NOW,
        }),
      ).rejects.toMatchObject({ statusCode: 410 });
      await context.database
        .updateTable("member_avatar_uploads")
        .set({ state: "uploading" })
        .where("id", "=", avatarId)
        .execute();
      await expect(
        publishMemberAvatar({
          database: context.database,
          memberId: context.owner.memberId,
          avatarId,
          outputByteSize: 1234,
          now: "2026-09-27T10:10:00.000Z",
        }),
      ).rejects.toMatchObject({ statusCode: 410 });
      expect(await context.current()).toBeNull();
    } finally {
      await context.close();
    }
  });
  it("retains historical avatars on account removal and signs current sources consistently on every central read", async () => {
    const context = await fixture();
    try {
      const avatarId = await context.reserve();
      await context.publish(avatarId);
      const now = "2026-09-27T10:00:00.999Z";
      const members = await readMemberRefs({
        database: context.database,
        b2: context.b2,
        now,
      });
      const avatar = members.get(context.owner.memberId)?.avatar;
      expect(avatar).toMatchObject({
        avatarId,
        issuedAt: "2026-09-27T10:00:00.000Z",
        expiresAt: "2026-09-27T11:00:00.000Z",
      });
      expect(new URL(avatar!.url).searchParams.get("issuedAt")).toBe(
        avatar!.issuedAt,
      );
      expect(new URL(avatar!.url).searchParams.get("expiresInSeconds")).toBe(
        "3600",
      );
      expect(
        (
          await getMeDtoFromMemberId({
            database: context.database,
            b2: context.b2,
            memberId: context.owner.memberId,
            now,
          })
        ).member.avatar,
      ).toEqual(avatar);
      const removal = await context.app.inject({
        method: "DELETE",
        url: `/api/members/${context.owner.memberId}`,
        headers: { cookie: context.other.cookie },
      });
      expect(removal.statusCode).toBe(200);
      expect(await context.current()).toBe(avatarId);
      expect(
        await context.database
          .selectFrom("pending_object_deletions")
          .selectAll()
          .execute(),
      ).toEqual([]);
      const retained = await context.app.inject({
        method: "GET",
        url: `/api/members/${context.owner.memberId}/avatar`,
        headers: { cookie: context.other.cookie },
      });
      expect(retained.statusCode).toBe(200);
      expect(retained.json().avatar.avatarId).toBe(avatarId);
      const renewed = await readMemberRefs({
        database: context.database,
        b2: context.b2,
        now: "2026-09-27T11:01:00.999Z",
      });
      expect(renewed.get(context.owner.memberId)?.avatar).toMatchObject({
        issuedAt: "2026-09-27T11:01:00.000Z",
        expiresAt: "2026-09-27T12:01:00.000Z",
      });
      expect(renewed.get(context.owner.memberId)?.avatar?.url).not.toBe(
        avatar!.url,
      );
      expect(
        (
          await context.app.inject({
            method: "GET",
            url: "/api/me",
            headers: { cookie: context.owner.cookie },
          })
        ).statusCode,
      ).toBe(401);
    } finally {
      await context.close();
    }
  });
});

it("hydrates comment authors in fixed batches as comment counts grow", async () => {
  const context = await fixture();
  try {
    const avatarId = await context.reserve();
    await context.publish(avatarId);
    const itemId = await insertItem(context.database, {
      uploadedBy: context.owner.memberId,
    });
    const counted = makeQueryCountingDatabaseFromDatabase(context.database);
    const read = async () => {
      const members = await readMemberRefs({
        database: counted.database,
        b2: context.b2,
        now: NOW,
      });
      return readCommentThread({
        database: counted.database,
        itemId,
        viewer: makeViewer({
          memberId: context.other.memberId,
          role: "admin",
          isAdmin: true,
        }),
        members,
      });
    };
    await insertComment(context.database, {
      itemId,
      authorMemberId: context.owner.memberId,
    });
    counted.reset();
    const initial = await read();
    const queryCount = counted.getQueryCount();
    expect(initial[0]?.author.avatar?.avatarId).toBe(avatarId);
    for (let index = 0; index < 15; index += 1)
      await insertComment(context.database, {
        itemId,
        authorMemberId: context.owner.memberId,
      });
    counted.reset();
    const expanded = await read();
    expect(counted.getQueryCount()).toBe(queryCount);
    expect(expanded).toHaveLength(16);
    expect(
      expanded.every((comment) => {
        return comment.author.avatar?.avatarId === avatarId;
      }),
    ).toBe(true);
  } finally {
    await context.close();
  }
});

it("hydrates the same chosen avatar in secondary directory, presence, group, milestone and settings responses", async () => {
  const context = await fixture();
  try {
    const avatarId = await context.reserve();
    await context.publish(avatarId);
    const headers = { cookie: context.other.cookie };
    const admin = (
      await context.app.inject({ method: "GET", url: "/api/members", headers })
    ).json();
    expect(
      admin.members.find((member: { memberId: string }) => {
        return member.memberId === context.owner.memberId;
      }).avatar.avatarId,
    ).toBe(avatarId);
    const presence = (
      await context.app.inject({ method: "GET", url: "/api/presence", headers })
    ).json();
    expect(
      presence.presence.find((row: { member: { memberId: string } }) => {
        return row.member.memberId === context.owner.memberId;
      }).member.avatar.avatarId,
    ).toBe(avatarId);
    const group = await context.app.inject({
      method: "POST",
      url: "/api/groups",
      headers,
      payload: { name: "Avatar group", memberIds: [context.owner.memberId] },
    });
    expect(group.statusCode).toBe(201);
    expect(group.json().members[0].avatar.avatarId).toBe(avatarId);
    const membership = await context.app.inject({
      method: "PUT",
      url: `/api/groups/${group.json().groupId}/members`,
      headers,
      payload: { memberIds: [] },
    });
    expect(membership.statusCode).toBe(200);
    const audit = await context.database
      .selectFrom("activity_events")
      .select("detail_json")
      .where("kind", "=", "group_membership_changed")
      .executeTakeFirstOrThrow();
    expect(audit.detail_json).not.toContain("avatar");
    expect(audit.detail_json).not.toContain("https:");
    await context.app.inject({
      method: "PUT",
      url: `/api/groups/${group.json().groupId}/members`,
      headers,
      payload: { memberIds: [context.owner.memberId] },
    });
    const ruleId = await insertVisibilityRule(context.database, {
      mode: "except",
    });
    await insertVisibilityRuleSubject(context.database, {
      ruleId,
      groupId: group.json().groupId,
    });
    await insertItem(context.database, {
      uploadedBy: context.other.memberId,
      visibility_rule_id: ruleId,
    });
    const usage = await context.app.inject({
      method: "GET",
      url: `/api/groups/${group.json().groupId}/usage`,
      headers,
    });
    expect(usage.json().membersGainingAccess[0].avatar.avatarId).toBe(avatarId);
    const deletion = await context.app.inject({
      method: "DELETE",
      url: `/api/groups/${group.json().groupId}?confirmationToken=${encodeURIComponent(usage.json().confirmationToken)}`,
      headers,
    });
    expect(deletion.statusCode).toBe(204);
    const deletionAudit = await context.database
      .selectFrom("activity_events")
      .select("detail_json")
      .where("kind", "=", "group_deleted")
      .executeTakeFirstOrThrow();
    expect(deletionAudit.detail_json).not.toContain("avatar");
    await context.database
      .updateTable("members")
      .set({ role: "admin" })
      .where("id", "=", context.owner.memberId)
      .execute();
    const ownerHeaders = { cookie: context.owner.cookie };
    const milestone = await context.app.inject({
      method: "POST",
      url: "/api/milestones",
      headers: ownerHeaders,
      payload: {
        name: "Avatar occasion",
        startsOn: "2026-09-27",
        endsOn: "2026-09-27",
        blurb: null,
      },
    });
    expect(milestone.statusCode).toBe(201);
    expect(milestone.json().createdBy.avatar.avatarId).toBe(avatarId);
    const settings = await context.app.inject({
      method: "PATCH",
      url: "/api/settings",
      headers: ownerHeaders,
      payload: { shoebox: { name: "Avatar Shoebox" } },
    });
    expect(settings.statusCode).toBe(200);
    expect(
      settings.json().changedBy.find((row: { key: string }) => {
        return row.key === "shoebox.name";
      }).updatedBy.avatar.avatarId,
    ).toBe(avatarId);
  } finally {
    await context.close();
  }
});
