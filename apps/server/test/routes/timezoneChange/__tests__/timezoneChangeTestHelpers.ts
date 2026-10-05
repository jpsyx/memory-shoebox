import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { expect } from "vitest";
import type {
  Database,
  DatabaseExecutor,
} from "../../../../src/db/types/db.types.ts";
import type { Viewer } from "../../../../src/http/requestContextHelpers.ts";
import { createOwnedTestApp } from "../../../helpers/createOwnedTestApp/createOwnedTestApp.ts";
import type { TestApp } from "../../../helpers/createTestApp.ts";
import {
  insertBurst,
  insertItem,
  insertItemMilestone,
  insertMember,
  insertMilestone,
  insertRendition,
  insertUploadFile,
  insertUploadSession,
  NOW,
} from "../../../helpers/seedHelpers/seedHelpers.ts";

type TimezoneFixture = TestApp & {
  emptyBurst: string;
  survivingBurst: string;
  milestoneId: string;
};

type TimezoneSnapshot = {
  settings: Array<Database["settings"]>;
  items: Array<Database["items"]>;
  history: Array<Database["item_capture_date_changes"]>;
  bursts: Array<Database["bursts"]>;
  joins: Array<Database["item_milestones"]>;
  files: Array<Database["upload_files"]>;
  audit: Array<Database["activity_events"]>;
};

/** Shared timezoneChange test input. */
export const ADMIN = {
  memberId: "019f1234-0000-7000-8000-000000000001",
  sessionId: "session",
  role: "admin",
  isAdmin: true,
  visibleRuleIds: [],
} as const satisfies Viewer;

type TimezoneItemDefinition = {
  id: string;
  captured_at: string;
  captured_on: string;
  captured_at_offset_minutes: number | null;
  burst_id: string | null;
  burst_index: number | null;
};

/** Returns burst-ejection and fixed-offset timezone item definitions. */
export function makeTimezoneItemsFromBursts(
  options: Readonly<{ emptyBurst: string; survivingBurst: string }>,
): TimezoneItemDefinition[] {
  const { emptyBurst, survivingBurst } = options;
  return [
    {
      id: "019f1234-0000-7000-8000-000000000002",
      captured_at: "2026-03-08T04:30:00.000Z",
      captured_on: "2026-03-08",
      captured_at_offset_minutes: null,
      burst_id: emptyBurst,
      burst_index: 0,
    },
    {
      id: "019f1234-0000-7000-8000-000000000003",
      captured_at: "2026-03-08T04:59:59.000Z",
      captured_on: "2026-03-08",
      captured_at_offset_minutes: null,
      burst_id: survivingBurst,
      burst_index: 0,
    },
    {
      id: "019f1234-0000-7000-8000-000000000004",
      captured_at: "2026-03-08T07:30:00.000Z",
      captured_on: "2026-03-08",
      captured_at_offset_minutes: null,
      burst_id: survivingBurst,
      burst_index: 1,
    },
    {
      id: "019f1234-0000-7000-8000-000000000005",
      captured_at: "2026-03-08T04:30:00.000Z",
      captured_on: "2026-03-08",
      captured_at_offset_minutes: 120,
      burst_id: null,
      burst_index: null,
    },
  ];
}

async function _insertTimezoneMilestone(
  database: DatabaseExecutor,
): Promise<string> {
  const milestoneId = await insertMilestone(database, {
    name: "Sunday",
    startsOn: "2026-03-08",
  });
  for (const itemId of [
    "019f1234-0000-7000-8000-000000000002",
    "019f1234-0000-7000-8000-000000000003",
    "019f1234-0000-7000-8000-000000000004",
  ]) {
    await insertItemMilestone(database, {
      itemId,
      milestoneId,
      span_mismatch_acknowledged_at: NOW,
    });
  }
  return milestoneId;
}

