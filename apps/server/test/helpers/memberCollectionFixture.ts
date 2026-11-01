import { expect, onTestFinished } from "vitest";
import type { LightMyRequestResponse } from "fastify";
import { createTestApp } from "./createTestApp.ts";
import { insertSignedInMember } from "./insertSignedInMember.ts";
import {
  insertBurst,
  insertItem,
  insertItemMilestone,
  insertItemPerson,
  insertItemTag,
  insertMember,
  insertMilestone,
  insertPerson,
  insertRendition,
  insertTag,
  insertUploadSession,
  insertVisibilityRule,
  setBurstCover,
} from "./seedHelpers/seedHelpers.ts";

type Context = Awaited<ReturnType<typeof createTestApp>>;
type Identities = Awaited<ReturnType<typeof _insertIdentities>>;

async function _insertIdentities(database: Context["database"]) {
  const reader = await insertSignedInMember({ database });
  const memberId = await insertMember(database, { display_name: "Jorge" });
  const otherMemberId = await insertMember(database);
  const person = await database
    .selectFrom("people")
    .select("id")
    .where("member_id", "=", memberId)
    .executeTakeFirst();
  const personId =
    person?.id ??
    (await insertPerson(database, {
      displayName: "Jorge",
      member_id: memberId,
    }));
  const sameNameId = await insertPerson(database, { displayName: "Jorge" });
  const hiddenRuleId = await insertVisibilityRule(database, { mode: "only" });
  return {
    reader,
    memberId,
    otherMemberId,
    personId,
    sameNameId,
    hiddenRuleId,
  };
}

async function _insertCollectionItem(
  options: Readonly<{
    database: Context["database"];
    identities: Readonly<Identities>;
    index: number;
  }>,
) {
  const { database, identities, index } = options;
  const isUpload = [0, 2, 3, 6].includes(index);
  const capturedOn = index === 3 ? "2026-09-26" : "2026-09-27";
  const itemId = await insertItem(database, {
    uploadedBy: isUpload ? identities.memberId : identities.otherMemberId,
    seq: index + 1,
    kind: index === 3 ? "video" : "photo",
    duration_ms: index === 3 ? 1000 : null,
    captured_on: capturedOn,
    captured_at: `${capturedOn}T12:0${index}:00.000Z`,
    ...(index >= 6 ? { visibility_rule_id: identities.hiddenRuleId } : {}),
  });
  await insertRendition(database, { itemId });
  if ([1, 2, 7].includes(index)) {
    await insertItemPerson(database, { itemId, personId: identities.personId });
  }
  if (index === 4) {
    await insertItemPerson(database, {
      itemId,
      personId: identities.sameNameId,
    });
  }
  return itemId;
}

async function _insertCollectionBurst(
  options: Readonly<{
    database: Context["database"];
    memberId: string;
    itemIds: readonly string[];
  }>,
) {
  const { database, memberId, itemIds } = options;
  const uploadSessionId = await insertUploadSession(database, {
    uploadedBy: memberId,
  });
  const burstId = await insertBurst(database, {
    uploadSessionId,
    capturedOn: "2026-09-27",
  });
  await Promise.all(
    [0, 2, 4, 6].map((itemIndex, burstIndex) => {
      return database
        .updateTable("items")
        .set({ burst_id: burstId, burst_index: burstIndex + 1 })
        .where("id", "=", itemIds[itemIndex]!)
        .execute();
    }),
  );
  await setBurstCover(database, { burstId, coverItemId: itemIds[4]! });
  return burstId;
}

async function _insertCollectionLabels(
  options: Readonly<{
    database: Context["database"];
    memberId: string;
    itemIds: readonly string[];
  }>,
) {
  const { database, itemIds } = options;
  const burstId = await _insertCollectionBurst(options);
  const tagId = await insertTag(database, { name: "Beach" });
  await Promise.all(
    itemIds.map((itemId) => {
      return insertItemTag(database, { itemId, tagId });
    }),
  );
  const milestoneId = await insertMilestone(database, {
    name: "Holiday",
    startsOn: "2026-09-27",
  });
  await insertItemMilestone(database, { itemId: itemIds[0]!, milestoneId });
  return { burstId, tagId, milestoneId };
}

function _getFixtureRequests(
  options: Readonly<{
    context: Context;
    cookie: string;
    hiddenItemIds: readonly string[];
  }>,
) {
  const headers = { cookie: options.cookie };
  const assertPrivateResponse = (response: LightMyRequestResponse) => {
    expect(
      options.hiddenItemIds.every((id) => {
        return !response.body.includes(id);
      }),
    ).toBe(true);
    return response;
  };
  const get = (path: string) => {
    return options.context.app
      .inject({
        method: "GET",
        url: `/api/${path}`,
        headers,
      })
      .then(assertPrivateResponse);
  };
  const post = (path: string, payload: object) => {
    return options.context.app
      .inject({
        method: "POST",
        url: `/api/${path}`,
        headers,
        payload,
      })
      .then(assertPrivateResponse);
  };
  return { get, post };
}

type MemberCollectionFixture = Context &
  Identities & {
    burstId: string;
    tagId: string;
    milestoneId: string;
    itemIds: string[];
    expectedIds: string[];
    hiddenItemIds: string[];
  } & ReturnType<typeof _getFixtureRequests>;

/** One real-route privacy fixture shared by every member selection consumer. */
export async function makeMemberCollectionFixture(): Promise<MemberCollectionFixture> {
  const context = await createTestApp();
  onTestFinished(context.close);
  const identities = await _insertIdentities(context.database);
  const itemIds = await Promise.all(
    Array.from({ length: 8 }, (_, index) => {
      return _insertCollectionItem({
        database: context.database,
        identities,
        index,
      });
    }),
  );
  const labels = await _insertCollectionLabels({
    database: context.database,
    memberId: identities.memberId,
    itemIds,
  });
  const hiddenItemIds = itemIds.slice(6);
  const requests = _getFixtureRequests({
    context,
    cookie: identities.reader.cookie,
    hiddenItemIds,
  });
  return {
    ...context,
    ...identities,
    ...labels,
    itemIds,
    expectedIds: itemIds.slice(0, 4),
    hiddenItemIds,
    ...requests,
  };
}
