import { QueryClient } from "@tanstack/react-query";
import { expect, it, vi, afterEach } from "vitest";
import { createMeResponse } from "@/testing/createMeResponse";
import {
  capturePrivateAuthority,
  isPrivateAuthorityCurrent,
  removePrivateQueries,
  reconcileAccountFields,
} from "@/api/me/privateQueryHelpers";
import {
  saveAvatar,
  renewMemberAvatar,
  removeAvatar,
  captureAvatarWrite,
} from "./avatars";
const avatar = {
  avatarId: "018f0000-0000-7000-8000-000000000010",
  url: "https://example.com/avatar",
  issuedAt: "2026-10-31T00:00:00.000Z",
  expiresAt: "2099-10-31T01:00:00.000Z",
};
afterEach(() => {
  return vi.unstubAllGlobals();
});
it("retires authority on cache clear and private retirement", () => {
  const client = new QueryClient();
  client.setQueryData(["me"], createMeResponse());
  const ticket = capturePrivateAuthority(client);
  client.clear();
  client.setQueryData(["me"], createMeResponse());
  expect(isPrivateAuthorityCurrent(client, ticket)).toBe(false);
  const another = capturePrivateAuthority(client);
  removePrivateQueries(client);
  expect(isPrivateAuthorityCurrent(client, another)).toBe(false);
});
it("merges name and avatar fields independently in either response order", () => {
  const client = new QueryClient();
  const original = createMeResponse({ storedDisplayName: null });
  client.setQueryData(["me"], original);
  const ticket = capturePrivateAuthority(client);
  reconcileAccountFields(
    client,
    createMeResponse({ avatar }),
    "avatar",
    ticket,
  );
  reconcileAccountFields(
    client,
    createMeResponse({ displayName: "New" }),
    "name",
    ticket,
  );
  expect(
    client.getQueryData<ReturnType<typeof createMeResponse>>(["me"])?.me.member,
  ).toMatchObject({ displayName: "New", avatar });
  reconcileAccountFields(client, original, "avatar", ticket);
  expect(
    client.getQueryData<ReturnType<typeof createMeResponse>>(["me"])?.me
      .profileComplete,
  ).toBe(true);
});
it("reserves then PUTs the chosen original bytes and crop", async () => {
  const client = new QueryClient();
  client.setQueryData(["me"], createMeResponse());
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({ avatarId: avatar.avatarId, expiresAt: avatar.expiresAt }),
    )
    .mockResolvedValueOnce(Response.json(createMeResponse({ avatar })));
  vi.stubGlobal("fetch", fetcher);
  const file = new File(["pixels"], "face.png", { type: "image/png" });
  const crop = { centerX: 0.6, centerY: 0.4, zoom: 2 };
  await saveAvatar({ client, file, crop, expectedAvatarId: null });
  expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toMatchObject({
    crop,
    byteSize: 6,
    expectedAvatarId: null,
  });
  expect(fetcher.mock.calls[1]![1]).toMatchObject({
    method: "PUT",
    body: file,
  });
});
it("retires the PUT continuation after account change during reservation", async () => {
  const client = new QueryClient();
  client.setQueryData(["me"], createMeResponse());
  const pending = Promise.withResolvers<Response>();
  const fetcher = vi.fn(() => {
    return pending.promise;
  });
  vi.stubGlobal("fetch", fetcher);
  const save = saveAvatar({
    client,
    file: new File(["x"], "face.png", { type: "image/png" }),
    crop: { centerX: 0.5, centerY: 0.5, zoom: 1 },
    expectedAvatarId: null,
  });
  client.setQueryData(
    ["me"],
    createMeResponse({ memberId: "018f0000-0000-7000-8000-000000000002" }),
  );
  pending.resolve(
    Response.json({ avatarId: avatar.avatarId, expiresAt: avatar.expiresAt }),
  );
  await expect(save).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("renews once and cannot restore an old pointer after removal", async () => {
  const client = new QueryClient();
  const account = createMeResponse({ avatar });
  client.setQueryData(["me"], account);
  const pending = Promise.withResolvers<Response>();
  const fetcher = vi.fn(() => {
    return pending.promise;
  });
  vi.stubGlobal("fetch", fetcher);
  const first = renewMemberAvatar({ client, member: account.me.member });
  const second = renewMemberAvatar({ client, member: account.me.member });
  client.setQueryData(["me"], createMeResponse());
  pending.resolve(
    Response.json({
      avatar: { ...avatar, url: "https://example.com/renewed" },
    }),
  );
  await Promise.all([first, second]);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(
    client.getQueryData<ReturnType<typeof createMeResponse>>(["me"])?.me.member
      .avatar,
  ).toBeNull();
});

it("keeps newer name, notification and completion fields when a held avatar response arrives", async () => {
  const client = new QueryClient();
  const original = createMeResponse({ storedDisplayName: null });
  client.setQueryData(["me"], original);
  const held = Promise.withResolvers<Response>();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({ avatarId: avatar.avatarId, expiresAt: avatar.expiresAt }),
    )
    .mockReturnValueOnce(held.promise);
  vi.stubGlobal("fetch", fetcher);
  const saving = saveAvatar({
    client,
    file: new File(["pixels"], "face.png", { type: "image/png" }),
    crop: { centerX: 0.5, centerY: 0.5, zoom: 1 },
    expectedAvatarId: null,
  });
  await vi.waitFor(() => {
    return expect(fetcher).toHaveBeenCalledTimes(2);
  });
  const newer = createMeResponse({ displayName: "John M" });
  newer.me.notify.onComment = "off";
  client.setQueryData(["me"], newer);
  held.resolve(
    Response.json({
      ...original,
      me: { ...original.me, member: { ...original.me.member, avatar } },
    }),
  );
  await saving;
  expect(
    client.getQueryData<ReturnType<typeof createMeResponse>>(["me"])?.me,
  ).toMatchObject({
    member: { displayName: "John M", avatar },
    profileComplete: true,
    notify: { onComment: "off" as const },
  });
});

it.each(["replacement", "removal"] as const)(
  "does not restore a superseded photo after newer %s when its successful response arrives late",
  async (newerChange) => {
    const client = new QueryClient();
    client.setQueryData(["me"], createMeResponse());
    const held = Promise.withResolvers<Response>();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          avatarId: avatar.avatarId,
          expiresAt: avatar.expiresAt,
        }),
      )
      .mockReturnValueOnce(held.promise);
    vi.stubGlobal("fetch", fetcher);
    const saving = saveAvatar({
      client,
      file: new File(["pixels"], "face.png", { type: "image/png" }),
      crop: { centerX: 0.5, centerY: 0.5, zoom: 1 },
      expectedAvatarId: null,
    });
    await vi.waitFor(() => {
      return expect(fetcher).toHaveBeenCalledTimes(2);
    });
    const newer = {
      ...avatar,
      avatarId: "018f0000-0000-7000-8000-000000000011",
      url: "https://example.com/newer",
    };
    if (newerChange === "removal") {
      fetcher.mockResolvedValueOnce(Response.json(createMeResponse()));
      await removeAvatar({ client, expectedAvatarId: avatar.avatarId });
    } else {
      client.setQueryData(["me"], createMeResponse({ avatar: newer }));
    }
    held.resolve(Response.json(createMeResponse({ avatar })));
    await saving;
    expect(
      client.getQueryData<ReturnType<typeof createMeResponse>>(["me"])?.me
        .member.avatar,
    ).toEqual(newerChange === "removal" ? null : newer);
  },
);

