import { getVisibleItemOr404 } from "../../src/items/getVisibleItemOr404.ts";
import { makeViewer } from "../helpers/makeViewer.ts";
import { expect, it } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import {
  insertMember,
  NOW,
  insertItem,
} from "../helpers/seedHelpers/seedHelpers.ts";
import { enqueueCommentEmails } from "../../src/items/enqueueCommentEmails.ts";

it("records a default daily comment without queuing an individual email", async () => {
  const database = createDatabase(":memory:");
  try {
    await migrateToLatest(database);
    const uploader = await insertMember(database);
    const author = await insertMember(database);
    const itemId = await insertItem(database, { uploadedBy: uploader });
    await enqueueCommentEmails({
      transaction: database,
      viewer: makeViewer({ memberId: author }),
      item: await getVisibleItemOr404({
        database,
        viewer: makeViewer({ memberId: author }),
        itemId,
      }),
      commentId: "comment",
      body: "Hello",
      atSeconds: null,
      now: NOW,
    });
    expect(
      await database
        .selectFrom("notification_digest_events")
        .select("category")
        .execute(),
    ).toEqual([{ category: "comment" }]);
    expect(
      await database.selectFrom("outbound_emails").select("id").execute(),
    ).toEqual([]);
  } finally {
    await database.destroy();
  }
});
