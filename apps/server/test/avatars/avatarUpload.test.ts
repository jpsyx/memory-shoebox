import { startStubBucket } from "../b2/client/__tests__/clientTestHelpers.ts";
import { request as httpRequest } from "node:http";
import sharp from "sharp";
import { afterEach, expect, it } from "vitest";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import { NOW } from "../helpers/seedHelpers/seedHelpers.ts";

const contexts: Array<Awaited<ReturnType<typeof createTestApp>>> = [];
afterEach(async () => {
  await Promise.all(
    contexts.splice(0).map((context) => {
      return context.close();
    }),
  );
});
async function fixture() {
  let instant = NOW;
  const context = await createTestApp({
    clock: () => {
      return new Date(instant);
    },
  });
  contexts.push(context);
  const owner = await insertSignedInMember({
    database: context.database,
    member: { role: "viewer" },
  });
  const bytes = await pngFixture();
  const reserve = async (expectedAvatarId: string | null = null) => {
    return reserveAvatar(context, owner.cookie, bytes.length, expectedAvatarId);
  };
  const upload = (
    avatarId: string,
    payload = bytes,
    contentType = "image/png",
  ) => {
    return context.app.inject({
      method: "PUT",
      url: `/api/me/avatar-uploads/${avatarId}`,
      headers: { cookie: owner.cookie, "content-type": contentType },
      payload,
    });
  };
  return {
    ...context,
    owner,
    bytes,
    reserve,
    upload,
    advance: (value: string) => {
      instant = value;
    },
  };
}

it("publishes a viewer's real binary image and replays without another PUT", async () => {
  const context = await fixture();
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
    const context = await fixture();
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
  const context = await fixture();
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
  const context = await fixture();
  const avatarId = await context.reserve();
  await context.upload(avatarId, Buffer.from("bad"));
  await context.upload(avatarId, Buffer.from("bad"));
  await context.upload(avatarId, Buffer.from("bad"));
  const response = await context.upload(avatarId);
  expect(response.statusCode).toBe(429);
  expect(Number(response.headers["retry-after"])).toBeGreaterThan(0);
});

it("holds the sole slot through PUT, refuses contention before parsing, and fences fresh expiry without a sweep", async () => {
  const context = await fixture();
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

it.each(["decode", "put"])(
  "retires and queues cleanup after %s failure",
  async (failure) => {
    const context = await fixture();
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

async function holdPut(
  context: Awaited<ReturnType<typeof fixture>>,
  avatarId: string,
) {
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
  return {
    release: () => {
      return release.resolve();
    },
    pending,
  };
}

it("re-arms deletion after an expired writer lands beyond an earlier 404 cleanup", async () => {
  const context = await fixture();
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
  const context = await fixture();
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

it("does not let another member upload an owned reservation", async () => {
  const context = await fixture();
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

it("keeps the permit after a client abort until the in-flight PUT really settles", async () => {
  const context = await fixture();
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

it("retires pending work when removing an already-empty avatar and rejects its late PUT", async () => {
  const context = await fixture();
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

async function waitForPublished(
  context: Awaited<ReturnType<typeof fixture>>,
  avatarId: string,
): Promise<void> {
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
    .toBe("published");
  await new Promise<void>((resolve) => {
    return setImmediate(resolve);
  });
}

async function reserveAvatar(
  context: Awaited<ReturnType<typeof createTestApp>>,
  cookie: string,
  byteSize: number,
  expectedAvatarId: string | null,
) {
  const response = await context.app.inject({
    method: "POST",
    url: "/api/me/avatar-uploads",
    headers: { cookie: cookie },
    payload: {
      expectedAvatarId,
      byteSize: byteSize,
      contentType: "image/png",
      crop: { centerX: 0.5, centerY: 0.5, zoom: 1 },
    },
  });
  expect(response.statusCode).toBe(201);
  return response.json().avatarId as string;
}

it("admits only one incomplete body and releases its permit on pre-handler abort", async () => {
  const context = await fixture();
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

it("keeps pending reservations intact when removal presents a stale expected pointer", async () => {
  const context = await fixture();
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

async function pngFixture(): Promise<Buffer> {
  return sharp({
    create: { width: 20, height: 10, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
}
