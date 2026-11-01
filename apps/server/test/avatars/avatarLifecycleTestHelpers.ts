import { expect } from "vitest";
import { publishMemberAvatar } from "../../src/avatars/memberAvatarWriteHelpers.ts";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import { NOW } from "../helpers/seedHelpers/seedHelpers.ts";

/** Shared avatar request for focused local regression scenarios. */
export const AVATAR_REQUEST = {
  expectedAvatarId: null,
  contentType: "image/jpeg",
  byteSize: 1024,
  crop: { centerX: 0.5, centerY: 0.5, zoom: 1 },
};

/** Shared unknown avatar id for focused local regression scenarios. */
export const UNKNOWN_AVATAR_ID = "019f1234-0000-7000-8000-000000000009";

/**
 * Shared create avatar lifecycle fixture for focused local regression
 * scenarios.
 */
type Fixture = Awaited<ReturnType<typeof createTestApp>> & {
  owner: Awaited<ReturnType<typeof insertSignedInMember>>;
  other: Awaited<ReturnType<typeof insertSignedInMember>>;
  reserve: (expectedAvatarId?: string | null) => Promise<string>;
  publish: (avatarId: string, memberId?: string) => Promise<void>;
  current: () => Promise<string | null>;
};

/** Creates two owners with real transactional avatar operations. */
export async function createAvatarLifecycleFixture(): Promise<Fixture> {
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
      payload: { ...AVATAR_REQUEST, expectedAvatarId },
    });
    expect(response.statusCode).toBe(201);
    return response.json().avatarId as string;
  };
  const publish = async (avatarId: string, memberId = owner.memberId) => {
    // A2 owns raw-byte validation/storage. This models its durable claim,
    // not a successful HTTP PUT.
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
