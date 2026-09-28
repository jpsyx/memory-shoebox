import { describe, expect, it } from "vitest";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import {
  NOW,
  insertInstanceSetting,
} from "../helpers/seedHelpers/seedHelpers.ts";

describe("GET /api/me", () => {
  it("answers the account and the shell's settings", async () => {
    const { app, database, close } = await createTestApp({
      clock: () => {
        return new Date(NOW);
      },
    });
    const { cookie, memberId } = await insertSignedInMember({
      database,
      member: {
        email: "abuela@example.com",
        display_name: null,
        role: "viewer",
      },
    });
    await insertInstanceSetting(database, {
      key: "shoebox.name",
      value: "The Sarmiento Shoebox",
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/me",
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      me: {
        member: { memberId, displayName: "abuela" },
        storedDisplayName: null,
        email: "abuela@example.com",
        role: "viewer",
        notify: {
          onUpload: true,
          onComment: true,
          onReply: true,
          onRemoval: true,
        },
        joinedAt: NOW,
        lastSignedInAt: NOW,
      },
      settings: {
        shoeboxName: "The Sarmiento Shoebox",
        pileArrangement: "messy",
        timezone: "UTC",
      },
    });
    await close();
  });

  it("answers 401 with no session", async () => {
    const { app, close } = await createTestApp();
    const response = await app.inject({ method: "GET", url: "/api/me" });
    expect(response.statusCode).toBe(401);
    expect(response.json().error).toBe("not_signed_in");
    await close();
  });
});

describe("PATCH /api/me", () => {
  it("corrects the display name and answers the read shape", async () => {
    const { app, database, close } = await createTestApp();
    const { cookie, memberId } = await insertSignedInMember({
      database,
      member: { email: "abuela@example.com", display_name: "Rosa" },
    });

    const response = await app.inject({
      method: "PATCH",
      url: "/api/me",
      headers: { cookie },
      payload: { displayName: "  Abuela Rosa  " },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().me.storedDisplayName).toBe("Abuela Rosa");
    expect(response.json().me.member.displayName).toBe("Abuela Rosa");

    const row = await database
      .selectFrom("members")
      .select("display_name")
      .where("id", "=", memberId)
      .executeTakeFirstOrThrow();
    expect(row.display_name).toBe("Abuela Rosa");
    await close();
  });

  it("clears the name back to the fallback with null", async () => {
    const { app, database, close } = await createTestApp();
    const { cookie } = await insertSignedInMember({
      database,
      member: { email: "abuela@example.com", display_name: "Rosa" },
    });

    const response = await app.inject({
      method: "PATCH",
      url: "/api/me",
      headers: { cookie },
      payload: { displayName: null },
    });

    expect(response.json().me.storedDisplayName).toBeNull();
    expect(response.json().me.member.displayName).toBe("abuela");
    await close();
  });

  it("turns all four switches off in one request", async () => {
    const { app, database, close } = await createTestApp();
    const { cookie, memberId } = await insertSignedInMember({ database });

    const response = await app.inject({
      method: "PATCH",
      url: "/api/me",
      headers: { cookie },
      payload: {
        notify: {
          onUpload: false,
          onComment: false,
          onReply: false,
          onRemoval: false,
        },
      },
    });

    expect(response.json().me.notify).toEqual({
      onUpload: false,
      onComment: false,
      onReply: false,
      onRemoval: false,
    });
    const row = await database
      .selectFrom("members")
      .select(["notify_on_upload", "notify_on_removal"])
      .where("id", "=", memberId)
      .executeTakeFirstOrThrow();
    expect(row).toEqual({ notify_on_upload: 0, notify_on_removal: 0 });
    await close();
  });

  it("refuses a partial notify object", async () => {
    const { app, database, close } = await createTestApp();
    const { cookie } = await insertSignedInMember({ database });

    const response = await app.inject({
      method: "PATCH",
      url: "/api/me",
      headers: { cookie },
      payload: { notify: { onUpload: false } },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("invalid_request");
    await close();
  });

  it("refuses email outright rather than ignoring it", async () => {
    const { app, database, close } = await createTestApp();
    const { cookie, memberId } = await insertSignedInMember({
      database,
      member: { email: "abuela@example.com" },
    });

    const response = await app.inject({
      method: "PATCH",
      url: "/api/me",
      headers: { cookie },
      payload: { email: "somebody-else@example.com" },
    });

    expect(response.statusCode).toBe(400);
    const row = await database
      .selectFrom("members")
      .select("email")
      .where("id", "=", memberId)
      .executeTakeFirstOrThrow();
    expect(row.email).toBe("abuela@example.com");
    await close();
  });

  it("refuses role, because nobody promotes themselves", async () => {
    const { app, database, close } = await createTestApp();
    const { cookie, memberId } = await insertSignedInMember({
      database,
      member: { role: "viewer" },
    });

    const response = await app.inject({
      method: "PATCH",
      url: "/api/me",
      headers: { cookie },
      payload: { role: "admin" },
    });

    expect(response.statusCode).toBe(400);
    const row = await database
      .selectFrom("members")
      .select("role")
      .where("id", "=", memberId)
      .executeTakeFirstOrThrow();
    expect(row.role).toBe("viewer");
    await close();
  });

  it("refuses a display name over eighty characters", async () => {
    const { app, database, close } = await createTestApp();
    const { cookie } = await insertSignedInMember({ database });

    const response = await app.inject({
      method: "PATCH",
      url: "/api/me",
      headers: { cookie },
      payload: { displayName: "r".repeat(81) },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().details.fieldErrors).toHaveProperty("displayName");
    await close();
  });

  it("does not bump the visibility generation for a spelling correction", async () => {
    // Invalidating every viewer's cached rule set because somebody fixed their
    // own name would be a real cost for nothing (`auth.md`, `PATCH /api/me`).
    const { app, database, close } = await createTestApp();
    const { cookie } = await insertSignedInMember({ database });

    await app.inject({
      method: "PATCH",
      url: "/api/me",
      headers: { cookie },
      payload: { displayName: "Abuela Rosa" },
    });

    const rows = await database
      .selectFrom("settings")
      .select("id")
      .where("key", "=", "visibility.generation")
      .execute();
    expect(rows).toEqual([]);
    await close();
  });

  it("answers 401 with no session", async () => {
    const { app, close } = await createTestApp();
    const response = await app.inject({
      method: "PATCH",
      url: "/api/me",
      payload: { displayName: "Rosa" },
    });
    expect(response.statusCode).toBe(401);
    await close();
  });
});
