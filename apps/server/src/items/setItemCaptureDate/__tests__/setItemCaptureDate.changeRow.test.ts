import { describe, expect, it } from "vitest";
import { createDatabase } from "../../../db/client.ts";
import { migrateToLatest } from "../../../db/migrate.ts";
import { getVisibleItemOr404 } from "../../getVisibleItemOr404.ts";
import { setItemCaptureDate } from "../setItemCaptureDate.ts";
import { makeViewer } from "../../../../test/helpers/makeViewer.ts";
import {
  NOW,
  insertItem,
  insertMember,
} from "../../../../test/helpers/seedHelpers/seedHelpers.ts";
import { CAPTURED } from "./setItemCaptureDateTestHelpers.ts";

describe("the change row a capture-date correction leaves", () => {
  it("writes one change row per moved item, with both sides of the move", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const memberId = await insertMember(database);
    const itemId = await insertItem(database, {
      uploadedBy: memberId,
      ...CAPTURED,
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

    const changes = await database
      .selectFrom("item_capture_date_changes")
      .selectAll()
      .execute();

    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      item_id: itemId,
      // Null: this path is the hand correction, not a reconciliation.
      milestone_id: null,
      previous_captured_at: "2026-09-14T04:41:32.000Z",
      previous_capture_date: "2026-09-14",
      previous_capture_source: "exif",
      new_captured_at: "2026-09-20T04:41:32.000Z",
      new_capture_date: "2026-09-20",
      changed_by: memberId,
      changed_at: NOW,
      // Ruling 2 again, from the other side: why, never how.
      reason: "manual",
    });
    await database.destroy();
  });
});
