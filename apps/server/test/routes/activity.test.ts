import type { LightMyRequestResponse } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import {
  activityResponseSchema,
  type ActivityEntryDto,
} from "@memory-shoebox/shared";
import { createTestApp, type TestApp } from "../helpers/createTestApp.ts";
import { makeViewer } from "../helpers/makeViewer.ts";
import { createId } from "../../src/db/createId.ts";
import type { Database } from "../../src/db/types/db.types.ts";
import {
  insertMember,
  insertSession,
  insertItem,
  insertComment,
} from "../helpers/seedHelpers/seedHelpers.ts";

let testApp: TestApp;
afterEach(async () => {
  await testApp?.close();
});

async function _createApp(isAdmin = true): Promise<string> {
  const memberId = createId();
  testApp = await createTestApp({
    authenticate: async () => {
      return makeViewer({ memberId, isAdmin });
    },
  });
  await insertMember(testApp.database, {
    id: memberId,
    role: isAdmin ? "admin" : "viewer",
  });
  return memberId;
}

async function _insertEvent(
  overrides: Partial<Database["activity_events"]> = {},
): Promise<string> {
  const id = overrides.id ?? createId();
  await testApp.database
    .insertInto("activity_events")
    .values({
      id,
      kind: "item_deleted",
      occurred_at: "2026-09-27T10:00:00.000Z",
      actor_member_id: null,
      actor_label: "Rosa at the time",
      subject_kind: "item",
      subject_id: createId(),
      subject_label: "Gone photograph",
      device_id: null,
      device_label: "Old phone",
      detail_json: null,
      ...overrides,
    })
    .execute();
  return id;
}

async function _readPages(cursor?: string): Promise<ActivityEntryDto[]> {
  const response = await testApp.app.inject({
    url: `/api/activity?limit=2${cursor === undefined ? "" : `&cursor=${cursor}`}`,
  });
  expect(response.statusCode).toBe(200);
  const page = activityResponseSchema.parse(response.json());
  return [
    ...page.activity,
    ...(page.nextCursor === null ? [] : await _readPages(page.nextCursor)),
  ];
}

function _expectStoredActivityDetails(
  options: Readonly<{
    settingFilter: LightMyRequestResponse;
    response: LightMyRequestResponse;
  }>,
): void {
  const { settingFilter, response } = options;
  expect(settingFilter.statusCode).toBe(200);
  expect(settingFilter.json().activity).toHaveLength(1);
  expect(settingFilter.json().activity[0].subject).toEqual({
    kind: "setting",
    id: "shoebox.timezone",
    label: "Gone photograph",
  });
  expect(
    activityResponseSchema.parse(response.json()).activity.map((entry) => {
      return entry.detail;
    }),
  ).toEqual([
    null,
    {
      kind: "setting_changed",
      settingKey: "shoebox.timezone",
      fromValue: "Europe/Madrid",
      toValue: "America/New_York",
    },
    { kind: "item_visibility_changed", fromLabel: null, toLabel: null },
    {
      kind: "group_membership_changed",
      addedLabels: ["Added"],
      removedLabels: ["Removed"],
    },
    { kind: "member_role_changed", fromRole: "viewer", toRole: "admin" },
  ]);
}

async function _expectStoredActivityDetailReads(): Promise<void> {
  await _createApp();
  await _insertEvent({
    kind: "member_role_changed",
    detail_json: JSON.stringify({
      fromRole: "viewer",
      toRole: "admin",
      secret: "never expose",
    }),
  });
  await _insertEvent({
    kind: "group_membership_changed",
    detail_json: JSON.stringify({
      added: [{ memberId: createId(), displayName: "Added" }],
      removed: [{ memberId: createId(), displayName: "Removed" }],
      secret: "never expose",
    }),
  });
  await _insertEvent({
    kind: "item_visibility_changed",
    detail_json: JSON.stringify({
      previousVisibilityRuleId: createId(),
      visibilityRuleId: createId(),
      secret: "never expose",
    }),
  });
  await _insertEvent({
    kind: "setting_changed",
    subject_kind: "setting",
    subject_id: "shoebox.timezone",
    detail_json: JSON.stringify({
      fromValue: "Europe/Madrid",
      toValue: "America/New_York",
      secret: "never expose",
    }),
  });
}

