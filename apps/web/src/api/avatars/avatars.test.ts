import { QueryClient } from "@tanstack/react-query";
import { expect, it, vi, afterEach } from "vitest";
import { createMeResponse } from "@/testing/createMeResponse";
import {
  capturePrivateAuthority,
  isPrivateAuthorityCurrent,
  removePrivateQueries,
  reconcileAccountFields,
} from "@/api/me/privateQueryHelpers";
import { saveAvatar, renewMemberAvatar } from "./avatars";
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
  newer.me.notify.onComment = false;
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
    notify: { onComment: false },
  });
});