it.each([false, true])(
  "keeps a newer removal when an explicit fresh-version replacement returns late (changed response session: %s)",
  async (hasDifferentSession) => {
    const client = new QueryClient();
    client.setQueryData(["me"], createMeResponse());
    const writeContext = captureAvatarWrite(client);
    const latest = {
      ...avatar,
      avatarId: "018f0000-0000-7000-8000-000000000011",
    };
    const saved = {
      ...avatar,
      avatarId: "018f0000-0000-7000-8000-000000000012",
    };
    const held = Promise.withResolvers<Response>();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ avatarId: saved.avatarId, expiresAt: saved.expiresAt }),
      )
      .mockReturnValueOnce(held.promise)
      .mockResolvedValueOnce(Response.json(createMeResponse()));
    vi.stubGlobal("fetch", fetcher);
    const saving = saveAvatar({
      client,
      file: new File(["pixels"], "face.png", { type: "image/png" }),
      crop: { centerX: 0.5, centerY: 0.5, zoom: 1 },
      expectedAvatarId: latest.avatarId,
      write: { context: writeContext, freshExpectedAvatarId: latest.avatarId },
    });
    await vi.waitFor(() => {
      return expect(fetcher).toHaveBeenCalledTimes(2);
    });
    client.setQueryData(["me"], createMeResponse({ avatar: saved }));
    await removeAvatar({ client, expectedAvatarId: saved.avatarId });
    held.resolve(
      Response.json(
        createMeResponse({
          avatar: saved,
          sessionId: hasDifferentSession
            ? "018f0000-0000-7000-8000-000000000099"
            : undefined,
        }),
      ),
    );
    await saving;
    expect(
      client.getQueryData<ReturnType<typeof createMeResponse>>(["me"])?.me
        .member.avatar,
    ).toBeNull();
  },
);

