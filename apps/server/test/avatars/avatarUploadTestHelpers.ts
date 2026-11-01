import type { LightMyRequestResponse } from "fastify";
import sharp from "sharp";
import { afterEach, expect } from "vitest";
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

/**
 * Shared create avatar upload fixture for focused local regression
 * scenarios.
 */
type Fixture = Awaited<ReturnType<typeof createTestApp>> & {
  owner: Awaited<ReturnType<typeof insertSignedInMember>>;
  bytes: Buffer;
  reserve: (expectedAvatarId?: string | null) => Promise<string>;
  upload: (
    avatarId: string,
    payload?: Buffer,
    contentType?: string,
  ) => Promise<LightMyRequestResponse>;
  advance: (value: string) => void;
};

async function _reserveAvatar(
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

async function _createAvatarPng(): Promise<Buffer> {
  return sharp({
    create: { width: 20, height: 10, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
}

/** Creates a binary-upload fixture with an independently controlled clock. */
export async function createAvatarUploadFixture(): Promise<Fixture> {
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
  const bytes = await _createAvatarPng();
  const reserve = async (expectedAvatarId: string | null = null) => {
    return _reserveAvatar(
      context,
      owner.cookie,
      bytes.length,
      expectedAvatarId,
    );
  };
  const upload = async (
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
    advance: (value: string): void => {
      instant = value;
    },
  };
}

/** Shared hold put for focused local regression scenarios. */
export async function holdPut(
  context: Awaited<ReturnType<typeof createAvatarUploadFixture>>,
  avatarId: string,
): Promise<{ release: () => void; pending: Promise<LightMyRequestResponse> }> {
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
    release: (): void => {
      return release.resolve();
    },
    pending,
  };
}

/** Shared wait for published for focused local regression scenarios. */
export async function waitForPublished(
  context: Awaited<ReturnType<typeof createAvatarUploadFixture>>,
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
