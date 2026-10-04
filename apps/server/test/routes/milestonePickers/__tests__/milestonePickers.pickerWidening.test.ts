import { describe, expect, it } from "vitest";
import { listMilestoneMismatchesResponseSchema } from "@memory-shoebox/shared";
import { createTestApp, type TestApp } from "../../../helpers/createTestApp.ts";
import { insertSignedInMember } from "../../../helpers/insertSignedInMember.ts";
import {
  insertItem,
  insertItemMilestone,
  insertMilestone,
  insertRendition,
  insertMember,
  insertVisibilityRule,
  NOW,
} from "../../../helpers/seedHelpers/seedHelpers.ts";

async function _seedPickerWidening(
  database: TestApp["database"],
): Promise<{ cookie: string; url: string }> {
  const { cookie } = await insertSignedInMember({ database });
  const uploader = await insertMember(database);
  const hiddenRule = await insertVisibilityRule(database, { mode: "only" });
  const milestoneId = await insertMilestone(database, {
    name: "Trip",
    startsOn: "2026-09-10",
    endsOn: "2026-09-12",
  });
  await ["2026-09-01", "2026-09-20", "2026-09-25", "2026-08-01"].reduce(
    async (previousItemInsertion, day, index) => {
      await previousItemInsertion;
      const itemId = await insertItem(database, {
        uploadedBy: uploader,
        seq: index,
        captured_on: day,
        ...(index === 3 ? { visibility_rule_id: hiddenRule } : {}),
      });
      await insertRendition(database, { itemId });
      await insertItemMilestone(database, {
        milestoneId,
        itemId,
        span_mismatch_acknowledged_at: index === 2 ? NOW : null,
      });
    },
    Promise.resolve(),
  );
  const url = `/api/milestones/${milestoneId}/mismatches?limit=1`;
  return { cookie, url };
}

async function _assertPickerWidening(): Promise<void> {
  const { app, database, close } = await createTestApp();
  try {
    const { cookie, url } = await _seedPickerWidening(database);
    const response = await app.inject({ url, headers: { cookie } });
    expect(response.statusCode).toBe(200);
    const page = listMilestoneMismatchesResponseSchema.parse(response.json());
    expect(page.mismatches).toHaveLength(1);
    expect(page.mismatches[0]).toMatchObject({
      item: { capturedOn: "2026-09-20" },
      attachedAt: NOW,
    });
    expect(page.wideningSpan).toEqual({
      startsOn: "2026-09-01",
      endsOn: "2026-09-20",
    });
    const finalPage = listMilestoneMismatchesResponseSchema.parse(
      (
        await app.inject({
          url: `${url}&cursor=${page.nextCursor}`,
          headers: { cookie },
        })
      ).json(),
    );
    expect(finalPage.mismatches[0]?.item.capturedOn).toBe("2026-09-01");
    expect(finalPage.wideningSpan).toEqual(page.wideningSpan);
    expect(finalPage.nextCursor).toBeNull();
  } finally {
    await close();
  }
}
describe("milestone picker routes", (): void => {
  it(
    "widens over all visible unacknowledged mismatches even on a one-item page",
    _assertPickerWidening,
  );
});
