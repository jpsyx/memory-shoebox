import { sql } from "kysely";
import { expect, it } from "vitest";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import {
  insertComment,
  insertItem,
  NOW,
} from "../helpers/seedHelpers/seedHelpers.ts";
import { profileCompletionClock } from "./profileCompletionTestHelpers.ts";

it("claims through /me, preserves first completion, and never enumerates a collision", async () => {
  let now = NOW;
  const { app, database, close } = await createTestApp({
    clock: () => {
      return new Date(now);
    },
  });
  const otherEmail = "private-owner@example.com";
  const first = await insertSignedInMember({
    database,
    token: "first",
    member: { display_name: null, email: otherEmail },
  });
  const other = await insertSignedInMember({
    database,
    token: "other",
    member: { email: "private-requester@example.com", display_name: null },
  });
  const patch = (cookie: string, displayName: unknown) => {
    return app.inject({
      method: "PATCH",
      url: "/api/me",
      headers: { cookie },
      payload: { displayName },
    });
  };
  const complete = (await patch(first.cookie, "  José   M  ")).json();
  expect(complete.me.profileComplete).toBe(true);
  expect(complete.me.member.displayName).toBe("José M");
  const taken = await patch(other.cookie, "JOSE\u0301 M");
  expect(taken.statusCode).toBe(409);
  expect(taken.json().error).toBe("name_taken");
  expect(JSON.stringify(taken.json())).not.toContain(otherEmail);
  expect(JSON.stringify(taken.json())).not.toContain(first.memberId);
  now = "2026-09-28T10:00:00.000Z";
  await patch(first.cookie, "Another Name");
  const timestamp = await database
    .selectFrom("members")
    .select("profile_completed_at")
    .where("id", "=", first.memberId)
    .executeTakeFirstOrThrow();
  expect(timestamp.profile_completed_at).toBe(NOW);
  expect((await patch(other.cookie, "José M")).statusCode).toBe(409);
  for (const invalid of [
    null,
    "",
    "name@name",
    "line\nbreak",
    "hidden\u200bname",
  ])
    expect((await patch(first.cookie, invalid)).statusCode).toBe(400);
  const anonymous = await app.inject({
    method: "PATCH",
    url: "/api/me",
    payload: { displayName: "José M" },
  });
  expect(anonymous.statusCode).toBe(401);
  await close();
});

it.each(["viewer", "admin"] as const)(
  "requires completion for %s comments while allowing account setup and reads",
  async (role) => {
    const { app, database, close } = await createTestApp({
      clock: profileCompletionClock,
    });
    const member = await insertSignedInMember({
      database,
      member: {
        role,
        display_name: null,
        profile_completed_at: null,
        suggested_display_name: "Suggestion",
      },
    });
    const itemId = await insertItem(database, {
      uploadedBy: member.memberId,
    });
    const commentId = await insertComment(database, {
      itemId,
      authorMemberId: member.memberId,
    });
    const headers = { cookie: member.cookie };
    const incompleteComment = await app.inject({
      method: "POST",
      url: `/api/items/${itemId}/comments`,
      headers,
      payload: { body: "Hello" },
    });
    expect(incompleteComment.statusCode).toBe(403);
    expect(incompleteComment.json().error).toBe("profile_required");
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: `/api/comments/${commentId}`,
          headers,
          payload: { body: "Edit" },
        })
      ).json().error,
    ).toBe("profile_required");
    const me = (
      await app.inject({ method: "GET", url: "/api/me", headers })
    ).json().me;
    expect(me).toMatchObject({
      profileComplete: false,
      suggestedDisplayName: "Suggestion",
      member: { displayName: "Member" },
    });
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/items/${"019f1234-0000-7000-8000-000000000009"}/comments`,
          headers,
          payload: { body: "Hello" },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: "/api/me",
          headers,
          payload: { displayName: `Claimed ${role}` },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/items/${itemId}/comments`,
          headers,
          payload: { body: "Hello" },
        })
      ).statusCode,
    ).toBe(201);
    await close();
  },
);

it("blocks every archive upload mutation except cancellation", async () => {
  const { app, database, close } = await createTestApp({
    clock: profileCompletionClock,
  });
  const member = await insertSignedInMember({
    database,
    member: { display_name: null, profile_completed_at: null },
  });
  const headers = { cookie: member.cookie };
  const sessionId = "019f1234-0000-7000-8000-000000000009";
  const paths = [
    ["POST", ""],
    ["POST", `/${sessionId}/commit`],
    ["PATCH", `/${sessionId}/manifest`],
    ["DELETE", `/${sessionId}/files`],
    ["PATCH", `/${sessionId}/visibility`],
    ["POST", `/${sessionId}/edits`],
    ["DELETE", `/${sessionId}/edits/${sessionId}`],
    ...["burst", "presign", "complete", "retry"].map((action) => {
      return [
        action === "burst" ? "PATCH" : "POST",
        `/${sessionId}/files/${sessionId}/${action}`,
      ];
    }),
  ] as const;
  for (const [method, path] of paths) {
    const response = await app.inject({
      method: method as "POST",
      url: `/api/upload-sessions${path}`,
      headers,
    });
    expect(response.statusCode, path).toBe(403);
    expect(response.json().error).toBe("profile_required");
  }
  expect(
    (
      await app.inject({
        method: "GET",
        url: "/api/upload-sessions/current",
        headers,
      })
    ).statusCode,
  ).toBe(204);
  expect(
    (
      await app.inject({
        method: "DELETE",
        url: `/api/upload-sessions/${sessionId}`,
        headers,
      })
    ).statusCode,
  ).toBe(404);
  await close();
});

it("rolls back claims, completion and preferences when person synchronization fails", async () => {
  const { app, database, close } = await createTestApp({
    clock: profileCompletionClock,
  });
  const member = await insertSignedInMember({
    database,
    member: { display_name: null, profile_completed_at: null },
  });
  await sql`create trigger fail_person before insert on people begin select raise(abort, 'person failure'); end`.execute(
    database,
  );
  const response = await app.inject({
    method: "PATCH",
    url: "/api/me",
    headers: { cookie: member.cookie },
    payload: {
      displayName: "Rollback Name",
      notify: {
        onUpload: false,
        onComment: false,
        onReply: false,
        onRemoval: false,
      },
    },
  });
  expect(response.statusCode).toBe(500);
  expect(
    await database
      .selectFrom("member_name_claims")
      .selectAll()
      .where("member_id", "=", member.memberId)
      .execute(),
  ).toEqual([]);
  expect(
    await database
      .selectFrom("members")
      .select(["display_name", "profile_completed_at", "notify_on_upload"])
      .where("id", "=", member.memberId)
      .executeTakeFirstOrThrow(),
  ).toEqual({
    display_name: null,
    profile_completed_at: null,
    notify_on_upload: 1,
  });
  await close();
});
