import type { InjectOptions } from "fastify";
import { describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "../../../helpers/createTestApp.ts";
import { insertSignedInMember } from "../../../helpers/insertSignedInMember.ts";
import {
  insertItem,
  insertMilestone,
  insertItemMilestone,
} from "../../../helpers/seedHelpers/seedHelpers.ts";

async function _seedReconciliationAcknowledgements(
  database: TestApp["database"],
): Promise<{
  first: string;
  original: string;
  request: InjectOptions;
}> {
  const { cookie, memberId } = await insertSignedInMember({ database });
  const milestoneId = await insertMilestone(database, {
    name: "occasion",
    startsOn: "2026-09-20",
  });
  const first = await insertItem(database, { uploadedBy: memberId });
  const second = await insertItem(database, {
    uploadedBy: memberId,
    seq: 1,
  });
  const original = "2026-09-01T00:00:00.000Z";
  await insertItemMilestone(database, {
    itemId: first,
    milestoneId,
    span_mismatch_acknowledged_at: original,
  });
  await insertItemMilestone(database, { itemId: second, milestoneId });
  const request = {
    method: "POST" as const,
    url: `/api/milestones/${milestoneId}/reconcile`,
    headers: { cookie },
    payload: { mode: "acknowledge", itemIds: [first, second] },
  };
  return { first, original, request };
}

async function _assertAcknowledgementPermissions(
  options: Readonly<{
    app: TestApp["app"];
    database: TestApp["database"];
    request: InjectOptions;
  }>,
): Promise<void> {
  const { app, database, request } = options;
  const viewer = await insertSignedInMember({
    database,
    token: "viewer",
    member: { role: "viewer" },
  });
  expect(
    (await app.inject({ ...request, headers: { cookie: viewer.cookie } }))
      .statusCode,
  ).toBe(403);
  expect((await app.inject({ ...request, headers: {} })).statusCode).toBe(401);
}

async function _assertReconciliationAcknowledgements(): Promise<void> {
  const { app, database, close } = await createTestApp();
  try {
    const { first, original, request } =
      await _seedReconciliationAcknowledgements(database);
    expect((await app.inject(request)).json()).toMatchObject({
      acknowledgedCount: 1,
      movedCount: 0,
      mismatchCount: 0,
    });
    expect((await app.inject(request)).json()).toMatchObject({
      acknowledgedCount: 0,
    });
    expect(
      await database
        .selectFrom("item_milestones")
        .select("span_mismatch_acknowledged_at")
        .where("item_id", "=", first)
        .executeTakeFirstOrThrow(),
    ).toEqual({ span_mismatch_acknowledged_at: original });
    expect(
      await database
        .selectFrom("item_capture_date_changes")
        .selectAll()
        .execute(),
    ).toEqual([]);
    await _assertAcknowledgementPermissions({ app, database, request });
  } finally {
    await close();
  }
}
describe("milestone reconciliation boundary", (): void => {
  it(
    "preserves the first acknowledgement timestamp and rejects viewer mutations",
    _assertReconciliationAcknowledgements,
  );
});
