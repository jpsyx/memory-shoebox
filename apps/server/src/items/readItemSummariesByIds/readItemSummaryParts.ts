import type {
  MediaSource,
  MemberRef,
  PersonRef,
  VisibilitySummary,
} from "@memory-shoebox/shared";
import { appConfig } from "../../../../../app.config.ts";
import { readMediaSources } from "../../archive/readMediaSources.ts";
import { readMemberRefs } from "../../archive/readMemberRefs.ts";
import { readPeopleRefsByItemId } from "../../archive/readPeopleRefsByItemId.ts";
import { readVisibilitySummaries } from "../../archive/readVisibilitySummaries.ts";
import type { B2Client } from "../../b2/client/client.ts";
import type { DatabaseExecutor } from "../../db/types/db.types.ts";
import type { Viewer } from "../../http/requestContextHelpers.ts";
import { readInstanceSettings } from "../../settings/readInstanceSettings.ts";
import type { BurstFrameRow } from "../readBurstFrameRefs/readBurstFrameRows.ts";
import { readBurstSiblingsByBurstId } from "./readBurstSiblingsByBurstId.ts";
import type { ItemSummaryRow } from "./readItemSummaryRows.ts";

/** The item, rule and burst ids the batch reads below key off. */
function _makeIdsFromRows(rows: readonly ItemSummaryRow[]): {
  itemIds: string[];
  ruleIds: string[];
  burstIds: string[];
} {
  const itemIds = rows.map((row) => {
    return row.itemId;
  });
  const ruleIds = [
    ...new Set(
      rows.map((row) => {
        return row.visibilityRuleId;
      }),
    ),
  ];
  const burstIds = [
    ...new Set(
      rows.flatMap((row) => {
        return row.burstId === null ? [] : [row.burstId];
      }),
    ),
  ];
  return { itemIds, ruleIds, burstIds };
}

/** The five non-burst lookups a row's summary is composed from. */
type ItemLookups = {
  mediaSources: ReadonlyMap<string, ReadonlyMap<string, MediaSource>>;
  peopleByItemId: ReadonlyMap<string, PersonRef[]>;
  visibilities: ReadonlyMap<string, VisibilitySummary>;
  members: ReadonlyMap<string, MemberRef>;
  timezone: string;
};

/** Every read a selection costs besides its bursts', however many rows. */
async function _readItemLookups(options: {
  database: DatabaseExecutor;
  b2: B2Client;
  now: Date;
  itemIds: readonly string[];
  ruleIds: readonly string[];
}): Promise<ItemLookups> {
  const [mediaSources, peopleByItemId, visibilities, members, settings] =
    await Promise.all([
      readMediaSources({
        database: options.database,
        b2: options.b2,
        itemIds: options.itemIds,
        now: options.now,
        ttlSeconds: appConfig.media.signedUrlTtlSeconds,
      }),
      readPeopleRefsByItemId({
        database: options.database,
        itemIds: options.itemIds,
      }),
      readVisibilitySummaries({
        database: options.database,
        ruleIds: options.ruleIds,
      }),
      readMemberRefs(options.database),
      readInstanceSettings({
        database: options.database,
        keys: ["shoebox.timezone"],
      }),
    ]);

  return {
    mediaSources,
    peopleByItemId,
    visibilities,
    members,
    timezone: settings["shoebox.timezone"],
  };
}

/** Everything a row's summary is composed from, read in one round. */
export type ItemSummaryParts = ItemLookups & {
  siblingsByBurstId: ReadonlyMap<string, BurstFrameRow[]>;
  covers: ReadonlyMap<string, string>;
};

/**
 * The batched reads a selection costs, keyed by the rows already read.
 *
 * @param options.database The Kysely handle.
 * @param options.b2 The Backblaze client.
 * @param options.viewer The request's viewer.
 * @param options.now The request's clock.
 * @param options.rows The requested items, already visibility-filtered.
 */
export async function readItemSummaryParts(options: {
  database: DatabaseExecutor;
  b2: B2Client;
  viewer: Viewer;
  now: Date;
  rows: readonly ItemSummaryRow[];
}): Promise<ItemSummaryParts> {
  const { itemIds, ruleIds, burstIds } = _makeIdsFromRows(options.rows);

  const [lookups, burstParts] = await Promise.all([
    _readItemLookups({
      database: options.database,
      b2: options.b2,
      now: options.now,
      itemIds,
      ruleIds,
    }),
    readBurstSiblingsByBurstId({
      database: options.database,
      viewer: options.viewer,
      burstIds,
    }),
  ]);

  return {
    ...lookups,
    siblingsByBurstId: burstParts.siblingsByBurstId,
    covers: burstParts.covers,
  };
}
