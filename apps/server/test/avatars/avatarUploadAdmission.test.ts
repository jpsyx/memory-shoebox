import { startStubBucket } from "../b2/client/__tests__/clientTestHelpers.ts";
import { request as httpRequest } from "node:http";
import { expect, it } from "vitest";
import {
  createAvatarUploadFixture,
  holdPut,
  waitForPublished,
} from "./avatarUploadTestHelpers.ts";

it("holds the sole slot through PUT, refuses contention before parsing, and fences fresh expiry without a sweep", async () => {
  const context = await createAvatarUploadFixture();
  const avatarId = await context.reserve();
  const competitor = await context.reserve();
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const put = context.b2.putObject;
  context.b2.putObject = async (options) => {
    entered.resolve();
    await release.promise;
    await put(options);
  };
  const pending = context.upload(avatarId).then((response) => {
    return response;
  });
  await Promise.race([
    entered.promise,
    pending.then((response) => {
      throw new Error(
        `PUT completed before storage barrier: ${response.statusCode}`,
      );
    }),
  ]);
  const busy = await context.upload(competitor, Buffer.alloc(10485761));
  expect(busy.statusCode).toBe(503);
  expect(busy.json().error).toBe("avatar_busy");
  context.advance("2026-09-27T10:11:00.000Z");
  release.resolve();
  expect((await pending).statusCode).toBe(410);
  expect(
    await context.database
      .selectFrom("members")
      .select("avatar_id")
      .where("id", "=", context.owner.memberId)
      .executeTakeFirst(),
  ).toEqual({ avatar_id: null });
  expect(
    await context.database
      .selectFrom("pending_object_deletions")
      .selectAll()
      .execute(),
  ).toHaveLength(1);
});

it("keeps the permit after a client abort until the in-flight PUT really settles", async () => {
  const context = await createAvatarUploadFixture();
  const avatarId = await context.reserve();
  const competitor = await context.reserve();
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const closed = Promise.withResolvers<void>();
  const put = context.b2.putObject;
  context.b2.putObject = async (options) => {
    entered.resolve();
    await release.promise;
    await put(options);
  };
  const address = await context.app.listen({ host: "127.0.0.1", port: 0 });
  context.app.server.once("request", (_request, response) => {
    response.once("close", () => {
      return closed.resolve();
    });
  });
  const request = httpRequest(`${address}/api/me/avatar-uploads/${avatarId}`, {
    method: "PUT",
    headers: {
      cookie: context.owner.cookie,
      "content-type": "image/png",
      "content-length": context.bytes.length,
    },
  });
  request.on("error", () => {});
  request.end(context.bytes);
  await entered.promise;
  request.destroy();
  await closed.promise;
  expect((await context.upload(competitor)).statusCode).toBe(503);
  release.resolve();
  await context.app.server.closeIdleConnections();
  await waitForPublished(context, avatarId);
  expect((await context.upload(competitor)).statusCode).toBe(409);
});

it("admits only one incomplete body and releases its permit on pre-handler abort", async () => {
  const context = await createAvatarUploadFixture();
  const parsing = Promise.withResolvers<void>();
  context.app.addHook("preParsing", async (request, _reply, payload) => {
    if (request.method === "PUT") {
      parsing.resolve();
    }
    return payload;
  });
  const avatarId = await context.reserve();
  const competitor = await context.reserve();
  const address = await context.app.listen({ host: "127.0.0.1", port: 0 });
  const request = httpRequest(`${address}/api/me/avatar-uploads/${avatarId}`, {
    method: "PUT",
    headers: {
      cookie: context.owner.cookie,
      "content-type": "image/png",
      "content-length": 10485760,
    },
  });
  request.on("error", () => {});
  request.flushHeaders();
  await parsing.promise;
  expect(
    (await context.upload(competitor, Buffer.alloc(10485761))).statusCode,
  ).toBe(503);
  request.destroy();
  await expect
    .poll(async () => {
      return (
        await context.database
          .selectFrom("member_avatar_uploads")
          .select("state")
          .where("id", "=", avatarId)
          .executeTakeFirstOrThrow()
      ).state;
    })
    .toBe("retired");
  expect((await context.upload(competitor)).statusCode).toBe(200);
});

it.each(["test", "production"])(
  "keeps avatar writes and deletes inside the %s prefix",
  async (environment) => {
    const bucket = await startStubBucket({
      answer: () => {
        return { status: 200 };
      },
      environment: { NODE_ENV: environment },
    });
    try {
      await bucket.client.putObject({
        key: "avatars/member/image.webp",
        body: Buffer.from("processed image"),
        contentType: "image/webp",
      });
      await bucket.client.deleteObject({ key: "avatars/member/image.webp" });
      expect(
        bucket.requests.map((request) => {
          return new URL(request.url, "http://local.test").pathname;
        }),
      ).toEqual([
        `/memory-shoebox-media/${environment}/avatars/member/image.webp`,
        `/memory-shoebox-media/${environment}/avatars/member/image.webp`,
      ]);
    } finally {
      await bucket.close();
    }
  },
);

it("refuses an avatar before reading its body while background decoding owns the shared lane", async () => {
  const context = await createAvatarUploadFixture();
  const avatarId = await context.reserve();
  const release = Promise.withResolvers<void>();
  const entered = Promise.withResolvers<void>();
  const pending = context.app.mediaDecodeCoordinator.run({
    signal: new AbortController().signal,
    work: async () => {
      entered.resolve();
      await release.promise;
    },
  });
  await entered.promise;
  try {
    expect(
      (await context.upload(avatarId, Buffer.alloc(10485761))).statusCode,
    ).toBe(503);
  } finally {
    release.resolve();
    await pending;
  }
  expect((await context.upload(avatarId)).statusCode).toBe(200);
});

it("keeps background decoding queued until an admitted avatar really finishes", async () => {
  const context = await createAvatarUploadFixture();
  const avatarId = await context.reserve();
  const held = await holdPut(context, avatarId);
  let hasStarted = false;
  const pending = context.app.mediaDecodeCoordinator.run({
    signal: new AbortController().signal,
    work: async () => {
      hasStarted = true;
    },
  });
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
  expect(hasStarted).toBe(false);
  held.release();
  expect((await held.pending).statusCode).toBe(200);
  await pending;
  expect(hasStarted).toBe(true);
});
