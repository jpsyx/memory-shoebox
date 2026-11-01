import {
  readAvatarCommentThread,
  expectCreatorAvatar,
  expectDirectoryAvatar,
  expectGroupDeletionAvatar,
  expectGroupMembershipAvatarAudit,
  expectRemovedOwnerAvatar,
  getVerifiedAvatarFromContext,
} from "./avatarIdentityScenarioHelpers.ts";
import {
  insertComment,
  insertItem,
} from "../helpers/seedHelpers/seedHelpers.ts";
import { makeQueryCountingDatabaseFromDatabase } from "../helpers/makeQueryCountingDatabaseFromDatabase.ts";
import { readMemberRefs } from "../../src/archive/readMemberRefs.ts";
import { expect, it } from "vitest";
import { createAvatarLifecycleFixture } from "./avatarLifecycleTestHelpers.ts";

it("retains historical avatars on account removal and signs current sources consistently on every central read", async () => {
  const context = await createAvatarLifecycleFixture();
  try {
    const avatarId = await context.reserve();
    await context.publish(avatarId);
    const avatar = await getVerifiedAvatarFromContext({ context, avatarId });
    await expectRemovedOwnerAvatar({ context, avatarId });
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

it("hydrates comment authors in fixed batches as comment counts grow", async () => {
  const context = await createAvatarLifecycleFixture();
  try {
    const avatarId = await context.reserve();
    await context.publish(avatarId);
    const itemId = await insertItem(context.database, {
      uploadedBy: context.owner.memberId,
    });
    const counted = makeQueryCountingDatabaseFromDatabase(context.database);
    const read = () => {
      return readAvatarCommentThread({ context, counted, itemId });
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
  const context = await createAvatarLifecycleFixture();
  try {
    const avatarId = await context.reserve();
    await context.publish(avatarId);
    const headers = { cookie: context.other.cookie };
    await expectDirectoryAvatar({ context, avatarId, headers });
    const group = await context.app.inject({
      method: "POST",
      url: "/api/groups",
      headers,
      payload: { name: "Avatar group", memberIds: [context.owner.memberId] },
    });
    expect(group.statusCode).toBe(201);
    expect(group.json().members[0].avatar.avatarId).toBe(avatarId);
    await expectGroupMembershipAvatarAudit({
      context,
      headers,
      groupId: group.json().groupId,
    });
    await expectGroupDeletionAvatar({
      context,
      avatarId,
      headers,
      groupId: group.json().groupId,
    });
    await expectCreatorAvatar({ context, avatarId });
  } finally {
    await context.close();
  }
});