/** Provides timezoneChange catalog fixtures and request controls. */
export async function createTimezoneChangeFixture(): Promise<TimezoneFixture> {
  const context = await createOwnedTestApp({
    authenticate: async () => {
      return ADMIN;
    },
    clock: () => {
      return new Date(NOW);
    },
  });
  const { database } = context;
  await insertMember(database, { id: ADMIN.memberId, role: "admin" });
  const sessionId = await insertUploadSession(database, {
    uploadedBy: ADMIN.memberId,
  });
  const emptyBurst = await insertBurst(database, {
    uploadSessionId: sessionId,
    capturedOn: "2026-03-08",
  });
  const survivingBurst = await insertBurst(database, {
    uploadSessionId: sessionId,
    capturedOn: "2026-03-08",
  });
  const definitions = makeTimezoneItemsFromBursts({
    emptyBurst,
    survivingBurst,
  });
  for (const [sequence, definition] of definitions.entries()) {
    await insertItem(database, {
      uploadedBy: ADMIN.memberId,
      seq: sequence,
      ...definition,
      original_captured_at: definition.captured_at,
    });
    await insertRendition(database, { itemId: definition.id });
  }
  await insertUploadFile(database, {
    uploadSessionId: sessionId,
    item_id: "019f1234-0000-7000-8000-000000000002",
    captured_at: "2026-03-08T04:30:00.000Z",
    capture_date: "2026-03-08",
    original_captured_at: "2026-03-08T04:30:00.000Z",
  });
  const milestoneId = await _insertTimezoneMilestone(database);
  return { ...context, emptyBurst, survivingBurst, milestoneId };
}

/** Returns the catalog state used to verify timezone changes. */
export async function snapshot(
  database: Awaited<ReturnType<typeof createTimezoneChangeFixture>>["database"],
): Promise<TimezoneSnapshot> {
  return {
    settings: await database.selectFrom("settings").selectAll().execute(),
    items: await database.selectFrom("items").selectAll().execute(),
    history: await database
      .selectFrom("item_capture_date_changes")
      .selectAll()
      .execute(),
    bursts: await database.selectFrom("bursts").selectAll().execute(),
    joins: await database.selectFrom("item_milestones").selectAll().execute(),
    files: await database.selectFrom("upload_files").selectAll().execute(),
    audit: await database.selectFrom("activity_events").selectAll().execute(),
  };
}

type ExpectTimezonePreviewWithoutWritesOptions = {
  preview: LightMyRequestResponse;
  database: DatabaseExecutor;
  before: TimezoneSnapshot;
  milestoneId: string;
};

/** Checks timezone preview without writes. */
export async function expectTimezonePreviewWithoutWrites(
  options: Readonly<ExpectTimezonePreviewWithoutWritesOptions>,
): Promise<void> {
  const { preview, database, before, milestoneId } = options;
  expect(preview.statusCode).toBe(200);
  expect(preview.json().isPreview).toBe(true);
  expect(preview.json().shoebox).toEqual({
    name: "My Shoebox",
    timezone: "UTC",
  });
  expect(await snapshot(database)).toEqual(before);
  expect(preview.json().timezoneImpact).toEqual({
    fromZone: "UTC",
    toZone: "America/New_York",
    movingItemCount: 2,
    burstEjectionItemCount: 2,
    milestoneMismatches: [
      {
        milestone: {
          milestoneId,
          name: "Sunday",
          startsOn: "2026-03-08",
          endsOn: "2026-03-08",
          blurb: null,
        },
        itemCount: 2,
      },
    ],
  });
}

type ExpectTimezoneHistoryAndBurstRepairOptions = {
  after: TimezoneSnapshot;
  before: TimezoneSnapshot;
  survivingBurst: string;
  emptyBurst: string;
};

