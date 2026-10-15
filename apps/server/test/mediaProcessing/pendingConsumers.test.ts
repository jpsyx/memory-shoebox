import { expect, it } from "vitest";
import { createLifecycleFixture } from "./lifecycleTestHelpers.ts";
import { discoverMediaProcessingWork } from "../../src/mediaProcessing/queue/discoverMediaProcessingWork.ts";
import { readMediaPreviews } from "../../src/media/readMediaPreviews.ts";
import { readItemSummariesByDay } from "../../src/archive/readItemSummariesByDay.ts";
import { readItemSummariesByItemIds } from "../../src/archive/readItemSummariesByItemIds/readItemSummariesByItemIds.ts";
import { readItemSummariesByIds } from "../../src/items/readItemSummariesByIds/readItemSummariesByIds.ts";
import { readItemDetail } from "../../src/items/readItemDetail/readItemDetail.ts";
import { getVisibleItemOr404 } from "../../src/items/getVisibleItemOr404.ts";
import { readBurstFrameSources } from "../../src/items/readBurstFrameRefs/readBurstFrameSources.ts";
import { makeBurstFrameRefsFromRows } from "../../src/items/readBurstFrameRefs/makeBurstFrameRefsFromRows.ts";
import { readUploadFilePage } from "../../src/upload/readUploadFilePage/readUploadFilePage.ts";
import { readPeopleDirectory } from "../../src/archive/readPeopleDirectory.ts";
import { makeTimelineFilterFromQuery } from "../../src/archive/selectionFilterHelpers.ts";
import { makeViewer } from "../helpers/makeViewer.ts";
import {
  insertUploadFile,
  insertUploadSession,
  insertItemPerson,
  insertPerson,
} from "../helpers/seedHelpers/seedHelpers.ts";
import { readMediaSources } from "../../src/archive/readMediaSources.ts";
import { makeQueryCountingDatabaseFromDatabase } from "../helpers/makeQueryCountingDatabaseFromDatabase.ts";

it("preserves pending through all seven media DTO consumers and the source-only people directory", async () => {
  const fixture = await createLifecycleFixture();
  const { database, itemId } = fixture;
  const row = await database
    .selectFrom("items")
    .selectAll()
    .where("id", "=", itemId)
    .executeTakeFirstOrThrow();
  await database
    .updateTable("item_renditions")
    .set({ content_type: "image/heic" })
    .execute();
  await discoverMediaProcessingWork({
    database,
    now: fixture.clock().toISOString(),
    limit: 100,
  });
  const options = {
    database,
    b2: fixture.b2,
    now: fixture.clock(),
    viewer: makeViewer({ memberId: row.uploaded_by }),
    itemIds: [itemId],
  };
  expect(
    (
      await readMediaPreviews({
        ...options,
        request: { itemIds: [itemId], purpose: "speculative-preview" },
      })
    )[0]!.media.previewState,
  ).toBe("pending");
  expect(
    (await readItemSummariesByItemIds(options)).get(itemId)!.media.previewState,
  ).toBe("pending");
  expect((await readItemSummariesByIds(options))[0]!.media.previewState).toBe(
    "pending",
  );
  const days = await readItemSummariesByDay({
    pageOptions: {
      ...options,
      filter: makeTimelineFilterFromQuery({}),
      limit: 20,
      cursor: undefined,
    },
    days: [row.captured_on],
  });
  expect(days.get(row.captured_on)![0]!.media.previewState).toBe("pending");
  expect(
    (
      await readItemDetail({
        ...options,
        item: await getVisibleItemOr404({ ...options, itemId }),
      })
    ).media.previewState,
  ).toBe("pending");
  const sources = await readBurstFrameSources(options);
  expect(
    makeBurstFrameRefsFromRows({
      sources,
      rows: [
        {
          itemId,
          width: row.width,
          height: row.height,
          capturedAt: row.captured_at,
          burstIndex: 1,
          altTextOverride: null,
          isUnseen: true,
        },
      ],
    })[0]!.previewState,
  ).toBe("pending");
  const sessionId = await insertUploadSession(database, {
    uploadedBy: row.uploaded_by,
  });
  await insertUploadFile(database, {
    uploadSessionId: sessionId,
    state: "done",
    item_id: itemId,
    captured_at: row.captured_at,
    capture_date: row.captured_on,
    capture_source: "uploader_set",
    original_captured_at: row.captured_at,
  });
  const files = await readUploadFilePage({
    ...options,
    sessionId,
    page: { limit: 10, cursor: undefined, states: undefined },
  });
  expect(files.files[0]!.media!.previewState).toBe("pending");
  const personId = await insertPerson(database, {
    displayName: "Family",
    preferred_face_item_id: itemId,
  });
  await insertItemPerson(database, { itemId, personId });
  const people = await readPeopleDirectory({ ...options, search: undefined });
  expect(JSON.stringify(people)).toContain("Family");
  expect(fixture.b2.calls).not.toContain("presignGet");
});

it("adds one batched status query independent of drawn item count", async () => {
  const fixture = await createLifecycleFixture();
  const counting = makeQueryCountingDatabaseFromDatabase(fixture.database);
  counting.reset();
  await readMediaSources({
    database: counting.database,
    b2: fixture.b2,
    now: fixture.clock(),
    ttlSeconds: 3600,
    purposesByItemId: new Map([[fixture.itemId, "thumbnail"]]),
  });
  expect(counting.getQueryCount()).toBe(2);
  counting.reset();
  await readMediaSources({
    database: counting.database,
    b2: fixture.b2,
    now: fixture.clock(),
    ttlSeconds: 3600,
    purposesByItemId: new Map(
      Array.from({ length: 100 }, (_, index) => {
        return [String(index), "thumbnail"];
      }),
    ),
  });
  expect(counting.getQueryCount()).toBe(2);
});
