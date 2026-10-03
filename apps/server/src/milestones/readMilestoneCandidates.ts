import type {
  ItemSummary,
  ListMilestoneCandidatesRequest,
  ListMilestoneCandidatesResponse,
} from "@memory-shoebox/shared";
import { readItemSummariesByItemIds } from "../archive/readItemSummariesByItemIds.ts";
import type { B2Client } from "../b2/createB2Client/createB2Client.types.ts";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import { ApiError } from "../http/ApiError.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import { applyVisibilityFilter } from "../visibility/applyVisibilityFilter.ts";
import {
  getMilestoneItemPositionFromCursor,
  makeMilestoneItemCursorFromPosition,
} from "./milestoneItemCursorHelpers.ts";
import type { FastifyBaseLogger } from "fastify";

/** Candidate read dependencies and validated selection. */
type CandidateOptions = {
  database: DatabaseExecutor;
  b2: B2Client;
  viewer: Viewer;
  milestoneId: string;
  query: Readonly<ListMilestoneCandidatesRequest>;
  now: Date;
  logger?: Pick<FastifyBaseLogger, "warn">;
};

function _getCandidateQuery(options: Readonly<CandidateOptions>) {
  return applyVisibilityFilter({
    viewer: options.viewer,
    query: options.database.selectFrom("items"),
  })
    .leftJoin("item_milestones", (join) => {
      return join
        .onRef("item_milestones.item_id", "=", "items.id")
        .on("item_milestones.milestone_id", "=", options.milestoneId);
    })
    .select([
      "items.id as itemId",
      "items.captured_on as capturedOn",
      "item_milestones.item_id as attachedItemId",
    ])
    .orderBy("items.captured_on", "desc")
    .orderBy("items.id", "desc")
    .limit(options.query.limit + 1);
}

async function _readCandidateRows(
  options: Readonly<CandidateOptions>,
  span: Readonly<{ starts_on: string; ends_on: string }>,
) {
  const position = getMilestoneItemPositionFromCursor(options.query.cursor);
  const from =
    options.query.scope === "span" ? span.starts_on : options.query.from;
  const to = options.query.scope === "span" ? span.ends_on : options.query.to;
  const selected = _getCandidateQuery(options);
  const fromBounded =
    from === undefined
      ? selected
      : selected.where("items.captured_on", ">=", from);
  const bounded =
    to === undefined
      ? fromBounded
      : fromBounded.where("items.captured_on", "<=", to);
  return (
    position === undefined
      ? bounded
      : bounded.where((eb) => {
          return eb.or([
            eb("items.captured_on", "<", position.capturedOn),
            eb.and([
              eb("items.captured_on", "=", position.capturedOn),
              eb("items.id", "<", position.itemId),
            ]),
          ]);
        })
  ).execute();
}

function _makeCandidatesFromRows(
  page: Awaited<ReturnType<typeof _readCandidateRows>>,
  summaries: ReadonlyMap<string, ItemSummary>,
  span: Readonly<{ starts_on: string; ends_on: string }>,
): ListMilestoneCandidatesResponse["candidates"] {
  return page.flatMap((row) => {
    const item = summaries.get(row.itemId);
    return item === undefined
      ? []
      : [
          {
            item,
            isAttached: row.attachedItemId !== null,
            isOutsideSpan:
              row.capturedOn < span.starts_on || row.capturedOn > span.ends_on,
          },
        ];
  });
}

/** Offers actual visible item identities, with advisory span/attachment flags. */
export async function readMilestoneCandidates(
  options: Readonly<CandidateOptions>,
): Promise<ListMilestoneCandidatesResponse> {
  const span = await options.database
    .selectFrom("milestones")
    .select(["starts_on", "ends_on"])
    .where("id", "=", options.milestoneId)
    .executeTakeFirst();
  if (span === undefined) {
    throw ApiError.notFound("milestone_not_found");
  }
  const rows = await _readCandidateRows(options, span);
  const page = rows.slice(0, options.query.limit);
  const summaries = await readItemSummariesByItemIds({
    ...options,
    itemIds: page.map((row) => {
      return row.itemId;
    }),
  });
  const lastRow = page.at(-1);
  return {
    candidates: _makeCandidatesFromRows(page, summaries, span),
    nextCursor:
      rows.length > options.query.limit && lastRow !== undefined
        ? makeMilestoneItemCursorFromPosition(lastRow)
        : null,
  };
}
