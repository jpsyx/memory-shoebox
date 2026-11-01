import sharp from "sharp";
import { expect, it } from "vitest";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import { createAvatarUploadFixture } from "./avatarUploadTestHelpers.ts";

it("publishes a viewer's real binary image and replays without another PUT", async () => {
  const context = await createAvatarUploadFixture();
  const avatarId = await context.reserve();
  let uploadedBytes: Uint8Array | undefined;
  const put = context.b2.putObject;
  context.b2.putObject = async (options) => {
    uploadedBytes = options.body;
    await put(options);
  };
  const response = await context.upload(avatarId);
  expect(response.statusCode).toBe(200);
  expect(response.json().sessionId).toBe(context.owner.sessionId);
  expect(response.json().me.member.avatar.avatarId).toBe(avatarId);
  const key = `avatars/${context.owner.memberId}/${avatarId}.webp`;
  expect(context.b2.storedObjects.get(key)?.contentType).toBe("image/webp");
  expect(await sharp(uploadedBytes!).metadata()).toMatchObject({
    format: "webp",
    width: 256,
    height: 256,
  });
  const putCount = context.b2.calls.filter((call) => {
    return call.startsWith("putObject");
  }).length;
  expect((await context.upload(avatarId)).statusCode).toBe(200);
  expect(
    context.b2.calls.filter((call) => {
      return call.startsWith("putObject");
    }),
  ).toHaveLength(putCount);
  expect(
    await context.database.selectFrom("items").selectAll().execute(),
  ).toEqual([]);
  expect(
    await context.database.selectFrom("outbound_emails").selectAll().execute(),
  ).toEqual([]);
});

it.each(["image/jpeg", "image/svg+xml", "image/heic"])(
  "retires a MIME-mismatched %s request",
  async (contentType) => {
    const context = await createAvatarUploadFixture();
    const avatarId = await context.reserve();
    expect(
      (await context.upload(avatarId, context.bytes, contentType)).statusCode,
    ).toBe(400);
    expect(
      await context.database
        .selectFrom("member_avatar_uploads")
        .select("state")
        .where("id", "=", avatarId)
        .executeTakeFirst(),
    ).toEqual({ state: "retired" });
  },
);

it("normalizes oversized avatar payloads and keeps other JSON parsing unchanged", async () => {
  const context = await createAvatarUploadFixture();
  const avatarId = await context.reserve();
  const response = await context.upload(avatarId, Buffer.alloc(10485761));
  expect(response.statusCode).toBe(413);
  expect(response.json()).toEqual({
    error: "avatar_too_large",
    message: "Choose a photo smaller than 10 MB.",
  });
  expect(
    (
      await context.app.inject({
        method: "PATCH",
        url: "/api/me",
        headers: { cookie: context.owner.cookie },
        payload: { displayName: "Fresh Name" },
      })
    ).statusCode,
  ).toBe(200);
});

it("counts rejected attempts before parsing and supplies Retry-After on the fourth", async () => {
  const context = await createAvatarUploadFixture();
  const avatarId = await context.reserve();
  await context.upload(avatarId, Buffer.from("bad"));
  await context.upload(avatarId, Buffer.from("bad"));
  await context.upload(avatarId, Buffer.from("bad"));
  const response = await context.upload(avatarId);
  expect(response.statusCode).toBe(429);
  expect(Number(response.headers["retry-after"])).toBeGreaterThan(0);
});

it.each(["decode", "put"])(
  "retires and queues cleanup after %s failure",
  async (failure) => {
    const context = await createAvatarUploadFixture();
    const avatarId = await context.reserve();
    if (failure === "put") {
      context.b2.isUnavailable = true;
    }
    const response = await context.upload(
      avatarId,
      failure === "decode" ? Buffer.alloc(context.bytes.length) : context.bytes,
    );
    expect(response.statusCode).toBe(failure === "decode" ? 400 : 500);
    expect(
      await context.database
        .selectFrom("member_avatar_uploads")
        .select("state")
        .executeTakeFirst(),
    ).toEqual({ state: "retired" });
    expect(
      await context.database
        .selectFrom("pending_object_deletions")
        .selectAll()
        .execute(),
    ).toHaveLength(1);
  },
);

it("does not let another member upload an owned reservation", async () => {
  const context = await createAvatarUploadFixture();
  const avatarId = await context.reserve();
  const other = await insertSignedInMember({
    database: context.database,
    token: "other-upload",
  });
  const response = await context.app.inject({
    method: "PUT",
    url: `/api/me/avatar-uploads/${avatarId}`,
    headers: { cookie: other.cookie, "content-type": "image/png" },
    payload: context.bytes,
  });
  expect(response.statusCode).toBe(404);
  expect((await context.upload(avatarId)).statusCode).toBe(200);
});
