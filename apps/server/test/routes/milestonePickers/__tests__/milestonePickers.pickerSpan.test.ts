import { describe, expect, it } from "vitest";
import { listMilestoneCandidatesResponseSchema } from "@memory-shoebox/shared";
import { createTestApp, type TestApp } from "../../../helpers/createTestApp.ts";
import { insertSignedInMember } from "../../../helpers/insertSignedInMember.ts";
import {
  insertItem,
  insertItemMilestone,
  insertMilestone,
  insertRendition,
} from "../../../helpers/seedHelpers/seedHelpers.ts";

type SeedPickerSpanResult = {
  cookie: string;
  insideId: string;
  outsideId: string;
  url: string;
};

async function _seedPickerSpan(
  database: TestApp["database"],
): Promise<SeedPickerSpanResult> {
  const { cookie, memberId } = await insertSignedInMember({ database });
  const milestoneId = await insertMilestone(database, {
    name: "Trip",
    startsOn: "2026-09-10",
    endsOn: "2026-09-12",
  });
  const insideId = await insertItem(database, {
    uploadedBy: memberId,
    captured_on: "2026-09-11",
  });
  const outsideId = await insertItem(database, {
    uploadedBy: memberId,
    seq: 1,
    captured_on: "2026-09-13",
  });
  await insertRendition(database, { itemId: insideId });
  await insertRendition(database, { itemId: outsideId });
  await insertItemMilestone(database, { milestoneId, itemId: insideId });
  const url = `/api/milestones/${milestoneId}/candidates`;
  return { cookie, insideId, outsideId, url };
}

async function _assertPickerSpan(): Promise<void> {
  const { app, database, close } = await createTestApp();
  try {
    const { cookie, insideId, outsideId, url } =
      await _seedPickerSpan(database);
    const response = await app.inject({ url, headers: { cookie } });
    expect(response.statusCode).toBe(200);
    expect(
      listMilestoneCandidatesResponseSchema.parse(response.json()).candidates,
    ).toMatchObject([
      { item: { itemId: insideId }, isAttached: true, isOutsideSpan: false },
    ]);
    const all = await app.inject({
      url: `${url}?scope=all&from=2026-09-13&to=2026-09-13`,
      headers: { cookie },
    });
    expect(
      listMilestoneCandidatesResponseSchema.parse(all.json()).candidates,
    ).toMatchObject([
      { item: { itemId: outsideId }, isAttached: false, isOutsideSpan: true },
    ]);
    expect(
      (
        await app.inject({
          url: `${url}?from=2026-09-01`,
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(400);
  } finally {
    await close();
  }
}
describe("milestone picker routes", (): void => {
  it(
    "defaults to the span, marks attachments and allows advisory outsiders with all bounds",
    _assertPickerSpan,
  );
});
