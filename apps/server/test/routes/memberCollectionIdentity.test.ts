import { memberCollectionResponseSchema } from "@memory-shoebox/shared";
import { expect, it } from "vitest";
import { createId } from "../../src/db/createId.ts";
import { makeMemberCollectionFixture } from "../helpers/memberCollectionFixture.ts";
import { NOW } from "../helpers/seedHelpers/seedHelpers.ts";
import {
  insertPublishedAvatar,
  readMemberTimeline,
} from "./memberCollectionTestHelpers.ts";

it("returns only retained public identity including removed accounts", async () => {
  const fixture = await makeMemberCollectionFixture();
  const response = await fixture.get(`member-collections/${fixture.memberId}`);
  expect(response.statusCode).toBe(200);
  expect(memberCollectionResponseSchema.parse(response.json())).toEqual({
    member: {
      memberId: fixture.memberId,
      displayName: "Jorge",
      avatar: null,
    },
  });
  await fixture.database
    .updateTable("members")
    .set({ status: "removed" })
    .where("id", "=", fixture.memberId)
    .execute();
  expect(
    (await fixture.get(`member-collections/${fixture.memberId}`)).json(),
  ).toEqual(response.json());
  expect((await readMemberTimeline(fixture)).resultCount).toBe(4);
});

it("hydrates the public identity avatar through the existing private signing pipeline", async () => {
  const fixture = await makeMemberCollectionFixture();
  const avatarId = await insertPublishedAvatar(fixture);
  const response = await fixture.get(`member-collections/${fixture.memberId}`);
  const member = memberCollectionResponseSchema.parse(response.json()).member!;
  expect(member.avatar?.avatarId).toBe(avatarId);
  expect(member.avatar?.url).toContain(
    encodeURIComponent(`avatars/${fixture.memberId}/${avatarId}.webp`),
  );
  expect(member.avatar?.issuedAt).toBe(NOW);
  expect(member.avatar?.expiresAt).toBe(
    new Date(Date.parse(NOW) + 3600000).toISOString(),
  );
  expect(Object.keys(response.json().member).sort()).toEqual([
    "avatar",
    "displayName",
    "memberId",
  ]);
});

it("authenticates the identity endpoint and represents unknown accounts as null", async () => {
  const fixture = await makeMemberCollectionFixture();
  expect(
    (await fixture.get(`member-collections/${createId()}`)).json(),
  ).toEqual({ member: null });
  expect((await fixture.get("member-collections/not-a-uuid")).statusCode).toBe(
    400,
  );
  expect(
    (
      await fixture.app.inject({
        method: "GET",
        url: `/api/member-collections/${fixture.memberId}`,
      })
    ).statusCode,
  ).toBe(401);
});
