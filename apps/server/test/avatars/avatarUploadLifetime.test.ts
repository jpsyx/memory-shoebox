import { expect, it } from "vitest";
import {
  createAvatarUploadFixture,
  holdPut,
} from "./avatarUploadTestHelpers.ts";

it("re-arms deletion after an expired writer lands beyond an earlier 404 cleanup", async () => {
  const context = await createAvatarUploadFixture();
  const avatarId = await context.reserve();
  const held = await holdPut(context, avatarId);
  const now = "2026-09-27T10:11:00.000Z";
  context.advance(now);
  await context.app.jobRunner.runOnce("avatar-reservation-sweep");
  await context.app.jobRunner.runOnce("object-deletion-drain");
  const tombstone = await context.database
    .selectFrom("pending_object_deletions")
    .selectAll()
    .executeTakeFirstOrThrow();
  expect(tombstone.last_attempted_at).toBe(now);
  held.release();
  expect((await held.pending).statusCode).toBe(410);
  expect(context.b2.storedObjects.has(tombstone.storage_key)).toBe(true);
  expect(
    (
      await context.database
        .selectFrom("pending_object_deletions")
        .selectAll()
        .executeTakeFirstOrThrow()
    ).last_attempted_at,
  ).toBeNull();
  await context.app.jobRunner.runOnce("object-deletion-drain");
  expect(context.b2.storedObjects.has(tombstone.storage_key)).toBe(false);
  expect((await context.upload(avatarId)).statusCode).toBe(410);
});

it("rejects publication after owner removal and retains the previously chosen avatar", async () => {
  const context = await createAvatarUploadFixture();
  const previous = await context.reserve();
  expect((await context.upload(previous)).statusCode).toBe(200);
  const avatarId = await context.reserve(previous);
  const held = await holdPut(context, avatarId);
  await context.database
    .updateTable("members")
    .set({ status: "removed" })
    .where("id", "=", context.owner.memberId)
    .execute();
  held.release();
  expect((await held.pending).statusCode).toBe(404);
  expect(
    (
      await context.database
        .selectFrom("members")
        .select("avatar_id")
        .where("id", "=", context.owner.memberId)
        .executeTakeFirstOrThrow()
    ).avatar_id,
  ).toBe(previous);
  await context.app.jobRunner.runOnce("object-deletion-drain");
  expect(
    context.b2.storedObjects.has(
      `avatars/${context.owner.memberId}/${previous}.webp`,
    ),
  ).toBe(true);
  expect(
    context.b2.storedObjects.has(
      `avatars/${context.owner.memberId}/${avatarId}.webp`,
    ),
  ).toBe(false);
});

it("retires pending work when removing an already-empty avatar and rejects its late PUT", async () => {
  const context = await createAvatarUploadFixture();
  const avatarId = await context.reserve();
  const held = await holdPut(context, avatarId);
  const response = await context.app.inject({
    method: "DELETE",
    url: "/api/me/avatar",
    headers: { cookie: context.owner.cookie },
    payload: { expectedAvatarId: null },
  });
  expect(response.statusCode).toBe(200);
  expect(
    (
      await context.database
        .selectFrom("member_avatar_uploads")
        .select("state")
        .where("id", "=", avatarId)
        .executeTakeFirstOrThrow()
    ).state,
  ).toBe("retired");
  held.release();
  expect((await held.pending).statusCode).toBe(410);
  await context.app.jobRunner.runOnce("object-deletion-drain");
  expect(context.b2.storedObjects.size).toBe(0);
});

it("keeps pending reservations intact when removal presents a stale expected pointer", async () => {
  const context = await createAvatarUploadFixture();
  const current = await context.reserve();
  await context.upload(current);
  const pending = await context.reserve(current);
  const response = await context.app.inject({
    method: "DELETE",
    url: "/api/me/avatar",
    headers: { cookie: context.owner.cookie },
    payload: { expectedAvatarId: null },
  });
  expect(response.statusCode).toBe(409);
  expect(
    (
      await context.database
        .selectFrom("member_avatar_uploads")
        .select("state")
        .where("id", "=", pending)
        .executeTakeFirstOrThrow()
    ).state,
  ).toBe("reserved");
  expect((await context.upload(pending)).statusCode).toBe(200);
});
