import { NOW } from "../helpers/seedHelpers/seedHelpers.ts";
import {
  expectCleanupFailureRollback,
  expectEmptyPrivateReads,
  expectPrivateReservation,
  expectRetiredAvatarCleanup,
} from "./avatarLifecycleScenarioHelpers.ts";
import { publishMemberAvatar } from "../../src/avatars/memberAvatarWriteHelpers.ts";
import { expect, it } from "vitest";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import {
  AVATAR_REQUEST,
  createAvatarLifecycleFixture,
  UNKNOWN_AVATAR_ID,
} from "./avatarLifecycleTestHelpers.ts";

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
    await expectPrivateReservation({ app, database, viewer, headers });
    await expectEmptyPrivateReads({ app, viewer, headers });
  } finally {
    await close();
  }
});

it("hides other owners' uploads exactly like missing IDs and publishes idempotently without storage I/O", async () => {
  const context = await createAvatarLifecycleFixture();
  try {
    const avatarId = await context.reserve();
    for (const candidate of [avatarId, UNKNOWN_AVATAR_ID])
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
  const context = await createAvatarLifecycleFixture();
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
      payload: AVATAR_REQUEST,
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
  const context = await createAvatarLifecycleFixture();
  try {
    const initial = await context.reserve();
    await context.publish(initial);
    const replacement = await context.reserve(initial);
    await expectCleanupFailureRollback({ context, initial, replacement });
    await expectRetiredAvatarCleanup({ context, initial, replacement });
    const removed = await context.app.inject({
      method: "DELETE",
      url: "/api/me/avatar",
      headers: { cookie: context.owner.cookie },
      payload: { expectedAvatarId: replacement },
    });
    expect(removed.statusCode).toBe(200);
    expect(removed.json().sessionId).toBe(context.owner.sessionId);
    expect(removed.json().me.member.avatar).toBeNull();
  } finally {
    await context.close();
  }
});

it("requires a live claimed upload, leaving current images unchanged", async () => {
  const context = await createAvatarLifecycleFixture();
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
