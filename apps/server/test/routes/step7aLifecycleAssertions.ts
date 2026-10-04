import { expect } from "vitest";

import {
  getMilestoneResponseSchema,
  declineRemovalRequestResponseSchema,
  withdrawRemovalRequestResponseSchema,
  listRemovalRequestsResponseSchema,
  removalRequestEmailPayloadSchema,
  removalReminderEmailPayloadSchema,
  removalResolvedEmailPayloadSchema,
} from "@memory-shoebox/shared";
import { EMAIL_RENDERERS } from "../../src/mail/templates/emailTemplates.constants.ts";
import { runRemovalReminder } from "../../src/jobs/runRemovalReminder.ts";
import type { TestApp } from "../helpers/createTestApp.ts";

import type { LifecycleContext } from "./step7aLifecycleTestHelpers.ts";

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

/** Checks the first weekly reminder and its retry idempotence. */
export async function verifyLifecycleReminder(
  context: Readonly<LifecycleContext>,
): Promise<void> {
  const { database } = context;
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
}

const REMINDER = { now: "2026-10-05T10:00:00.000Z" };

/** Declines an ask and confirms reminders stop. */
export async function declineLifecycleRequest(
  context: Readonly<LifecycleContext>,
  requestId: string,
): Promise<void> {
  const { database, uploader, read } = context;
  const declined = await read(
    {
      method: "POST",
      url: `/api/removal-requests/${requestId}/decline`,
      headers: { cookie: uploader.cookie },
      payload: { declineReason: "Please keep this family memory." },
    },
    declineRemovalRequestResponseSchema,
  );
  expect(declined.state).toBe("declined");
  expect((await runRemovalReminder({ database, ...REMINDER })).due).toEqual([]);
}

/** Withdraws a fresh ask on behalf of its requester. */
export async function withdrawLifecycleRequest(
  context: Readonly<LifecycleContext>,
  requestId: string,
): Promise<void> {
  const { requester, read } = context;
  const withdrawn = await read(
    {
      method: "POST",
      url: `/api/removal-requests/${requestId}/withdraw`,
      headers: { cookie: requester.cookie },
    },
    withdrawRemovalRequestResponseSchema,
  );
  expect(withdrawn.state).toBe("withdrawn");
}

/** Deletes the item without calling storage during its transaction. */
export async function deleteLifecycleItem(
  context: Readonly<LifecycleContext>,
): Promise<void> {
  const { app, b2, admin, itemId } = context;
  const storageCallsBeforeDeletion = [...b2.calls];
  const deleted = await app.inject({
    method: "DELETE",
    url: `/api/items/${itemId}`,
    headers: { cookie: admin.cookie },
  });
  expect(deleted.statusCode).toBe(204);
  expect(b2.calls).toEqual(storageCallsBeforeDeletion);
  expect(deleted.body).toBe(""); // This route has no shared response body schema.
}

/** Checks all three outcomes after deletion nulls their item references. */
export async function verifyLifecycleSettledRequests(
  context: Readonly<LifecycleContext>,
  requestIds: Readonly<{ first: string; second: string; third: string }>,
): Promise<void> {
  const { admin, read } = context;
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
      [requestIds.first, "declined"],
      [requestIds.second, "withdrawn"],
      [requestIds.third, "deleted"],
    ]),
  );
  expect(
    settled.removalRequests.every((request) => {
      return request.itemId === null;
    }),
  ).toBe(true);
}

/** Confirms the empty occasion survives deletion and reminders stop. */
export async function verifyLifecycleMilestone(
  context: Readonly<LifecycleContext>,
  milestoneId: string,
): Promise<void> {
  const { database, requester, read } = context;
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
  expect((await runRemovalReminder({ database, ...REMINDER })).due).toEqual([]);
}

/** Checks catalog destruction and pending object cleanup. */
export async function verifyLifecycleDeletedStorage(
  context: Readonly<LifecycleContext>,
): Promise<void> {
  const { database } = context;
  expect(await database.selectFrom("items").selectAll().execute()).toEqual([]);
  expect(
    await database
      .selectFrom("removal_requests")
      .selectAll()
      .where("state", "=", "open")
      .execute(),
  ).toEqual([]);
  expect(
    await database.selectFrom("pending_object_deletions").selectAll().execute(),
  ).toHaveLength(2);
}

function _makeExpectedMailPairsFromRequests(
  context: Readonly<LifecycleContext>,
  requestIds: Readonly<{ first: string; second: string; third: string }>,
): Array<{ key: string; memberId: string }> {
  const { uploader, requester, admin } = context;
  return [
    ...[requestIds.first, requestIds.second, requestIds.third].flatMap(
      (requestId) => {
        return [uploader, admin].map((member) => {
          return {
            key: `removal:${requestId}:${member.memberId}`,
            memberId: member.memberId,
          };
        });
      },
    ),
    ...[uploader, admin].map((member) => {
      return {
        key: `removal-reminder:${requestIds.first}:${member.memberId}:1`,
        memberId: member.memberId,
      };
    }),
    {
      key: `removal-resolved:${requestIds.first}:${requester.memberId}`,
      memberId: requester.memberId,
    },
    {
      key: `removal-resolved:${requestIds.second}:${uploader.memberId}`,
      memberId: uploader.memberId,
    },
    {
      key: `removal-resolved:${requestIds.second}:${admin.memberId}`,
      memberId: admin.memberId,
    },
    {
      key: `removal-resolved:${requestIds.third}:${requester.memberId}`,
      memberId: requester.memberId,
    },
    {
      key: `removal-resolved:${requestIds.third}:${uploader.memberId}`,
      memberId: uploader.memberId,
    },
  ];
}

/** Checks exact recipients, keys, queue states, and rendered mail. */
export async function verifyLifecycleQueuedMail(
  context: Readonly<LifecycleContext>,
  requestIds: Readonly<{ first: string; second: string; third: string }>,
): Promise<void> {
  const { database } = context;
  const queuedMail = await database
    .selectFrom("outbound_emails")
    .select(["to_member_id", "idempotency_key", "state"])
    .execute();
  const expectedPairs = _makeExpectedMailPairsFromRequests(context, requestIds);
  expect(queuedMail).toHaveLength(13);
  expect(
    new Set(
      queuedMail.map((email) => {
        return `${email.idempotency_key}:${email.to_member_id}`;
      }),
    ),
  ).toEqual(
    new Set(
      expectedPairs.map((pair) => {
        return `${pair.key}:${pair.memberId}`;
      }),
    ),
  );
  expect(
    queuedMail.every((email) => {
      return email.state === "queued";
    }),
  ).toBe(true);
  await _expectRenderableMail(database);
}
