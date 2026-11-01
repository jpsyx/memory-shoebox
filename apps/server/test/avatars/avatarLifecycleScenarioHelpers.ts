import { NOW } from "../helpers/seedHelpers/seedHelpers.ts";
import { expect } from "vitest";
import { sql } from "kysely";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import {
  AVATAR_REQUEST,
  createAvatarLifecycleFixture,
  UNKNOWN_AVATAR_ID,
} from "./avatarLifecycleTestHelpers.ts";

/** Checks CleanupFailureRollback within the same atomic scenario. */
export async function expectCleanupFailureRollback({
  context,
  initial,
  replacement,
}: Readonly<{
  context: Awaited<ReturnType<typeof createAvatarLifecycleFixture>>;
  initial: string;
  replacement: string;
}>): Promise<void> {
  await sql`create trigger fail_avatar_cleanup before insert on pending_object_deletions begin select raise(abort, 'cleanup failure'); end`.execute(
    context.database,
  );
  await expect(context.publish(replacement)).rejects.toThrow("cleanup failure");
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
}

/** Checks RetiredAvatarCleanup within the same atomic scenario. */
export async function expectRetiredAvatarCleanup({
  context,
  initial,
  replacement,
}: Readonly<{
  context: Awaited<ReturnType<typeof createAvatarLifecycleFixture>>;
  initial: string;
  replacement: string;
}>): Promise<void> {
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
}

/** Checks PrivateReservation within the same atomic scenario. */
export async function expectPrivateReservation({
  app,
  database,
  viewer,
  headers,
}: Readonly<{
  app: Awaited<ReturnType<typeof createTestApp>>["app"];
  database: Awaited<ReturnType<typeof createTestApp>>["database"];
  viewer: Awaited<ReturnType<typeof insertSignedInMember>>;
  headers: { cookie: string };
}>): Promise<void> {
  const reservation = await app.inject({
    method: "POST",
    url: "/api/me/avatar-uploads",
    headers,
    payload: AVATAR_REQUEST,
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
  expect(await database.selectFrom("items").selectAll().execute()).toEqual([]);
  expect(
    await database.selectFrom("upload_sessions").selectAll().execute(),
  ).toEqual([]);
  expect(
    await database.selectFrom("outbound_emails").selectAll().execute(),
  ).toEqual([]);
}

/** Checks EmptyPrivateReads within the same atomic scenario. */
export async function expectEmptyPrivateReads({
  app,
  viewer,
  headers,
}: Readonly<{
  app: Awaited<ReturnType<typeof createTestApp>>["app"];
  viewer: Awaited<ReturnType<typeof insertSignedInMember>>;
  headers: { cookie: string };
}>): Promise<void> {
  for (const memberId of [viewer.memberId, UNKNOWN_AVATAR_ID]) {
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
        payload: { ...AVATAR_REQUEST, byteSize: 10485761 },
      })
    ).statusCode,
  ).toBe(400);
}
