import { afterEach, expect, it } from "vitest";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import { NOW } from "../helpers/seedHelpers/seedHelpers.ts";
import { reserveMemberAvatar } from "../../src/avatars/reserveMemberAvatar.ts";
import { isStorageKeyInUse } from "../../src/upload/isStorageKeyInUse.ts";
import { runObjectDeletionDrain } from "../../src/jobs/runObjectDeletionDrain.ts";

const contexts: Array<Awaited<ReturnType<typeof createTestApp>>> = [];
afterEach(async () => {
  await Promise.all(
    contexts.splice(0).map((context) => {
      return context.close();
    }),
  );
});
async function fixture(startBackgroundWork = false) {
  let instant = NOW;
  const context = await createTestApp({
    clock: () => {
      return new Date(instant);
    },
    startBackgroundWork,
  });
  contexts.push(context);
  const member = await insertSignedInMember({ database: context.database });
  const reservation = await reserveMemberAvatar({
    database: context.database,
    memberId: member.memberId,
    now: NOW,
    body: {
      contentType: "image/png",
      byteSize: 10,
      crop: { centerX: 0.5, centerY: 0.5, zoom: 1 },
      expectedAvatarId: null,
    },
  });
  const storageKey = `avatars/${member.memberId}/${reservation.avatarId}.webp`;
  return {
    ...context,
    ...reservation,
    member,
    storageKey,
    advance: (value: string) => {
      instant = value;
    },
  };
}
it.each(["reserved", "uploading"] as const)(
  "protects live %s ownership and recovers crash after PUT at expiry",
  async (state) => {
    const context = await fixture();
    await context.database
      .updateTable("member_avatar_uploads")
      .set({ state })
      .execute();
    expect(
      await isStorageKeyInUse({
        database: context.database,
        storageKey: context.storageKey,
      }),
    ).toBe(true);
    await context.b2.putObject({
      key: context.storageKey,
      body: Buffer.from("orphan"),
      contentType: "image/webp",
    });
    context.advance("2026-09-27T10:11:00.000Z");
    await context.app.jobRunner.runOnce("avatar-reservation-sweep");
    expect(
      await context.database
        .selectFrom("member_avatar_uploads")
        .select("state")
        .executeTakeFirst(),
    ).toEqual({ state: "retired" });
    await runObjectDeletionDrain({
      ...context,
      now: "2026-09-27T10:11:00.000Z",
    });
    expect(context.b2.storedObjects.has(context.storageKey)).toBe(false);
  },
);
it("protects a current pointer even if its row's state is retired", async () => {
  const context = await fixture();
  await context.database
    .updateTable("members")
    .set({ avatar_id: context.avatarId })
    .where("id", "=", context.member.memberId)
    .execute();
  await context.database
    .updateTable("member_avatar_uploads")
    .set({ state: "retired" })
    .execute();
  expect(
    await isStorageKeyInUse({
      database: context.database,
      storageKey: context.storageKey,
    }),
  ).toBe(true);
});

it("sweeps an expired reservation when the application becomes ready", async () => {
  const context = await fixture(true);
  context.advance("2026-09-27T10:11:00.000Z");
  await context.app.ready();
  expect(
    (
      await context.database
        .selectFrom("member_avatar_uploads")
        .select("state")
        .executeTakeFirstOrThrow()
    ).state,
  ).toBe("retired");
});

it("retains cleanup tombstones for a writer that crashes before re-enqueuing", async () => {
  const context = await fixture();
  context.advance("2026-09-27T10:11:00.000Z");
  await context.app.jobRunner.runOnce("avatar-reservation-sweep");
  await context.app.jobRunner.runOnce("object-deletion-drain");
  expect(
    await context.database
      .selectFrom("pending_object_deletions")
      .selectAll()
      .execute(),
  ).toHaveLength(1);
  await context.b2.putObject({
    key: context.storageKey,
    body: Buffer.from("late writer"),
    contentType: "image/webp",
  });
  context.advance("2026-09-29T10:11:00.000Z");
  await context.app.jobRunner.runOnce("object-deletion-drain");
  expect(context.b2.storedObjects.has(context.storageKey)).toBe(false);
  expect(
    await context.database
      .selectFrom("pending_object_deletions")
      .selectAll()
      .execute(),
  ).toHaveLength(1);
});
