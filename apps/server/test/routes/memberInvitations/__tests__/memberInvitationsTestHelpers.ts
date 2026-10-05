import type {
  AdminMemberDto,
  InvitationEmailPayload,
} from "@memory-shoebox/shared";
import { adminMemberDtoSchema } from "@memory-shoebox/shared";
import type { LightMyRequestResponse } from "fastify";
import { expect } from "vitest";
import type {
  Database,
  DatabaseExecutor,
} from "../../../../src/db/types/db.types.ts";
import { createOwnedTestApp } from "../../../helpers/createOwnedTestApp/createOwnedTestApp.ts";
import type { RecordingEmailService } from "../../../helpers/createRecordingEmailService.ts";
import type { TestApp } from "../../../helpers/createTestApp.ts";
import type { SignedInMember } from "../../../helpers/insertSignedInMember.ts";
import { insertSignedInMember } from "../../../helpers/insertSignedInMember.ts";
import {
  insertInstanceSetting,
  insertItem,
  insertVisibilityRule,
  insertVisibilityRuleSubject,
  NOW,
} from "../../../helpers/seedHelpers/seedHelpers.ts";

/** Provides memberInvitations catalog fixtures and request controls. */
export async function createMemberInvitationsFixture(): Promise<
  TestApp & {
    admin: SignedInMember;
    invite: (
      body: Readonly<Record<string, unknown>>,
    ) => Promise<LightMyRequestResponse>;
  }
> {
  const fixture = await createOwnedTestApp({
    clock: () => {
      return new Date(NOW);
    },
  });
  const admin = await insertSignedInMember({
    database: fixture.database,
    member: { role: "admin", display_name: "Rosa", email: "rosa@example.com" },
  });
  await insertInstanceSetting(fixture.database, {
    key: "public.base_url",
    value: "https://shoebox.example",
  });
  return {
    ...fixture,
    admin,
    invite: (body: Record<string, unknown>) => {
      return fixture.app.inject({
        method: "POST",
        url: "/api/members",
        headers: { cookie: admin.cookie },
        payload: body,
      });
    },
  };
}

type ExpectFrozenInvitationAttributionOptions = {
  payload: InvitationEmailPayload;
  member: AdminMemberDto;
  database: DatabaseExecutor;
  admin: SignedInMember;
};

/** Checks frozen invitation attribution. */
export async function expectFrozenInvitationAttribution(
  options: Readonly<ExpectFrozenInvitationAttributionOptions>,
): Promise<void> {
  const { payload, member, database, admin } = options;
  expect(payload).toMatchObject({
    visibleItemCount: 1,
    memberCount: 2,
    inviterDisplayName: "Rosa",
    inviterEmail: "rosa@example.com",
    invitedAddress: member.email,
    joinUrl: "https://shoebox.example/join?address=ana%2Bfamily%40example.com",
  });
  expect(
    (await database.selectFrom("activity_events").selectAll().execute())[0],
  ).toMatchObject({
    kind: "member_invited",
    subject_kind: "member",
    subject_id: member.memberId,
    actor_member_id: admin.memberId,
  });
}

type ExpectDeliveredInvitationMailOptions = {
  sender: RecordingEmailService;
  member: AdminMemberDto;
  database: DatabaseExecutor;
  queueRow: Database["outbound_emails"];
};

/** Checks delivered invitation mail. */
export async function expectDeliveredInvitationMail(
  options: Readonly<ExpectDeliveredInvitationMailOptions>,
): Promise<void> {
  const { sender, member, database, queueRow } = options;
  expect(sender.sent).toHaveLength(1);
  expect(sender.sent[0]).toMatchObject({
    from: "New sender <mail@example.com>",
    to: member.email,
    subject: "Rosa has added you to My Shoebox",
  });
  expect(sender.sent[0]?.text).toContain("rosa@example.com");
  expect(
    (
      await database
        .selectFrom("outbound_emails")
        .selectAll()
        .executeTakeFirstOrThrow()
    ).payload_json,
  ).toBe(queueRow.payload_json);
}

type ExpectRestoredMemberIdentityOptions = {
  response: LightMyRequestResponse;
  database: DatabaseExecutor;
  ownItemId: string;
  memberId: string;
};

/** Checks restored member identity. */
export async function expectRestoredMemberIdentity(
  options: Readonly<ExpectRestoredMemberIdentityOptions>,
): Promise<void> {
  const { response, database, ownItemId, memberId } = options;
  expect(response.statusCode).toBe(201);
  expect(response.json()).toMatchObject({
    memberId,
    displayName: "Original",
    joinedAt: NOW,
    lastSignedInAt: NOW,
    createdAt: NOW,
    removedAt: null,
  });
  expect(
    (
      await database
        .selectFrom("items")
        .selectAll()
        .where("id", "=", ownItemId)
        .executeTakeFirstOrThrow()
    ).uploaded_by,
  ).toBe(memberId);
  expect(
    await database.selectFrom("item_people").selectAll().execute(),
  ).toHaveLength(1);
  expect(
    JSON.parse(
      (
        await database
          .selectFrom("outbound_emails")
          .selectAll()
          .executeTakeFirstOrThrow()
      ).payload_json,
    ).visibleItemCount,
  ).toBe(2);
}

type FrozenInvitationFixtureResult = {
  database: DatabaseExecutor;
  member: AdminMemberDto;
  admin: SignedInMember;
  close: () => Promise<void>;
};

/** Provides memberInvitations catalog fixtures and request controls. */
export async function prepareFrozenInvitationFixture(): Promise<FrozenInvitationFixtureResult> {
  const fixture = await createMemberInvitationsFixture();
  const { database, admin, close, invite } = fixture;
  await insertItem(database, { uploadedBy: admin.memberId });
  const restricted = await insertVisibilityRule(database, { mode: "only" });
  await insertVisibilityRuleSubject(database, {
    ruleId: restricted,
    memberId: admin.memberId,
  });
  await insertItem(database, {
    uploadedBy: admin.memberId,
    visibility_rule_id: restricted,
    seq: 1,
  });
  await insertItem(database, {
    uploadedBy: admin.memberId,
    visibility_rule_id: restricted,
    seq: 2,
  });
  const response = await invite({
    email: " ANA+family@EXAMPLE.COM ",
    displayName: " Ana ",
    role: "viewer",
  });
  expect(response.statusCode).toBe(201);
  const member = adminMemberDtoSchema.parse(response.json());
  expect(member).toMatchObject({
    email: "ana+family@example.com",
    displayName: "Ana",
    status: "invited",
    role: "viewer",
    joinedAt: null,
    lastSignedInAt: null,
  });
  return { database, member, admin, close };
}
