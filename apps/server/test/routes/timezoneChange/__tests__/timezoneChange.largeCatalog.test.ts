import { describe, expect, it } from "vitest";
import { prepareLargeTimezoneFixture } from "./timezoneChangeTestHelpers.ts";

describe("timezone change", () => {
  it("saves a large timezone shift without exceeding SQLite parameter limits", async () => {
    const { database, close } = await prepareLargeTimezoneFixture();
    const history = await database
      .selectFrom("item_capture_date_changes")
      .select(({ fn }) => {
        return fn.countAll<number>().as("captureHistoryCount");
      })
      .executeTakeFirstOrThrow();
    expect(history.captureHistoryCount).toBe(50_002);
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
