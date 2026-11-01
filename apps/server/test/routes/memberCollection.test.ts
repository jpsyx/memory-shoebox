import {
  burstFramesResponseSchema,
  filterFacetsResponseSchema,
  timelineRailResponseSchema,
} from "@memory-shoebox/shared";
import { expect, it } from "vitest";
import { CompiledQuery } from "kysely";
import { createId } from "../../src/db/createId.ts";
import {
  makeSelectionExpressionFromFilter,
  makeTimelineFilterFromQuery,
} from "../../src/archive/selectionFilterHelpers.ts";
import { makeMemberCollectionFixture } from "../helpers/memberCollectionFixture.ts";
import { makeViewer } from "../helpers/makeViewer.ts";
import {
  getItemIdsFromTimeline,
  getSelectionFromMemberId,
  readMemberTimeline,
  readSeenIds,
  readSelectedIds,
} from "./memberCollectionTestHelpers.ts";

// Removing member selection or bypassing visibility must fail these real reads.
it("counts visible uploads and linked photo tags once, with matching burst cover and video", async () => {
  const fixture = await makeMemberCollectionFixture();
  const body = await readMemberTimeline(fixture);
  const burst = body.days[0]!.items.find((item) => {
    return item.burst !== null;
  })!;
  expect(body.resultCount).toBe(4);
  expect(
    body.days.map((day) => {
      return day.itemCount;
    }),
  ).toEqual([3, 1]);
  expect(burst.burst!.visibleFrameCount).toBe(2);
  expect(burst.burst!.coverItemId).toBe(fixture.itemIds[0]);
  expect(getItemIdsFromTimeline(body)).toEqual([
    fixture.itemIds[1],
    fixture.itemIds[0],
    fixture.itemIds[3],
  ]);
  const page = await readMemberTimeline(
    fixture,
    `member=${fixture.memberId}&limit=1`,
  );
  expect(page.nextCursor).not.toBeNull();
  const wrongMemberCursor = await fixture.get(
    `timeline?member=${fixture.otherMemberId}&cursor=${page.nextCursor}`,
  );
  expect(wrongMemberCursor.statusCode).toBe(400);
});

it("pins the same media/date counts on the rail", async () => {
  const fixture = await makeMemberCollectionFixture();
  const response = await fixture.get(
    `timeline/rail?member=${fixture.memberId}`,
  );
  expect(response.statusCode).toBe(200);
  const rail = timelineRailResponseSchema.parse(response.json());
  expect(
    rail.days.map((day) => {
      return [day.capturedOn, day.itemCount, day.photoCount, day.videoCount];
    }),
  ).toEqual([
    ["2026-09-27", 3, 3, 0],
    ["2026-09-26", 1, 0, 1],
  ]);
});

it("narrows facets by the member union without matching an ad-hoc namesake", async () => {
  const fixture = await makeMemberCollectionFixture();
  const response = await fixture.get(
    `filters/facets?member=${fixture.memberId}`,
  );
  expect(response.statusCode).toBe(200);
  const facets = filterFacetsResponseSchema.parse(response.json());
  expect(facets.resultCount).toBe(4);
  expect(
    facets.tags.find((facet) => {
      return facet.tag.tagId === fixture.tagId;
    })?.narrowedCount,
  ).toBe(4);
  expect(
    facets.people.find((facet) => {
      return facet.person.personId === fixture.personId;
    })?.narrowedCount,
  ).toBe(2);
  expect(
    facets.people.find((facet) => {
      return facet.person.personId === fixture.sameNameId;
    })?.narrowedCount,
  ).toBe(0);
});