it.each(["name", "avatar", "notify"] as const)(
  "publishes a complete new-member baseline from a %s response without mixing identities",
  (field) => {
    const client = new QueryClient();
    client.setQueryData(
      ["me"],
      createMeResponse({ email: "old@example.com", avatar }),
    );
    const ticket = capturePrivateAuthority(client);
    const replacement = createMeResponse({
      memberId: "018f0000-0000-7000-8000-000000000098",
      sessionId: "018f0000-0000-7000-8000-000000000099",
      email: "replacement@example.com",
      displayName: "Replacement",
      role: "viewer",
    });
    reconcileAccountFields(client, replacement, field, ticket);
    expect(client.getQueryData(["me"])).toEqual(replacement);
    expect(isPrivateAuthorityCurrent(client, ticket)).toBe(false);
  },
);
it.each(["upload", "remove"] as const)(
  "observes replacement session in an avatar %s response before any account read",
  async (operation) => {
    const client = new QueryClient();
    client.setQueryData(["me"], createMeResponse());
    client.setQueryData(["items", "private"], {
      member: createMeResponse().me.member,
    });
    const ticket = capturePrivateAuthority(client);
    const replacement = createMeResponse({
      sessionId: "018f0000-0000-7000-8000-000000000099",
      displayName: "Replacement",
      avatar: operation === "upload" ? avatar : null,
    });
    const fetcher = vi.fn();
    if (operation === "upload") {
      fetcher.mockResolvedValueOnce(
        Response.json({
          avatarId: avatar.avatarId,
          expiresAt: avatar.expiresAt,
        }),
      );
    }
    const held = Promise.withResolvers<Response>();
    fetcher.mockReturnValueOnce(held.promise);
    vi.stubGlobal("fetch", fetcher);
    const saving =
      operation === "upload"
        ? saveAvatar({
            client,
            file: new File(["x"], "face.png", { type: "image/png" }),
            crop: { centerX: 0.5, centerY: 0.5, zoom: 1 },
            expectedAvatarId: null,
          })
        : removeAvatar({ client, expectedAvatarId: null });
    await vi.waitFor(() => {
      expect(fetcher).toHaveBeenCalledTimes(operation === "upload" ? 2 : 1);
    });
    // A same-session independent avatar publication must not hide the observed
    // replacement session merely because the old expected pointer changed.
    client.setQueryData(
      ["me"],
      createMeResponse({
        avatar: { ...avatar, avatarId: "018f0000-0000-7000-8000-000000000011" },
      }),
    );
    held.resolve(Response.json(replacement));
    await saving;
    expect(client.getQueryData(["me"])).toEqual(replacement);
    expect(client.getQueryData(["items", "private"])).toBeUndefined();
    expect(isPrivateAuthorityCurrent(client, ticket)).toBe(false);
  },
);
it("rejects a late old avatar response after same-member session replacement", async () => {
  const client = new QueryClient();
  client.setQueryData(["me"], createMeResponse({ avatar }));
  const held = Promise.withResolvers<Response>();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      return held.promise;
    }),
  );
  const removing = removeAvatar({ client, expectedAvatarId: avatar.avatarId });
  const rejected = expect(removing).rejects.toThrow("Account changed.");
  const replacement = createMeResponse({
    sessionId: "018f0000-0000-7000-8000-000000000099",
    avatar,
  });
  client.setQueryData(["me"], replacement);
  held.resolve(Response.json(createMeResponse()));
  await rejected;
  expect(client.getQueryData(["me"])).toEqual(replacement);
});
