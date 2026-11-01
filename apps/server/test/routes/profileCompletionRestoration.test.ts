import { expect, it } from "vitest";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import {
  insertItem,
  insertMember,
} from "../helpers/seedHelpers/seedHelpers.ts";
import { createMemberInvitationsFixture } from "./memberInvitations/__tests__/memberInvitationsTestHelpers.ts";
import { profileCompletionClock } from "./profileCompletionTestHelpers.ts";

it("allows duplicate unclaimed invitation suggestions and refuses clearing a restored claim", async () => {
  const { database, invite, close } = await createMemberInvitationsFixture();
  const removedId = await insertMember(database, {
    email: "removed@example.com",
    display_name: "Permanent Name",
    status: "removed",
  });
  for (const email of ["one@example.com", "two@example.com"])
    expect(
      (await invite({ email, displayName: "Permanent Name", role: "viewer" }))
        .statusCode,
    ).toBe(201);
  const pending = await database
    .selectFrom("members")
    .select(["display_name", "suggested_display_name", "profile_completed_at"])
    .where("email", "=", "one@example.com")
    .executeTakeFirstOrThrow();
  expect(pending).toEqual({
    display_name: null,
    suggested_display_name: "Permanent Name",
    profile_completed_at: null,
  });
  expect(
    (
      await invite({
        email: "removed@example.com",
        displayName: null,
        role: "viewer",
      })
    ).statusCode,
  ).toBe(400);
  expect(
    (
      await invite({
        email: "removed@example.com",
        displayName: "Rosa",
        role: "viewer",
      })
    ).json().error,
  ).toBe("name_taken");
  expect(
    (
      await database
        .selectFrom("members")
        .select("status")
        .where("id", "=", removedId)
        .executeTakeFirstOrThrow()
    ).status,
  ).toBe("removed");
  expect(
    (await invite({ email: "removed@example.com", role: "viewer" })).statusCode,
  ).toBe(201);
  expect(
    (
      await database
        .selectFrom("members")
        .select("display_name")
        .where("id", "=", removedId)
        .executeTakeFirstOrThrow()
    ).display_name,
  ).toBe("Permanent Name");
  await close();
});

it("uses stored completion rather than a truthy legacy name and preserves role rules", async () => {
  const { app, database, close } = await createTestApp({
    clock: profileCompletionClock,
  });
  const member = await insertSignedInMember({
    database,
    member: {
      role: "viewer",
      display_name: "Legacy suggestion",
      profile_completed_at: null,
    },
  });
  const headers = { cookie: member.cookie };
  const itemId = await insertItem(database, { uploadedBy: member.memberId });
  expect(
    (
      await app.inject({
        method: "POST",
        url: `/api/items/${itemId}/comments`,
        headers,
        payload: { body: "Hello" },
      })
    ).json().error,
  ).toBe("profile_required");
  await app.inject({
    method: "PATCH",
    url: "/api/me",
    headers,
    payload: { displayName: "Claimed Viewer" },
  });
  const upload = await app.inject({
    method: "POST",
    url: "/api/upload-sessions",
    headers,
    payload: { clientTimezone: "UTC" },
  });
  expect(upload.statusCode).toBe(403);
  expect(upload.json().error).not.toBe("profile_required");
  await close();
});

it("replaces a legacy invited claim on restoration without completing an unverified identity", async () => {
  const { database, invite, close } = await createMemberInvitationsFixture();
  const memberId = await insertMember(database, {
    email: "legacy@example.com",
    display_name: "Legacy Reserved",
    status: "removed",
  });
  await database
    .updateTable("members")
    .set({
      profile_completed_at: null,
      joined_at: null,
      last_signed_in_at: null,
    })
    .where("id", "=", memberId)
    .execute();
  const response = await invite({
    email: "legacy@example.com",
    displayName: "Replacement Reserved",
    role: "viewer",
  });
  expect(response.statusCode).toBe(201);
  expect(
    await database
      .selectFrom("members")
      .select([
        "display_name",
        "profile_completed_at",
        "suggested_display_name",
      ])
      .where("id", "=", memberId)
      .executeTakeFirstOrThrow(),
  ).toEqual({
    display_name: "Replacement Reserved",
    profile_completed_at: null,
    suggested_display_name: "Replacement Reserved",
  });
  expect(
    await database
      .selectFrom("member_name_claims")
      .select("display_name")
      .where("member_id", "=", memberId)
      .execute(),
  ).toHaveLength(2);
  await close();
});