it("preserves pure person filters and intersects member with extra filters", async () => {
  const fixture = await makeMemberCollectionFixture();
  const personOnly = await readMemberTimeline(
    fixture,
    `people=${fixture.personId}`,
  );
  expect(personOnly.resultCount).toBe(2);
  expect(getItemIdsFromTimeline(personOnly).sort()).toEqual(
    [fixture.itemIds[1], fixture.itemIds[2]].sort(),
  );
  const intersected = await readMemberTimeline(
    fixture,
    `member=${fixture.memberId}&people=${fixture.personId}&tags=${fixture.tagId}&from=2026-09-27&until=2026-09-27`,
  );
  expect(intersected.resultCount).toBe(2);
  expect(getItemIdsFromTimeline(intersected).sort()).toEqual(
    [fixture.itemIds[1], fixture.itemIds[2]].sort(),
  );
  const emptyDate = await readMemberTimeline(
    fixture,
    `member=${fixture.memberId}&from=2026-09-28`,
  );
  expect(emptyDate.resultCount).toBe(0);
  expect(emptyDate.days).toEqual([]);
});

it("retains member selection in the archive attachment picker", async () => {
  const fixture = await makeMemberCollectionFixture();
  const picker = await readMemberTimeline(
    fixture,
    `member=${fixture.memberId}&attachedToMilestoneId=${fixture.milestoneId}&excludeAttached=true`,
  );
  expect(picker.resultCount).toBe(3);
  expect(getItemIdsFromTimeline(picker).sort()).toEqual(
    fixture.expectedIds.slice(1).sort(),
  );
  const attached = await readMemberTimeline(
    fixture,
    `member=${fixture.memberId}&attachedToMilestoneId=${fixture.milestoneId}`,
  );
  expect(attached.resultCount).toBe(1);
  expect(getItemIdsFromTimeline(attached)).toEqual([fixture.itemIds[0]]);
});

it("filters burst frames and seen writes before expanding stacks", async () => {
  const fixture = await makeMemberCollectionFixture();
  const response = await fixture.get(
    `bursts/${fixture.burstId}/frames?member=${fixture.memberId}`,
  );
  expect(response.statusCode).toBe(200);
  const frames = burstFramesResponseSchema.parse(response.json()).frames;
  expect(
    frames.map((frame) => {
      return [frame.itemId, frame.position];
    }),
  ).toEqual([
    [fixture.itemIds[0], 1],
    [fixture.itemIds[2], 2],
  ]);
  expect(await readSeenIds(fixture)).toEqual(
    [fixture.itemIds[0], fixture.itemIds[2]].sort(),
  );
  const seenResponse = await fixture.post("items/seen", {
    itemIds: [...fixture.expectedIds, ...fixture.hiddenItemIds],
    burstIds: [],
  });
  expect(seenResponse.statusCode).toBe(204);
  expect(await readSeenIds(fixture)).toEqual([...fixture.expectedIds].sort());
});

it("ranks every matching frame and denies hidden/out-of-selection positions", async () => {
  const fixture = await makeMemberCollectionFixture();
  const selection = getSelectionFromMemberId(fixture.memberId);
  const positions = await Promise.all(
    fixture.expectedIds.map((itemId) => {
      return fixture.post("media/position", { itemId, selection });
    }),
  );
  expect(
    positions.map((response) => {
      return response.statusCode;
    }),
  ).toEqual([200, 200, 200, 200]);
  expect(
    positions.map((response) => {
      return response.json();
    }),
  ).toEqual([
    { position: 2, total: 4 },
    { position: 1, total: 4 },
    { position: 3, total: 4 },
    { position: 4, total: 4 },
  ]);
  const denied = await Promise.all(
    [...fixture.hiddenItemIds, fixture.itemIds[4]!].map((itemId) => {
      return fixture.post("media/position", { itemId, selection });
    }),
  );
  expect(
    denied.map((response) => {
      return response.json();
    }),
  ).toEqual([null, null, null]);
});

