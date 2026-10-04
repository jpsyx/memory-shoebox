import { describe, expect, it } from "vitest";
import { listMilestoneCandidatesResponseSchema } from "@memory-shoebox/shared";
import { createTestApp, type TestApp } from "../../../helpers/createTestApp.ts";
import { insertSignedInMember } from "../../../helpers/insertSignedInMember.ts";
import {
  insertItem,
  insertMilestone,
  insertRendition,
} from "../../../helpers/seedHelpers/seedHelpers.ts";
import { createId } from "../../../../src/db/createId.ts";

async function _seedPickerPagination(database: TestApp["database"]): Promise<{
  cookie: string;
  candidateItemIds: string[];
  url: string;
}> {
  const { cookie, memberId } = await insertSignedInMember({ database });
  const milestoneId = await insertMilestone(database, {
    name: "Day",
    startsOn: "2026-09-27",
  });
  const candidateItemIds = [createId(), createId(), createId()]
    .sort()
    .reverse();
  await Promise.all(
    candidateItemIds.map(async (id, index) => {
      await insertItem(database, { id, uploadedBy: memberId, seq: index });
      if (index !== 0) {
        await insertRendition(database, { itemId: id });
      }
    }),
  );
  const url = `/api/milestones/${milestoneId}/candidates?limit=1`;
  return { cookie, candidateItemIds, url };
}

async function _assertPickerPagination(): Promise<void> {
  const { app, database, close } = await createTestApp();
  try {
    const { cookie, candidateItemIds, url } =
      await _seedPickerPagination(database);
    const first = await app.inject({ url, headers: { cookie } });
    expect(first.statusCode).toBe(200);
    const firstPage = listMilestoneCandidatesResponseSchema.parse(first.json());
    expect(firstPage.candidates).toEqual([]);
    expect(firstPage.nextCursor).not.toBeNull();
    const secondPage = listMilestoneCandidatesResponseSchema.parse(
      (
        await app.inject({
          url: `${url}&cursor=${firstPage.nextCursor}`,
          headers: { cookie },
        })
      ).json(),
    );
    expect(secondPage.candidates[0]?.item.itemId).toBe(candidateItemIds[1]);
    const thirdPage = listMilestoneCandidatesResponseSchema.parse(
      (
        await app.inject({
          url: `${url}&cursor=${secondPage.nextCursor}`,
          headers: { cookie },
        })
      ).json(),
    );
    expect(thirdPage.candidates[0]?.item.itemId).toBe(candidateItemIds[2]);
    expect(thirdPage.nextCursor).toBeNull();
  } finally {
    await close();
  }
}
describe("milestone picker routes", (): void => {
  it(
    "paginates tied days without repeating IDs and advances past missing media",
    _assertPickerPagination,
  );
});