/** Checks timezone history and burst repair. */
export function expectTimezoneHistoryAndBurstRepair(
  options: Readonly<ExpectTimezoneHistoryAndBurstRepairOptions>,
): void {
  const { after, before, survivingBurst, emptyBurst } = options;
  expect(
    after.history.map((row) => {
      return row.reason;
    }),
  ).toEqual(["timezone_change", "timezone_change"]);
  expect(after.files).toEqual(before.files);
  expect(
    after.items.find((row) => {
      return row.id === "019f1234-0000-7000-8000-000000000005";
    }),
  ).toEqual(
    before.items.find((row) => {
      return row.id === "019f1234-0000-7000-8000-000000000005";
    }),
  );
  expect(
    after.bursts.map((row) => {
      return row.id;
    }),
  ).toEqual([survivingBurst]);
  expect(
    after.bursts.some((row) => {
      return row.id === emptyBurst;
    }),
  ).toBe(false);
  expect(
    after.joins
      .filter((row) => {
        return row.item_id !== "019f1234-0000-7000-8000-000000000004";
      })
      .every((row) => {
        return row.span_mismatch_acknowledged_at === null;
      }),
  ).toBe(true);
  expect(
    after.joins.find((row) => {
      return row.item_id === "019f1234-0000-7000-8000-000000000004";
    })!.span_mismatch_acknowledged_at,
  ).toBe(NOW);
}

/** Checks large timezone preview. */
export async function expectLargeTimezonePreview(
  options: Readonly<{
    preview: LightMyRequestResponse;
    database: DatabaseExecutor;
  }>,
): Promise<void> {
  const { preview, database } = options;
  expect(preview.statusCode).toBe(200);
  expect(preview.json().timezoneImpact.movingItemCount).toBe(50_002);
  expect(await database.selectFrom("settings").selectAll().execute()).toEqual(
    [],
  );
  expect(
    await database
      .selectFrom("item_capture_date_changes")
      .selectAll()
      .execute(),
  ).toEqual([]);
}

type TimezonePreviewFixtureResult = {
  before: TimezoneSnapshot;
  after: TimezoneSnapshot;
  app: FastifyInstance;
  database: DatabaseExecutor;
  survivingBurst: string;
  emptyBurst: string;
  close: () => Promise<void>;
};

/** Returns a verified timezone change with snapshots and app controls. */
export async function prepareTimezonePreviewFixture(): Promise<TimezonePreviewFixtureResult> {
  const { app, database, close, emptyBurst, survivingBurst, milestoneId } =
    await createTimezoneChangeFixture();
  const before = await snapshot(database);
  const payload = {
    shoebox: { name: "Future title", timezone: "America/New_York" },
  };
  const preview = await app.inject({
    method: "PATCH",
    url: "/api/settings?preview=true",
    payload,
  });
  await expectTimezonePreviewWithoutWrites({
    preview,
    database,
    before,
    milestoneId,
  });
  const save = await app.inject({
    method: "PATCH",
    url: "/api/settings",
    payload,
  });
  expect(save.statusCode).toBe(200);
  expect(save.json().timezoneImpact).toEqual(preview.json().timezoneImpact);
  const after = await snapshot(database);
  return { before, after, app, database, survivingBurst, emptyBurst, close };
}

/** Returns a verified 50,002-item timezone change with database cleanup. */
export async function prepareLargeTimezoneFixture(): Promise<{
  database: DatabaseExecutor;
  close: () => Promise<void>;
}> {
  const { app, database, close } = await createTimezoneChangeFixture();
  const original = await database
    .selectFrom("items")
    .selectAll()
    .where("id", "=", "019f1234-0000-7000-8000-000000000002")
    .executeTakeFirstOrThrow();
  for (let batchStart = 0; batchStart < 50_000; batchStart += 100) {
    await database
      .insertInto("items")
      .values(
        Array.from({ length: 100 }, (_, batchOffset) => {
          const sequence = batchStart + batchOffset;
          return {
            ...original,
            id: `019f4321-0000-7000-8000-${sequence.toString(16).padStart(12, "0")}`,
            seq: sequence + 20,
            burst_id: null,
            burst_index: null,
          };
        }),
      )
      .execute();
  }
  const preview = await app.inject({
    method: "PATCH",
    url: "/api/settings?preview=true",
    payload: { shoebox: { timezone: "America/New_York" } },
  });
  await expectLargeTimezonePreview({ preview, database });
  const response = await app.inject({
    method: "PATCH",
    url: "/api/settings",
    payload: { shoebox: { timezone: "America/New_York" } },
  });
  expect(response.statusCode).toBe(200);
  expect(response.json().timezoneImpact.movingItemCount).toBe(50_002);
  return { database, close };
}
