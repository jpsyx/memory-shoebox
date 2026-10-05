import { describe, it } from "vitest";
import {
  insertGroup,
  insertGroupMember,
  insertItem,
  insertItemPerson,
  insertMember,
  insertPerson,
  insertVisibilityRule,
  insertVisibilityRuleSubject,
  NOW,
} from "../../../helpers/seedHelpers/seedHelpers.ts";
import {
  createMemberInvitationsFixture,
  expectRestoredMemberIdentity,
} from "./memberInvitationsTestHelpers.ts";

describe("member invitations", () => {
  it("reuses removed identity, timestamps, content and person links and expands its groups", async () => {
    const { database, admin, close, invite } =
      await createMemberInvitationsFixture();
    const memberId = await insertMember(database, {
      email: "returning@example.com",
      display_name: "Original",
      status: "removed",
      removed_at: NOW,
    });
    const personId = await insertPerson(database, {
      displayName: "Original",
      member_id: memberId,
    });
    const ownItemId = await insertItem(database, { uploadedBy: memberId });
    await insertItemPerson(database, { itemId: ownItemId, personId });
    const groupId = await insertGroup(database);
    await insertGroupMember(database, { groupId, memberId });
    const ruleId = await insertVisibilityRule(database, { mode: "only" });
    await insertVisibilityRuleSubject(database, { ruleId, groupId });
    await insertItem(database, {
      uploadedBy: admin.memberId,
      seq: 2,
      visibility_rule_id: ruleId,
    });
    const response = await invite({
      email: "returning@example.com",
      role: "uploader",
    });
    await expectRestoredMemberIdentity({
      response,
      database,
      ownItemId,
      memberId,
    });
    await close();
  });
});