describe("activity", () => {
  it.each([
    "/api/presence",
    "/api/activity",
    `/api/items/${createId()}/viewers`,
  ])("requires authentication for %s", async (url) => {
    testApp = await createTestApp({
      authenticate: async () => {
        return undefined;
      },
    });
    const response = await testApp.app.inject({ url });
    expect(response.statusCode).toBe(401);
    expect(response.json().error).toBe("not_signed_in");
  });

  it("requires an admin and rejects invalid filters and cursors", async () => {
    await _createApp(false);
    expect(
      (await testApp.app.inject({ url: "/api/activity?limit=nope" }))
        .statusCode,
    ).toBe(403);
    await testApp.close();
    await _createApp();
    await Promise.all(
      [
        "limit=0",
        "limit=201",
        "limit=nope",
        "family=other",
        "cursor=bad",
        "cursor=e30",
        "unknown=1",
      ].map(async (query) => {
        expect(
          (await testApp.app.inject({ url: `/api/activity?${query}` }))
            .statusCode,
        ).toBe(400);
      }),
    );
  });

  it("pages timestamp ties by id without duplicates and combines actor, subject and family filters", async () => {
    const actorId = await _createApp();
    const subjectId = createId();
    const ids = await Promise.all(
      Array.from({ length: 5 }, () => {
        return _insertEvent({
          actor_member_id: actorId,
          subject_id: subjectId,
        });
      }),
    );
    const olderId = await _insertEvent({
      occurred_at: "2026-09-26T00:00:00.000Z",
    });
    await _insertEvent({
      kind: "group_created",
      subject_kind: "group",
      actor_member_id: actorId,
      subject_id: subjectId,
    });
    const first = await testApp.app.inject({ url: "/api/activity?limit=2" });
    expect(first.statusCode).toBe(200);
    expect(first.json().nextCursor).not.toBe(null);
    const allPages = await _readPages();
    expect(
      new Set(
        allPages.map((entry) => {
          return entry.entryId;
        }),
      ).size,
    ).toBe(allPages.length);
    expect(allPages).toHaveLength(7);
    expect(allPages.at(-1)?.entryId).toBe(olderId);
    const filtered = await testApp.app.inject({
      url: `/api/activity?actorMemberId=${actorId}&subjectId=${subjectId}&family=destruction`,
    });
    expect(
      filtered.json().activity.map((entry: ActivityEntryDto) => {
        return entry.entryId;
      }),
    ).toEqual(ids.toSorted().reverse());
    expect(filtered.json().nextCursor).toBe(null);
  });

  it("preserves historical actor, device and dangling subject labels and never unions live content", async () => {
    const actorId = await _createApp();
    const sessionId = await insertSession(testApp.database, {
      memberId: actorId,
    });
    const eventId = await _insertEvent({
      actor_member_id: actorId,
      device_id: sessionId,
    });
    const itemId = await insertItem(testApp.database, { uploadedBy: actorId });
    await insertComment(testApp.database, { itemId, authorMemberId: actorId });
    await testApp.database
      .insertInto("item_reactions")
      .values({
        id: createId(),
        item_id: itemId,
        member_id: actorId,
        kind: "love",
        created_at: "2026-09-27T10:00:00.000Z",
      })
      .execute();
    await testApp.database
      .updateTable("members")
      .set({ display_name: "Renamed actor" })
      .where("id", "=", actorId)
      .execute();
    await testApp.database
      .updateTable("sessions")
      .set({ device_label: "Renamed phone" })
      .where("id", "=", sessionId)
      .execute();
    await testApp.database
      .deleteFrom("sessions")
      .where("id", "=", sessionId)
      .execute();
    const response = await testApp.app.inject({ url: "/api/activity" });
    expect(response.statusCode).toBe(200);
    expect(activityResponseSchema.parse(response.json()).activity).toEqual([
      expect.objectContaining({
        entryId: eventId,
        actor: { memberId: actorId, label: "Rosa at the time" },
        deviceLabel: "Old phone",
        subject: expect.objectContaining({ label: "Gone photograph" }),
        detail: null,
      }),
    ]);
  });

  it("projects stored detail variants without debug fields", async () => {
    await _expectStoredActivityDetailReads();
    await _insertEvent({
      kind: "group_created",
      detail_json: "unused non-JSON payload",
    });
    const response = await testApp.app.inject({ url: "/api/activity" });
    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain("never expose");
    const settingFilter = await testApp.app.inject({
      url: "/api/activity?subjectId=shoebox.timezone&family=authority",
    });
    _expectStoredActivityDetails({ settingFilter, response });
  });

  it("rejects an unmapped stored kind even when filters or pagination would hide it", async () => {
    await _createApp();
    await _insertEvent({ kind: "group_created" });
    // Only this disposable fixture table loses constraints; migrations stay
    // intact.
    await sql`create table corrupt_activity as select * from activity_events`.execute(
      testApp.database,
    );
    await sql`drop table activity_events`.execute(testApp.database);
    await sql`alter table corrupt_activity rename to activity_events`.execute(
      testApp.database,
    );
    await _insertEvent({
      kind: "unknown_kind",
      occurred_at: "2020-01-01T00:00:00.000Z",
    });
    const response = await testApp.app.inject({
      url: "/api/activity?family=authority&limit=1",
    });
    expect(response.statusCode).toBe(500);
  });
});
