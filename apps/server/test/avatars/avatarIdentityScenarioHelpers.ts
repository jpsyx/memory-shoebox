import {
  NOW,
  insertItem,
  insertVisibilityRule,
  insertVisibilityRuleSubject,
} from "../helpers/seedHelpers/seedHelpers.ts";
import { makeQueryCountingDatabaseFromDatabase } from "../helpers/makeQueryCountingDatabaseFromDatabase.ts";
import { makeViewer } from "../helpers/makeViewer.ts";
import { readCommentThread } from "../../src/items/readCommentThread.ts";
import type { MemberRef } from "@memory-shoebox/shared";
import { readMemberRefs } from "../../src/archive/readMemberRefs.ts";
import { getMeDtoFromMemberId } from "../../src/members/getMeDtoFromMemberId.ts";
import { expect } from "vitest";
import { createAvatarLifecycleFixture } from "./avatarLifecycleTestHelpers.ts";

/** Checks DirectoryAvatar within the same atomic scenario. */
export async function expectDirectoryAvatar({
  context,
  avatarId,
  headers,
}: Readonly<{
  context: Awaited<ReturnType<typeof createAvatarLifecycleFixture>>;
  avatarId: string;
  headers: { cookie: string };
}>): Promise<void> {
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
}

/** Checks CreatorAvatar within the same atomic scenario. */
export async function expectCreatorAvatar({
  context,
  avatarId,
}: Readonly<{
  context: Awaited<ReturnType<typeof createAvatarLifecycleFixture>>;
  avatarId: string;
}>): Promise<void> {
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
}

/** Checks GroupMembershipAvatarAudit within the same atomic scenario. */
export async function expectGroupMembershipAvatarAudit({
  context,
  headers,
  groupId,
}: Readonly<{
  context: Awaited<ReturnType<typeof createAvatarLifecycleFixture>>;
  headers: { cookie: string };
  groupId: string;
}>): Promise<void> {
  const membership = await context.app.inject({
    method: "PUT",
    url: `/api/groups/${groupId}/members`,
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
    url: `/api/groups/${groupId}/members`,
    headers,
    payload: { memberIds: [context.owner.memberId] },
  });
}

/** Checks GroupDeletionAvatar within the same atomic scenario. */
export async function expectGroupDeletionAvatar({
  context,
  avatarId,
  headers,
  groupId,
}: Readonly<{
  context: Awaited<ReturnType<typeof createAvatarLifecycleFixture>>;
  avatarId: string;
  headers: { cookie: string };
  groupId: string;
}>): Promise<void> {
  const ruleId = await insertVisibilityRule(context.database, {
    mode: "except",
  });
  await insertVisibilityRuleSubject(context.database, {
    ruleId,
    groupId: groupId,
  });
  await insertItem(context.database, {
    uploadedBy: context.other.memberId,
    visibility_rule_id: ruleId,
  });
  const usage = await context.app.inject({
    method: "GET",
    url: `/api/groups/${groupId}/usage`,
    headers,
  });
  expect(usage.json().membersGainingAccess[0].avatar.avatarId).toBe(avatarId);
  const deletion = await context.app.inject({
    method: "DELETE",
    url: `/api/groups/${groupId}?confirmationToken=${encodeURIComponent(usage.json().confirmationToken)}`,
    headers,
  });
  expect(deletion.statusCode).toBe(204);
  const deletionAudit = await context.database
    .selectFrom("activity_events")
    .select("detail_json")
    .where("kind", "=", "group_deleted")
    .executeTakeFirstOrThrow();
  expect(deletionAudit.detail_json).not.toContain("avatar");
}

/** Checks RemovedOwnerAvatar within the same atomic scenario. */
export async function expectRemovedOwnerAvatar({
  context,
  avatarId,
}: Readonly<{
  context: Awaited<ReturnType<typeof createAvatarLifecycleFixture>>;
  avatarId: string;
}>): Promise<void> {
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
}

/** Reads the same signed image through directory and self projections. */
export async function getVerifiedAvatarFromContext({
  context,
  avatarId,
}: Readonly<{
  context: Awaited<ReturnType<typeof createAvatarLifecycleFixture>>;
  avatarId: string;
}>): Promise<MemberRef["avatar"] | undefined> {
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
  return avatar;
}

/** Reads real comment authors through the counted hydration queries. */
export async function readAvatarCommentThread({
  context,
  counted,
  itemId,
}: Readonly<{
  context: Awaited<ReturnType<typeof createAvatarLifecycleFixture>>;
  counted: ReturnType<typeof makeQueryCountingDatabaseFromDatabase>;
  itemId: string;
}>): ReturnType<typeof readCommentThread> {
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
}