it("follows collection neighbors and keeps preview authorization independent", async () => {
  const fixture = await makeMemberCollectionFixture();
  const neighbors = await fixture.post("media/neighbors", {
    itemId: fixture.itemIds[1],
    selection: getSelectionFromMemberId(fixture.memberId),
    direction: "next",
  });
  expect(neighbors.statusCode).toBe(200);
  expect(
    neighbors.json().ahead.map((item: { itemId: string }) => {
      return item.itemId;
    }),
  ).toEqual([fixture.itemIds[0], fixture.itemIds[2]]);
  expect(neighbors.json().behind).toEqual([]);
  const previews = await fixture.post("media/preview", {
    itemIds: [...fixture.expectedIds, ...fixture.hiddenItemIds],
    purpose: "speculative-preview",
  });
  expect(previews.statusCode).toBe(200);
  expect(
    previews.json().items.map((item: { itemId: string }) => {
      return item.itemId;
    }),
  ).toEqual(fixture.expectedIds);
});

it("bulk edits actual selected IDs and rejects hidden additions atomically", async () => {
  const fixture = await makeMemberCollectionFixture();
  const itemIds = await readSelectedIds(fixture);
  expect(itemIds).toEqual(fixture.expectedIds);
  const response = await fixture.post("items/bulk-edit", {
    action: "tags",
    itemIds,
    tags: ["Selected"],
  });
  expect(response.statusCode).toBe(204);
  const rows = await fixture.database
    .selectFrom("item_tags")
    .innerJoin("tags", "tags.id", "item_tags.tag_id")
    .select("item_id")
    .where("tags.name", "=", "Selected")
    .execute();
  expect(
    rows
      .map((row) => {
        return row.item_id;
      })
      .sort(),
  ).toEqual([...fixture.expectedIds].sort());
  const denied = await fixture.post("items/bulk-edit", {
    action: "tags",
    itemIds: [...itemIds, fixture.hiddenItemIds[0]],
    tags: ["Forbidden"],
  });
  expect(denied.statusCode).toBe(404);
  expect(
    await fixture.database
      .selectFrom("tags")
      .select("id")
      .where("name", "=", "Forbidden")
      .execute(),
  ).toEqual([]);
});

it("returns zero for unknown members without hidden IDs or counts", async () => {
  const fixture = await makeMemberCollectionFixture();
  const unknown = createId();
  const body = await readMemberTimeline(fixture, `member=${unknown}`);
  expect(body.days).toEqual([]);
  expect(body.resultCount).toBe(0);
  expect(
    timelineRailResponseSchema.parse(
      (await fixture.get(`timeline/rail?member=${unknown}`)).json(),
    ).days,
  ).toEqual([]);
  expect(
    filterFacetsResponseSchema.parse(
      (await fixture.get(`filters/facets?member=${unknown}`)).json(),
    ).resultCount,
  ).toBe(0);
  expect(
    (
      await fixture.post("media/position", {
        itemId: fixture.itemIds[0],
        selection: getSelectionFromMemberId(unknown),
      })
    ).json(),
  ).toBeNull();
  expect(
    (await fixture.get(`bursts/${fixture.burstId}/frames?member=${unknown}`))
      .statusCode,
  ).toBe(404);
});

it("uses existing indexed correlated lookups for the member branch", async () => {
  const fixture = await makeMemberCollectionFixture();
  const viewer = makeViewer({ memberId: fixture.reader.memberId });
  const query = fixture.database
    .selectFrom("items")
    .select("items.id")
    .where(
      makeSelectionExpressionFromFilter({
        viewer,
        filter: makeTimelineFilterFromQuery({ member: fixture.memberId }),
      }),
    )
    .orderBy("items.captured_on", "desc")
    .compile();
  const plan = await fixture.database.executeQuery<{ detail: string }>(
    CompiledQuery.raw(`EXPLAIN QUERY PLAN ${query.sql}`, [...query.parameters]),
  );
  const details = plan.rows
    .map((row) => {
      return row.detail;
    })
    .join("\n");
  expect(details).toContain("items_uploaded_by_captured_on");
  expect(details).toContain("CORRELATED");
  expect(details).toMatch(/SEARCH (?:item_people|people) USING/);
  expect(details).not.toMatch(/SCAN (?:item_people|people)/);
});
