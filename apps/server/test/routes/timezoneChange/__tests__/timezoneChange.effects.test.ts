import type { FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";
import type { DatabaseExecutor } from "../../../../src/db/types/db.types.ts";
import { insertItem } from "../../../helpers/seedHelpers/seedHelpers.ts";
import {
  ADMIN,
  createTimezoneChangeFixture,
  expectTimezoneHistoryAndBurstRepair,
  prepareTimezonePreviewFixture,
  snapshot,
} from "./timezoneChangeTestHelpers.ts";

type TimezoneItemRevertOptions = {
  before: Awaited<ReturnType<typeof snapshot>>;
  after: Awaited<ReturnType<typeof snapshot>>;
  app: FastifyInstance;
  database: DatabaseExecutor;
  itemId: string;
};

async function _expectTimezoneItemRevert(
  options: Readonly<TimezoneItemRevertOptions>,
): Promise<void> {
  const { before, after, app, database, itemId } = options;
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

describe("timezone change", () => {
  it("previews without writes, then preserves evidence, records both days and raises existing burst/milestone consequences", async () => {
    const { before, after, app, database, survivingBurst, emptyBurst, close } =
      await prepareTimezonePreviewFixture();
    for (const itemId of [
      "019f1234-0000-7000-8000-000000000002",
      "019f1234-0000-7000-8000-000000000003",
    ]) {
      await _expectTimezoneItemRevert({ before, after, app, database, itemId });
    }
    expectTimezoneHistoryAndBurstRepair({
      after,
      before,
      survivingBurst,
      emptyBurst,
    });
    await close();
  });

  it("recomputes against the catalog at save time and treats a same-zone save as a no-op", async () => {
    const { app, database, close } = await createTimezoneChangeFixture();
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
    const beforeNoop = await snapshot(database);
    expect(
      (
        await app.inject({ method: "PATCH", url: "/api/settings", payload })
      ).json().timezoneImpact,
    ).toBeNull();
    expect(await snapshot(database)).toEqual(beforeNoop);
    await close();
  });
});
