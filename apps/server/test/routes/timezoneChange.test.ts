import { describe, expect, it } from "vitest";
import { createTestApp } from "../helpers/createTestApp.ts";
import {
  insertMember,
  insertItem,
  insertRendition,
  insertUploadSession,
  insertUploadFile,
  insertBurst,
  insertMilestone,
  insertItemMilestone,
  NOW,
} from "../helpers/seedHelpers/seedHelpers.ts";
const ADMIN = {
  memberId: "019f1234-0000-7000-8000-000000000001",
  sessionId: "session",
  role: "admin",
  isAdmin: true,
  visibleRuleIds: [],
} as const;

async function _makeFixture() {
  const context = await createTestApp({
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
  const definitions = [
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
  return { ...context, emptyBurst, survivingBurst, milestoneId };
}
async function _snapshot(
  database: Awaited<ReturnType<typeof _makeFixture>>["database"],
) {
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

describe("timezone change", () => {
  it("previews without writes, then preserves evidence, records both days and raises existing burst/milestone consequences", async () => {
    const { app, database, close, emptyBurst, survivingBurst, milestoneId } =
      await _makeFixture();
    const before = await _snapshot(database);
    const payload = {
      shoebox: { name: "Future title", timezone: "America/New_York" },
    };
    const preview = await app.inject({
      method: "PATCH",
      url: "/api/settings?preview=true",
      payload,
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json().isPreview).toBe(true);
    expect(preview.json().shoebox).toEqual({
      name: "My Shoebox",
      timezone: "UTC",
    });
    expect(await _snapshot(database)).toEqual(before);
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
    const save = await app.inject({
      method: "PATCH",
      url: "/api/settings",
      payload,
    });
    expect(save.statusCode).toBe(200);
    expect(save.json().timezoneImpact).toEqual(preview.json().timezoneImpact);
    const after = await _snapshot(database);
    for (const itemId of [
      "019f1234-0000-7000-8000-000000000002",
      "019f1234-0000-7000-8000-000000000003",
    ]) {
      const original = before.items.find((row) => {
        return row.id === itemId;
      })!;
      const moved = after.items.find((row) => {
        return row.id === itemId;
      })!;
      expect(moved).toEqual({
        ...original,
        captured_on: "2026-03-07",
        burst_id: null,
        burst_index: null,
      });
      const history = after.history.find((row) => {
        return row.item_id === itemId;
      })!;
      expect(history).toMatchObject({
        previous_captured_at: original.captured_at,
        new_captured_at: original.captured_at,
        previous_capture_source: original.capture_source,
        previous_capture_date: "2026-03-08",
        new_capture_date: "2026-03-07",
        reason: "timezone_change",
        changed_by: ADMIN.memberId,
        milestone_id: null,
      });
      const reverted = await app.inject({
        method: "POST",
        url: `/api/items/${itemId}/capture-date`,
        payload: { capturedOn: history.previous_capture_date },
      });
      expect(reverted.statusCode).toBe(200);
      expect(
        (
          await database
            .selectFrom("items")
            .select("captured_on")
            .where("id", "=", itemId)
            .executeTakeFirstOrThrow()
        ).captured_on,
      ).toBe("2026-03-08");
    }
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
    await close();
  });
  it("recomputes against the catalog at save time and treats a same-zone save as a no-op", async () => {
    const { app, database, close } = await _makeFixture();
    const payload = { shoebox: { timezone: "America/New_York" } };
    const preview = await app.inject({
      method: "PATCH",
      url: "/api/settings?preview=true",
      payload,
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json().timezoneImpact.movingItemCount).toBe(2);
    await insertItem(database, {
      uploadedBy: ADMIN.memberId,
      seq: 9,
      captured_at: "2026-03-08T04:00:00.000Z",
      captured_on: "2026-03-08",
      captured_at_offset_minutes: null,
    });
    const save = await app.inject({
      method: "PATCH",
      url: "/api/settings?preview=false",
      payload,
    });
    expect(save.statusCode).toBe(200);
    expect(save.json().timezoneImpact.movingItemCount).toBe(3);
    const beforeNoop = await _snapshot(database);
    expect(
      (
        await app.inject({ method: "PATCH", url: "/api/settings", payload })
      ).json().timezoneImpact,
    ).toBeNull();
    expect(await _snapshot(database)).toEqual(beforeNoop);
    await close();
  });
  it("saves a large timezone shift without exceeding SQLite parameter limits", async () => {
    const { app, database, close } = await _makeFixture();
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
    const response = await app.inject({
      method: "PATCH",
      url: "/api/settings",
      payload: { shoebox: { timezone: "America/New_York" } },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().timezoneImpact.movingItemCount).toBe(50_002);
    const history = await database
      .selectFrom("item_capture_date_changes")
      .select(({ fn }) => {
        return fn.countAll<number>().as("count");
      })
      .executeTakeFirstOrThrow();
    expect(history.count).toBe(50_002);
    const unmoved = await database
      .selectFrom("items")
      .select("id")
      .where("captured_at_offset_minutes", "is", null)
      .where("captured_at", "<", "2026-03-08T05:00:00.000Z")
      .where("captured_on", "!=", "2026-03-07")
      .execute();
    expect(unmoved).toEqual([]);
    await close();
  });
});
