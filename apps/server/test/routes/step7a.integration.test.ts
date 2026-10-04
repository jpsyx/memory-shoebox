import { describe, expect, it } from "vitest";
import type { InjectOptions } from "fastify";
import type { ZodType } from "zod";
import {
  createMilestoneResponseSchema,
  getMilestoneResponseSchema,
  listMilestoneCandidatesResponseSchema,
  listMilestoneMismatchesResponseSchema,
  setMilestoneItemsResponseSchema,
  reconcileMilestoneResponseSchema,
  timelineResponseSchema,
  createRemovalRequestResponseSchema,
  declineRemovalRequestResponseSchema,
  withdrawRemovalRequestResponseSchema,
  listItemRemovalRequestsResponseSchema,
  listRemovalRequestsResponseSchema,
  removalRequestEmailPayloadSchema,
  removalReminderEmailPayloadSchema,
  removalResolvedEmailPayloadSchema,
} from "@memory-shoebox/shared";
import { EMAIL_RENDERERS } from "../../src/mail/templates/emailTemplates.constants.ts";
import { runRemovalReminder } from "../../src/jobs/runRemovalReminder.ts";
import { createTestApp, type TestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import {
  NOW,
  insertInstanceSetting,
  insertItem,
  insertItemPerson,
  insertPerson,
  insertRendition,
} from "../helpers/seedHelpers/seedHelpers.ts";

async function _readResponse<Output>(
  options: Readonly<{
    app: TestApp["app"];
    request: InjectOptions;
    schema: ZodType<Output>;
    status?: number;
  }>,
): Promise<Output> {
  const response = await options.app.inject(options.request);
  expect(response.statusCode, response.body).toBe(options.status ?? 200);
  return options.schema.parse(response.json());
}

async function _expectRenderableMail(
  database: TestApp["database"],
): Promise<void> {
  const emails = await database
    .selectFrom("outbound_emails")
    .selectAll()
    .execute();
  const renderedKinds = new Set<string>();
  for (const email of emails) {
    const storedPayload: unknown = JSON.parse(email.payload_json);
    if (email.kind === "removal_request") {
      const payload = removalRequestEmailPayloadSchema.parse(storedPayload);
      const rendered = await EMAIL_RENDERERS.removal_request(payload);
      expect(rendered.html).toContain("Nothing has happened");
      expect(rendered.text).toContain("Nothing has happened");
      renderedKinds.add("request");
    } else if (email.kind === "removal_reminder") {
      const payload = removalReminderEmailPayloadSchema.parse(storedPayload);
      expect(payload.weekIndex).toBe(1);
      const rendered = await EMAIL_RENDERERS.removal_reminder(payload);
      expect(rendered.html).toContain("still waiting");
      expect(rendered.text).toContain("still waiting");
      renderedKinds.add("reminder");
    } else {
      expect(email.kind).toBe("removal_resolved");
      const payload = removalResolvedEmailPayloadSchema.parse(storedPayload);
      const rendered = await EMAIL_RENDERERS.removal_resolved(payload);
      expect(rendered.html.length).toBeGreaterThan(100);
      expect(rendered.text.length).toBeGreaterThan(100);
      renderedKinds.add(payload.outcome);
      if (payload.outcome === "declined") {
        expect(rendered.text).toContain("Please keep this family memory.");
      }
    }
  }
  expect(renderedKinds).toEqual(
    new Set(["request", "reminder", "declined", "withdrawn", "deleted"]),
  );
}

// Catches composition breaks: stale attachment filters after a move, missing
// outcome enqueues, failure to settle before SET NULL, or deleting the occasion.
describe("step 7a integrated lifecycle", () => {
  it("keeps an occasion while three successive asks settle, rendering every mail outcome", async () => {
    const { app, database, b2, close } = await createTestApp({
      clock: () => {
        return new Date(NOW);
      },
    });
    try {
      const uploader = await insertSignedInMember({
        database,
        token: "uploader",
        member: { role: "uploader" },
      });
      const requester = await insertSignedInMember({
        database,
        token: "requester",
        member: { role: "viewer", notify_on_removal: 0 },
      });
      const admin = await insertSignedInMember({
        database,
        token: "admin",
        member: { role: "admin" },
      });
      await insertInstanceSetting(database, {
        key: "public.base_url",
        value: "https://shoebox.example",
      });
      const itemId = await insertItem(database, {
        uploadedBy: uploader.memberId,
      });
      await insertRendition(database, { itemId, purpose: "original" });
      await insertRendition(database, { itemId });
      const personId = await insertPerson(database, {
        displayName: "Requester",
        member_id: requester.memberId,
      });
      await insertItemPerson(database, { itemId, personId });
      const read = <Output>(
        request: InjectOptions,
        schema: ZodType<Output>,
        status = 200,
      ): Promise<Output> => {
        return _readResponse({ app, request, schema, status });
      };
      const milestone = await read(
        {
          method: "POST",
          url: "/api/milestones",
          headers: { cookie: uploader.cookie },
          payload: {
            name: "Family weekend",
            startsOn: "2026-09-20",
            endsOn: "2026-09-22",
            blurb: null,
          },
        },
        createMilestoneResponseSchema,
        201,
      );
      const milestoneId = milestone.milestone.milestoneId;
      expect(milestone).toMatchObject({
        itemCount: 0,
        dayCount: 3,
        mismatchCount: 0,
      });
      const candidates = await read(
        {
          url: `/api/milestones/${milestoneId}/candidates?scope=all`,
          headers: { cookie: uploader.cookie },
        },
        listMilestoneCandidatesResponseSchema,
      );
      expect(candidates.candidates).toMatchObject([
        { item: { itemId }, isAttached: false, isOutsideSpan: true },
      ]);
      const attached = await read(
        {
          method: "PATCH",
          url: `/api/milestones/${milestoneId}/items`,
          headers: { cookie: uploader.cookie },
          payload: { attach: [itemId], detach: [] },
        },
        setMilestoneItemsResponseSchema,
      );
      expect(attached).toMatchObject({
        attachedCount: 1,
        detachedCount: 0,
        mismatchCount: 1,
      });
      const mismatches = await read(
        {
          url: `/api/milestones/${milestoneId}/mismatches`,
          headers: { cookie: uploader.cookie },
        },
        listMilestoneMismatchesResponseSchema,
      );
      expect(mismatches.mismatches).toMatchObject([{ item: { itemId } }]);
      const reconciled = await read(
        {
          method: "POST",
          url: `/api/milestones/${milestoneId}/reconcile`,
          headers: { cookie: uploader.cookie },
          payload: {
            mode: "move",
            moves: [{ itemId, targetOn: "2026-09-21" }],
          },
        },
        reconcileMilestoneResponseSchema,
      );
      expect(reconciled).toMatchObject({ movedCount: 1, mismatchCount: 0 });
      const timeline = await read(
        {
          url: `/api/timeline?people=${personId}&attachedToMilestoneId=${milestoneId}`,
          headers: { cookie: requester.cookie },
        },
        timelineResponseSchema,
      );
      expect(timeline.resultCount).toBe(1);
      expect(timeline.days).toMatchObject([
        { capturedOn: "2026-09-21", items: [{ itemId }] },
      ]);
      const excluded = await read(
        {
          url: `/api/timeline?people=${personId}&attachedToMilestoneId=${milestoneId}&excludeAttached=true`,
          headers: { cookie: requester.cookie },
        },
        timelineResponseSchema,
      );
      expect(excluded.resultCount).toBe(0);
      expect(excluded.days).toEqual([]);
      const ask = () => {
        return read(
          {
            method: "POST",
            url: `/api/items/${itemId}/removal-requests`,
            headers: { cookie: requester.cookie },
            payload: { reason: "Please take this down." },
          },
          createRemovalRequestResponseSchema,
          201,
        );
      };
      const first = await ask();
      expect(first).toMatchObject({
        state: "open",
        canWithdraw: true,
        itemCapturedAt: "2026-09-21T10:00:00.000Z",
      });
      const itemRequests = await read(
        {
          url: `/api/items/${itemId}/removal-requests`,
          headers: { cookie: requester.cookie },
        },
        listItemRemovalRequestsResponseSchema,
      );
      expect(itemRequests).toMatchObject({
        canRequestRemoval: false,
        removalRequests: [{ requestId: first.requestId }],
      });
      const reminder = { database, now: "2026-10-05T10:00:00.000Z" };
      expect((await runRemovalReminder(reminder)).due).toHaveLength(2);
      await runRemovalReminder(reminder);
      expect(
        await database
          .selectFrom("outbound_emails")
          .selectAll()
          .where("kind", "=", "removal_reminder")
          .execute(),
      ).toHaveLength(2);
      const declined = await read(
        {
          method: "POST",
          url: `/api/removal-requests/${first.requestId}/decline`,
          headers: { cookie: uploader.cookie },
          payload: { declineReason: "Please keep this family memory." },
        },
        declineRemovalRequestResponseSchema,
      );
      expect(declined.state).toBe("declined");
      expect((await runRemovalReminder(reminder)).due).toEqual([]);
      const second = await ask();
      const withdrawn = await read(
        {
          method: "POST",
          url: `/api/removal-requests/${second.requestId}/withdraw`,
          headers: { cookie: requester.cookie },
        },
        withdrawRemovalRequestResponseSchema,
      );
      expect(withdrawn.state).toBe("withdrawn");
      const third = await ask();
      const storageCallsBeforeDeletion = [...b2.calls];
      const deleted = await app.inject({
        method: "DELETE",
        url: `/api/items/${itemId}`,
        headers: { cookie: admin.cookie },
      });
      expect(deleted.statusCode).toBe(204);
      expect(b2.calls).toEqual(storageCallsBeforeDeletion);
      expect(deleted.body).toBe(""); // This route has no shared response body schema.
      const settled = await read(
        {
          url: "/api/removal-requests?state=settled",
          headers: { cookie: admin.cookie },
        },
        listRemovalRequestsResponseSchema,
      );
      expect(settled).toMatchObject({ openCount: 0, settledCount: 3 });
      expect(settled.removalRequests).toHaveLength(3);
      expect(
        new Map(
          settled.removalRequests.map((request) => {
            return [request.requestId, request.state];
          }),
        ),
      ).toEqual(
        new Map([
          [first.requestId, "declined"],
          [second.requestId, "withdrawn"],
          [third.requestId, "deleted"],
        ]),
      );
      expect(
        settled.removalRequests.every((request) => {
          return request.itemId === null;
        }),
      ).toBe(true);
      const surviving = await read(
        {
          url: `/api/milestones/${milestoneId}`,
          headers: { cookie: requester.cookie },
        },
        getMilestoneResponseSchema,
      );
      expect(surviving).toMatchObject({
        itemCount: 0,
        dayCount: 3,
        mismatchCount: 0,
      });
      expect((await runRemovalReminder(reminder)).due).toEqual([]);
      expect(await database.selectFrom("items").selectAll().execute()).toEqual(
        [],
      );
      expect(
        await database
          .selectFrom("removal_requests")
          .selectAll()
          .where("state", "=", "open")
          .execute(),
      ).toEqual([]);
      expect(
        await database
          .selectFrom("pending_object_deletions")
          .selectAll()
          .execute(),
      ).toHaveLength(2);
      const queuedMail = await database
        .selectFrom("outbound_emails")
        .select(["to_member_id", "idempotency_key", "state"])
        .execute();
      const expectedKeys = [
        ...[first, second, third].flatMap((request) => {
          return [uploader, admin].map((member) => {
            return `removal:${request.requestId}:${member.memberId}`;
          });
        }),
        ...[uploader, admin].map((member) => {
          return `removal-reminder:${first.requestId}:${member.memberId}:1`;
        }),
        `removal-resolved:${first.requestId}:${requester.memberId}`,
        `removal-resolved:${second.requestId}:${uploader.memberId}`,
        `removal-resolved:${second.requestId}:${admin.memberId}`,
        `removal-resolved:${third.requestId}:${requester.memberId}`,
        `removal-resolved:${third.requestId}:${uploader.memberId}`,
      ];
      expect(queuedMail).toHaveLength(13);
      expect(
        new Set(
          queuedMail.map((email) => {
            return email.idempotency_key;
          }),
        ),
      ).toEqual(new Set(expectedKeys));
      expect(
        queuedMail.every((email) => {
          return email.state === "queued";
        }),
      ).toBe(true);
      await _expectRenderableMail(database);
    } finally {
      await close();
    }
  });
});
