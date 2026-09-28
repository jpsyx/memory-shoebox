import { beforeEach, describe, expect, it } from "vitest";
import type { Kysely } from "kysely";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import type { Database } from "../../src/db/types/db.types.ts";
import { getDisplayNameFromMember } from "../../src/members/getDisplayNameFromMember.ts";
import { getMeDtoFromMemberId } from "../../src/members/getMeDtoFromMemberId.ts";
import { NOW, insertMember } from "../helpers/seedHelpers/seedHelpers.ts";

describe("getDisplayNameFromMember", () => {
  it("prefers the stored name", () => {
    expect(
      getDisplayNameFromMember({
        storedDisplayName: "Abuela Rosa",
        email: "rosa@example.com",
      }),
    ).toBe("Abuela Rosa");
  });

  it("falls back to the email local part when none is stored", () => {
    expect(
      getDisplayNameFromMember({
        storedDisplayName: undefined,
        email: "abuela.rosa@example.com",
      }),
    ).toBe("abuela.rosa");
  });

  it("treats a whitespace name as none", () => {
    expect(
      getDisplayNameFromMember({
        storedDisplayName: "   ",
        email: "rosa@example.com",
      }),
    ).toBe("rosa");
  });
});

describe("getMeDtoFromMemberId", () => {
  let database: Kysely<Database>;

  beforeEach(async () => {
    database = createDatabase(":memory:");
    await migrateToLatest(database);
  });

  it("carries the resolved name, the raw column and the caller's address", async () => {
    const memberId = await insertMember(database, {
      email: "rosa@example.com",
      display_name: null,
      role: "viewer",
      notify_on_upload: 1,
      notify_on_comment: 0,
      notify_on_reply: 1,
      notify_on_removal: 0,
      joined_at: NOW,
      last_signed_in_at: NOW,
    });

    expect(await getMeDtoFromMemberId({ database, memberId })).toEqual({
      member: { memberId, displayName: "rosa" },
      storedDisplayName: null,
      email: "rosa@example.com",
      role: "viewer",
      notify: {
        onUpload: true,
        onComment: false,
        onReply: true,
        onRemoval: false,
      },
      joinedAt: NOW,
      lastSignedInAt: NOW,
    });
  });

  it("returns all four switches for a viewer, including onRemoval", async () => {
    // The recipient query filters on role as well as on the boolean; hiding
    // the field here would lose the member's setting the moment an admin
    // promoted them (`auth.md`, `GET /api/me`).
    const memberId = await insertMember(database, {
      email: "rosa@example.com",
      role: "viewer",
      notify_on_removal: 1,
    });
    const me = await getMeDtoFromMemberId({ database, memberId });
    expect(me.notify.onRemoval).toBe(true);
  });
});
