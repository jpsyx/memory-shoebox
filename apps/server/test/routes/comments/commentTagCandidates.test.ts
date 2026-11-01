import { describe, expect, it } from "vitest";
import { createId } from "../../../src/db/createId.ts";
import { createTestApp } from "../../helpers/createTestApp.ts";
import { insertSignedInMember } from "../../helpers/insertSignedInMember.ts";
import {
  insertMember,
  insertItem,
  insertVisibilityRule,
  insertVisibilityRuleSubject,
  insertGroup,
  insertGroupMember,
  insertPerson,
  insertItemPerson,
} from "../../helpers/seedHelpers/seedHelpers.ts";

describe("comment tag candidates", () => {
  it("returns only completed active accounts with actual item access, including self, uploader and admin", async () => {
    const { app, database, close } = await createTestApp();
    try {
      const { cookie, memberId } = await insertSignedInMember({
        database,
        member: { display_name: "Author" },
      });
      const uploaderId = await insertMember(database, {
        display_name: "Uploader",
      });
      const adminId = await insertMember(database, {
        display_name: "Admin",
        role: "admin",
      });
      const groupMemberId = await insertMember(database, {
        display_name: "Cousin",
        notify_on_comment_tag: 0,
      });
      const hiddenId = await insertMember(database, { display_name: "Hidden" });
      await insertMember(database, {
        display_name: "Incomplete",
        profile_completed_at: null,
      });
      await insertMember(database, {
        display_name: "Removed",
        status: "removed",
      });
      const ruleId = await insertVisibilityRule(database, { mode: "only" });
      await insertVisibilityRuleSubject(database, { ruleId, memberId });
      const groupId = await insertGroup(database);
      await insertGroupMember(database, { groupId, memberId: groupMemberId });
      await insertVisibilityRuleSubject(database, { ruleId, groupId });
      const itemId = await insertItem(database, {
        uploadedBy: uploaderId,
        visibility_rule_id: ruleId,
      });
      const personId = await insertPerson(database, {
        displayName: "Hidden",
        member_id: hiddenId,
      });
      await insertItemPerson(database, { itemId, personId });
      await insertPerson(database, { displayName: "Author" });
      const response = await app.inject({
        url: `/api/items/${itemId}/comment-tag-candidates`,
        headers: { cookie },
      });
      expect(response.statusCode).toBe(200);
      expect(
        response.json().members.map((member: { memberId: string }) => {
          return member.memberId;
        }),
      ).toEqual([adminId, memberId, groupMemberId, uploaderId]);
      expect(JSON.stringify(response.json())).not.toMatch(
        /email|status|removed|hidden|notify/i,
      );
      expect(
        response.json().members.every((member: object) => {
          return (
            Object.keys(member).sort().join() === "avatar,displayName,memberId"
          );
        }),
      ).toBe(true);
    } finally {
      await close();
    }
  });

  it("uses N1 exact, prefix, substring and deterministic alphabetical order", async () => {
    const { app, database, close } = await createTestApp();
    try {
      const { cookie, memberId } = await insertSignedInMember({
        database,
        member: { display_name: "Zoë" },
      });
      const itemId = await insertItem(database, { uploadedBy: memberId });
      for (const display_name of ["X Ana", "Ana María", "Ana", "Anabel", "Ána"])
        await insertMember(database, { display_name });
      const response = await app.inject({
        url: `/api/items/${itemId}/comment-tag-candidates?q=%20ANA%20`,
        headers: { cookie },
      });
      expect(response.statusCode).toBe(200);
      expect(
        response.json().members.map((member: { displayName: string }) => {
          return member.displayName;
        }),
      ).toEqual(["Ana", "Ana María", "Anabel", "X Ana"]);
      const accent = await app.inject({
        url: `/api/items/${itemId}/comment-tag-candidates?q=A%CC%81na`,
        headers: { cookie },
      });
      expect(
        accent.json().members.map((member: { displayName: string }) => {
          return member.displayName;
        }),
      ).toEqual(["Ána"]);
      const tooLong = await app.inject({
        url: `/api/items/${itemId}/comment-tag-candidates?q=${"a".repeat(81)}`,
        headers: { cookie },
      });
      expect(tooLong.statusCode).toBe(400);
      expect(tooLong.json().details.fieldErrors.q).toBeDefined();
    } finally {
      await close();
    }
  });

  it("authorizes the item before looking up candidates and hides missing/hidden items identically", async () => {
    const { app, database, close } = await createTestApp();
    try {
      const { cookie } = await insertSignedInMember({ database });
      const uploaderId = await insertMember(database);
      const ruleId = await insertVisibilityRule(database, { mode: "only" });
      const itemId = await insertItem(database, {
        uploadedBy: uploaderId,
        visibility_rule_id: ruleId,
      });
      const hidden = await app.inject({
        url: `/api/items/${itemId}/comment-tag-candidates`,
        headers: { cookie },
      });
      const missing = await app.inject({
        url: `/api/items/${createId()}/comment-tag-candidates`,
        headers: { cookie },
      });
      expect(hidden.statusCode).toBe(404);
      expect(hidden.body).toBe(missing.body);
      expect(
        await database.selectFrom("item_views").selectAll().execute(),
      ).toEqual([]);
    } finally {
      await close();
    }
  });
});
