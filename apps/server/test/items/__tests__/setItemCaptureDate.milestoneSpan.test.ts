import { describe, expect, it } from "vitest";
import { createDatabase } from "../../../src/db/client.ts";
import { migrateToLatest } from "../../../src/db/migrate.ts";
import { getVisibleItemOr404 } from "../../../src/items/getVisibleItemOr404.ts";
import { setItemCaptureDate } from "../../../src/items/setItemCaptureDate.ts";
import { makeViewer } from "../../helpers/makeViewer.ts";
import {
  NOW,
  insertItem,
  insertItemMilestone,
  insertMember,
  insertMilestone,
} from "../../helpers/seedHelpers/seedHelpers.ts";
import { CAPTURED } from "./setItemCaptureDateTestHelpers.ts";

describe("a corrected item and the occasions it is attached to", () => {
  it("re-arms the reconciliation only for spans that no longer contain it", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const memberId = await insertMember(database);
    const itemId = await insertItem(database, {
      uploadedBy: memberId,
      ...CAPTURED,
    });
    const leftBehindId = await insertMilestone(database, {
      name: "The christening",
      startsOn: "2026-09-13",
      endsOn: "2026-09-15",
    });
    const stillHoldingId = await insertMilestone(database, {
      name: "September in Madrid",
      startsOn: "2026-09-01",
      endsOn: "2026-09-30",
    });
    await insertItemMilestone(database, {
      itemId,
      milestoneId: leftBehindId,
      span_mismatch_acknowledged_at: NOW,
    });
    await insertItemMilestone(database, {
      itemId,
      milestoneId: stillHoldingId,
      span_mismatch_acknowledged_at: NOW,
    });

    await setItemCaptureDate({
      transaction: database,
      viewer: makeViewer({ memberId }),
      item: await getVisibleItemOr404({
        database,
        viewer: makeViewer({ memberId }),
        itemId,
      }),
      capturedOn: "2026-09-20",
      capturedTime: undefined,
      timezone: "Europe/Madrid",
      now: NOW,
    });

    const rows = await database
      .selectFrom("item_milestones")
      .select([
        "item_milestones.milestone_id as milestoneId",
        "item_milestones.span_mismatch_acknowledged_at as acknowledgedAt",
      ])
      .execute();
    const acknowledgedBy = new Map(
      rows.map((row) => {
        return [row.milestoneId, row.acknowledgedAt];
      }),
    );

    // The existing reconciliation is offered again, rather than a new one
    // being invented.
    expect(acknowledgedBy.get(leftBehindId)).toBeNull();
    // The span still holds it, so a considered decision stands.
    expect(acknowledgedBy.get(stillHoldingId)).toBe(NOW);
    // Nothing is attached or detached here.
    expect(rows).toHaveLength(2);
    await database.destroy();
  });
});
