import type {
  ItemSummary,
  ListMilestoneMismatchesRequest,
  ListMilestoneMismatchesResponse,
} from "@memory-shoebox/shared";
import type { FastifyBaseLogger } from "fastify";
import { readItemSummariesByItemIds } from "../archive/readItemSummariesByItemIds.ts";
import type { B2Client } from "../b2/createB2Client/createB2Client.types.ts";
import type { MilestonesTable } from "../db/types/catalog.types.ts";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import { ApiError } from "../http/ApiError.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import { applyVisibilityFilter } from "../visibility/applyVisibilityFilter.ts";
import {
  getMilestoneItemPositionFromCursor,
  makeMilestoneItemCursorFromPosition,
  makeMilestoneItemPaginationExpressionFromPosition,
} from "./milestoneItemCursorHelpers.ts";

/** Mismatch page dependencies and validated pagination. */
type MismatchOptions = {
  database: DatabaseExecutor;
  b2: B2Client;
  viewer: Viewer;
  milestoneId: string;
  query: Readonly<ListMilestoneMismatchesRequest>;
  now: Date;
  logger?: Pick<FastifyBaseLogger, "warn">;
};

function _getMismatchQuery(
  options: Readonly<MismatchOptions>,
  span: Readonly<{ starts_on: string; ends_on: string }>,
) {
  return applyVisibilityFilter({
    viewer: options.viewer,
    query: options.database
      .selectFrom("items")
      .innerJoin("item_milestones", "item_milestones.item_id", "items.id")
      .where("item_milestones.milestone_id", "=", options.milestoneId)
      .where("item_milestones.span_mismatch_acknowledged_at", "is", null)
      .where((eb) => {
        return eb.or([
          eb("items.captured_on", "<", span.starts_on),
          eb("items.captured_on", ">", span.ends_on),
        ]);
      }),
  });
}

async function _readMismatchRows(
  options: Readonly<MismatchOptions>,
  span: Readonly<{ starts_on: string; ends_on: string }>,
) {
  const position = getMilestoneItemPositionFromCursor(options.query.cursor);
  const selected = _getMismatchQuery(options, span)
    .select([
      "items.id as itemId",
      "items.captured_on as capturedOn",
      "item_milestones.attached_at as attachedAt",
    ])
    .orderBy("items.captured_on", "desc")
    .orderBy("items.id", "desc")
    .limit(options.query.limit + 1);
  return (
    position === undefined
      ? selected
      : selected.where(
          makeMilestoneItemPaginationExpressionFromPosition(position),
        )
  ).execute();
}

function _makeWideningSpan(
  span: Readonly<{ starts_on: string; ends_on: string }>,
  bounds: Readonly<{ earliestDay: string | null; latestDay: string | null }>,
): ListMilestoneMismatchesResponse["wideningSpan"] {
  return {
    startsOn:
      bounds.earliestDay !== null && bounds.earliestDay < span.starts_on
        ? bounds.earliestDay
        : span.starts_on,
    endsOn:
      bounds.latestDay !== null && bounds.latestDay > span.ends_on
        ? bounds.latestDay
        : span.ends_on,
  };
}

type MismatchPageParts = {
  rows: Awaited<ReturnType<typeof _readMismatchRows>>;
  page: Awaited<ReturnType<typeof _readMismatchRows>>;
  summaries: Map<string, ItemSummary>;
  span: MilestonesTable;
  bounds: { earliestDay: string | null; latestDay: string | null };
  limit: number;
};

function _makeMismatchPage(
  options: Readonly<MismatchPageParts>,
): ListMilestoneMismatchesResponse {
  const { rows, page, summaries, span, bounds } = options;
  const lastRow = page.at(-1);
  return {
    milestone: {
      milestoneId: span.id,
      name: span.name,
      startsOn: span.starts_on,
      endsOn: span.ends_on,
      blurb: span.blurb,
    },
    mismatches: page.flatMap((row) => {
      const item = summaries.get(row.itemId);
      return item === undefined ? [] : [{ item, attachedAt: row.attachedAt }];
    }),
    wideningSpan: _makeWideningSpan(span, bounds),
    nextCursor:
      rows.length > options.limit && lastRow !== undefined
        ? makeMilestoneItemCursorFromPosition(lastRow)
        : null,
  };
}

/** Lists visible pending mismatches; widening covers the entire matching set. */
export async function readMilestoneMismatches(
  options: Readonly<MismatchOptions>,
): Promise<ListMilestoneMismatchesResponse> {
  const span = await options.database
    .selectFrom("milestones")
    .selectAll()
    .where("id", "=", options.milestoneId)
    .executeTakeFirst();
  if (span === undefined) {
    throw ApiError.notFound("milestone_not_found");
  }
  const [rows, bounds] = await Promise.all([
    _readMismatchRows(options, span),
    _getMismatchQuery(options, span)
      .select((eb) => {
        return [
          eb.fn.min<string>("items.captured_on").as("earliestDay"),
          eb.fn.max<string>("items.captured_on").as("latestDay"),
        ];
      })
      .executeTakeFirstOrThrow(),
  ]);
  const page = rows.slice(0, options.query.limit);
  const summaries = await readItemSummariesByItemIds({
    ...options,
    itemIds: page.map((row) => {
      return row.itemId;
    }),
  });
  return _makeMismatchPage({
    rows,
    page,
    summaries,
    span,
    bounds,
    limit: options.query.limit,
  });
}
