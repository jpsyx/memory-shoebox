import type { Database } from "../../../../src/db/types/db.types.ts";
import type { Selectable } from "kysely";
import { describe, expect, it } from "vitest";
import {
  NOW,
  insertMember,
  insertRemovalRequest,
} from "../../../helpers/seedHelpers/seedHelpers.ts";
import {
  createDeletionContext,
  requestRemoval,
} from "./deleteResolutionTestHelpers.ts";

type AnswersEveryOpenRequestUsingFactsBefore1State0 = {
  context: Awaited<ReturnType<typeof createDeletionContext>>;
  database: import("kysely", { with: { "resolution-mode": "import" } }).Kysely<
    import(
      "../../../../src/db/types/db.types.ts",
      { with: { "resolution-mode": "import" } }
    ).Database
  >;
  uploaderId: string;
  actor: import(
    "../../../helpers/insertSignedInMember.ts",
    { with: { "resolution-mode": "import" } }
  ).SignedInMember;
  itemId: string;
  close: () => Promise<void>;
};

type AnswersEveryOpenRequestUsingFactsBefore1State1 =
  AnswersEveryOpenRequestUsingFactsBefore1State0 & {
    requesterId: Awaited<ReturnType<typeof insertMember>>;
    otherRequesterId: Awaited<ReturnType<typeof insertMember>>;
    requestId: Awaited<ReturnType<typeof requestRemoval>>;
    otherRequestId: Awaited<ReturnType<typeof requestRemoval>>;
    settledId: Awaited<ReturnType<typeof insertRemovalRequest>>;
  };

type AnswersEveryOpenRequestUsingFactsBefore1State2 =
  AnswersEveryOpenRequestUsingFactsBefore1State1 & {
    settledBefore: Selectable<Database["removal_requests"]>;
    response: import("fastify").LightMyRequestResponse;
    rows: Array<Selectable<Database["removal_requests"]>>;
  };

type AnswersEveryOpenRequestUsingFactsBefore1State3 =
  AnswersEveryOpenRequestUsingFactsBefore1State2 & {
    emails: Array<Selectable<Database["outbound_emails"]>>;
  };

type AnswersEveryOpenRequestUsingFactsBefore1State4 =
  AnswersEveryOpenRequestUsingFactsBefore1State3;

async function _answersEveryOpenRequestUsingFactsBefore1Stage1(
  state: Readonly<AnswersEveryOpenRequestUsingFactsBefore1State0>,
): Promise<AnswersEveryOpenRequestUsingFactsBefore1State1> {
  const { database, context, uploaderId, itemId } = state;
  const requesterId = await insertMember(database, {
    notify_on_removal: 0,
  });
  const otherRequesterId = await insertMember(database);
  const requestId = await requestRemoval({
    context,
    requesterId,
  });
  const otherRequestId = await requestRemoval({
    context,
    requesterId: otherRequesterId,
  });
  const settledId = await insertRemovalRequest(database, {
    requestedByMemberId: requesterId,
    itemUploaderMemberId: uploaderId,
    item_id: itemId,
    resolved_by_member_id: uploaderId,
  });
  return {
    ...state,
    requesterId,
    otherRequesterId,
    requestId,
    otherRequestId,
    settledId,
  };
}

async function _answersEveryOpenRequestUsingFactsBefore1Stage2(
  state: Readonly<AnswersEveryOpenRequestUsingFactsBefore1State1>,
): Promise<AnswersEveryOpenRequestUsingFactsBefore1State2> {
  const { database, settledId, context, itemId, actor } = state;
  const settledBefore = await database
    .selectFrom("removal_requests")
    .selectAll()
    .where("id", "=", settledId)
    .executeTakeFirstOrThrow();
  const response = await context.app.inject({
    method: "DELETE",
    url: `/api/items/${itemId}`,
    headers: { cookie: actor.cookie },
  });
  expect(response.statusCode).toBe(204);
  const rows = await database
    .selectFrom("removal_requests")
    .selectAll()
    .execute();
  expect(
    rows.find((row) => {
      return row.id === settledId;
    }),
  ).toEqual({ ...settledBefore, item_id: null });
  return { ...state, settledBefore, response, rows };
}

async function _answersEveryOpenRequestUsingFactsBefore1Stage3(
  state: Readonly<AnswersEveryOpenRequestUsingFactsBefore1State2>,
): Promise<AnswersEveryOpenRequestUsingFactsBefore1State3> {
  const {
    requestId,
    otherRequestId,
    rows,
    actor,
    database,
    requesterId,
    uploaderId,
    otherRequesterId,
  } = state;
  [requestId, otherRequestId].forEach((id) => {
    expect(
      rows.find((row) => {
        return row.id === id;
      }),
    ).toMatchObject({
      state: "deleted",
      resolved_at: NOW,
      resolved_by_member_id: actor.memberId,
      item_id: null,
    });
  });
  const emails = await database
    .selectFrom("outbound_emails")
    .selectAll()
    .execute();
  expect(
    new Set(
      emails.map((email) => {
        return email.idempotency_key;
      }),
    ),
  ).toEqual(
    new Set([
      `removal-resolved:${requestId}:${requesterId}`,
      `removal-resolved:${requestId}:${uploaderId}`,
      `removal-resolved:${otherRequestId}:${otherRequesterId}`,
      `removal-resolved:${otherRequestId}:${uploaderId}`,
    ]),
  );
  return { ...state, emails };
}

async function _answersEveryOpenRequestUsingFactsBefore1Stage4(
  state: Readonly<AnswersEveryOpenRequestUsingFactsBefore1State3>,
): Promise<AnswersEveryOpenRequestUsingFactsBefore1State4> {
  const { emails, uploaderId, context } = state;
  emails.forEach((email) => {
    const payload = JSON.parse(email.payload_json);
    expect(payload).toMatchObject({
      outcome: "deleted",
      resolvedByDisplayName: "Actor",
      resolvedAt: NOW,
    });
    expect(payload.itemUrl).toBeUndefined();
    expect(payload.preferencesUrl === null).toBe(
      email.to_member_id !== uploaderId,
    );
  });
  expect(context.b2.calls).toEqual([]);
  return { ...state };
}

async function _assertAnswersEveryOpenRequestUsingFactsBeforeSET1(): Promise<void> {
  const context = await createDeletionContext();
  const { database, uploaderId, actor, itemId, close } = context;
  try {
    const state0 = { context, database, uploaderId, actor, itemId, close };
    const state1 =
      await _answersEveryOpenRequestUsingFactsBefore1Stage1(state0);
    const state2 =
      await _answersEveryOpenRequestUsingFactsBefore1Stage2(state1);
    const state3 =
      await _answersEveryOpenRequestUsingFactsBefore1Stage3(state2);
    await _answersEveryOpenRequestUsingFactsBefore1Stage4(state3);
  } finally {
    await close();
  }
}
describe("deletion resolution mail", (): void => {
  it(
    "answers every open request using facts before SET NULL and preserves settled history",
    _assertAnswersEveryOpenRequestUsingFactsBeforeSET1,
  );
});
