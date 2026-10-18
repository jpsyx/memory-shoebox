import { sql, type SelectQueryBuilder } from "kysely";
import {
  mediaNeighborsRequestSchema,
  type MediaNeighborsRequest,
  type MediaNeighborsResponse,
  type MediaPreview,
} from "@memory-shoebox/shared";
import {
  makeSelectionExpressionFromFilter,
  makeTimelineFilterFromQuery,
  type TimelineFilter,
} from "../archive/selectionFilterHelpers.ts";
import type { B2Client } from "../b2/createB2Client/createB2Client.types.ts";
import type { Database, DatabaseExecutor } from "../db/types/db.types.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import {
  sortsAfterFrame,
  sortsBeforeFrame,
} from "../items/readBurstFramePage/frameSortKey.ts";
import { readMediaPreviews } from "./readMediaPreviews.ts";

type ReadOptions = {
  database: DatabaseExecutor;
  b2: B2Client;
  viewer: Viewer;
  now: Date;
  request: MediaNeighborsRequest;
};

type SelectionOptions = {
  database: DatabaseExecutor;
  viewer: Viewer;
  filter: TimelineFilter;
};
type NeighborRow = {
  id: string;
  captured_on: string;
  captured_at: string;
  seq: number;
  burst_id: string | null;
  burst_index: number | null;
};
type StepOptions = SelectionOptions & {
  current: NeighborRow;
  direction: "next" | "previous";
};

function _buildSelectedQuery({
  options,
  isTimeline = false,
}: {
  options: Readonly<SelectionOptions>;
  isTimeline?: boolean;
}): SelectQueryBuilder<Database, "items", NeighborRow> {
  // The visibility OR can otherwise force a whole-range sort at day edges.
  const table = sql<Database["items"]>`items`.as<"items">(
    isTimeline ? sql`items indexed by items_navigation_capture` : sql`items`,
  );
  return options.database
    .selectFrom(table)
    .select([
      "id",
      "captured_on",
      "captured_at",
      "seq",
      "burst_id",
      "burst_index",
    ])
    .where(makeSelectionExpressionFromFilter(options));
}

/**
 * One indexed sibling probe, including reverse null placement at burst edges.
 */
async function _readFrame({
  options,
  isEdge,
}: {
  options: Readonly<StepOptions>;
  isEdge: boolean;
}): Promise<NeighborRow | undefined> {
  if (options.current.burst_id === null) {
    return undefined;
  }
  const isNext = options.direction === "next";
  const selectedQuery = _buildSelectedQuery({ options }).where(
    "burst_id",
    "=",
    options.current.burst_id,
  );
  const query = isEdge
    ? selectedQuery
    : (() => {
        const frame = {
          itemId: options.current.id,
          burstIndex: options.current.burst_index,
        };
        return selectedQuery.where(
          isNext ? sortsAfterFrame(frame) : sortsBeforeFrame(frame),
        );
      })();
  return query
    .orderBy("burst_index", (order) => {
      return isNext ? order.asc().nullsLast() : order.desc().nullsFirst();
    })
    .orderBy("id", isNext ? "asc" : "desc")
    .limit(1)
    .executeTakeFirst();
}

/**
 * A collapsed stack occupies its earliest matching capture, never its cover.
 */
async function _readAnchor(
  options: Readonly<StepOptions>,
): Promise<NeighborRow> {
  if (options.current.burst_id === null) {
    return options.current;
  }
  return (
    (await _buildSelectedQuery({ options })
      .where("burst_id", "=", options.current.burst_id)
      .where("captured_on", "=", options.current.captured_on)
      .orderBy("captured_at")
      .orderBy("seq")
      .orderBy("id")
      .limit(1)
      .executeTakeFirst()) ?? options.current
  );
}

/**
 * Only visible group representatives qualify; the correlated edge is LIMIT 1.
 */
function _buildTimelineQuery(
  options: Readonly<SelectionOptions>,
): SelectQueryBuilder<
  Database & { candidate: NeighborRow },
  "candidate",
  NeighborRow
> {
  return options.database
    .selectFrom(
      _buildSelectedQuery({ options, isTimeline: true }).as("candidate"),
    )
    .selectAll("candidate")
    .where((eb) => {
      return eb.or([
        eb("candidate.burst_id", "is", null),
        eb(
          "candidate.id",
          "=",
          eb
            .selectFrom("items")
            .select("items.id")
            .whereRef("items.burst_id", "=", "candidate.burst_id")
            .whereRef("items.captured_on", "=", "candidate.captured_on")
            .where(makeSelectionExpressionFromFilter(options))
            .orderBy("items.captured_at")
            .orderBy("items.seq")
            .orderBy("items.id")
            .limit(1),
        ),
      ]);
    });
}

/** Separate same-day and cross-day ranges keep each ordered probe bounded. */
async function _readTimelineNeighbor(
  options: Readonly<StepOptions>,
): Promise<NeighborRow | undefined> {
  const anchor = await _readAnchor(options);
  const isNext = options.direction === "next";
  const order = isNext ? "desc" : "asc";
  const query = _buildTimelineQuery(options);
  const tuple = sql`(candidate.captured_at, candidate.seq, candidate.id)`;
  const anchorTuple = sql`(${anchor.captured_at}, ${anchor.seq}, ${anchor.id})`;
  const sameDay = await query
    .where("candidate.captured_on", "=", anchor.captured_on)
    .where(sql<boolean>`${tuple} ${sql.raw(isNext ? "<" : ">")} ${anchorTuple}`)
    .orderBy("candidate.captured_at", order)
    .orderBy("candidate.seq", order)
    .orderBy("candidate.id", order)
    .limit(1)
    .executeTakeFirst();
  if (sameDay !== undefined) {
    return sameDay;
  }
  // Find the adjacent day first so the existing mixed-direction index can
  // supply its reversed capture edge without sorting the whole day.
  const adjacentDay = query
    .clearSelect()
    .select("candidate.captured_on")
    .where("candidate.captured_on", isNext ? "<" : ">", anchor.captured_on)
    .orderBy("candidate.captured_on", isNext ? "desc" : "asc")
    .limit(1);
  return query
    .where("candidate.captured_on", "=", adjacentDay)
    .orderBy("candidate.captured_at", order)
    .orderBy("candidate.seq", order)
    .orderBy("candidate.id", order)
    .limit(1)
    .executeTakeFirst();
}

async function _readStep(
  options: Readonly<StepOptions>,
): Promise<NeighborRow | undefined> {
  const frame = await _readFrame({ options, isEdge: false });
  if (frame !== undefined) {
    return frame;
  }
  const adjacent = await _readTimelineNeighbor(options);
  if (adjacent === undefined || adjacent.burst_id === null) {
    return adjacent;
  }
  return _readFrame({
    options: { ...options, current: adjacent },
    isEdge: true,
  });
}

function _getPreviewsFromRows({
  rows,
  previewsById,
}: {
  rows: readonly NeighborRow[];
  previewsById: ReadonlyMap<string, MediaPreview>;
}): MediaPreview[] {
  return rows.flatMap((row) => {
    const preview = previewsById.get(row.id);
    return preview === undefined ? [] : [preview];
  });
}

async function _readPreviewsFromNeighbors(options: {
  readOptions: Readonly<ReadOptions>;
  ahead: readonly NeighborRow[];
  behind: readonly NeighborRow[];
}): Promise<MediaNeighborsResponse> {
  const itemIds = [...options.ahead, ...options.behind].map((row) => {
    return row.id;
  });
  const previews =
    itemIds.length === 0
      ? []
      : await readMediaPreviews({
          ...options.readOptions,
          request: { itemIds, purpose: "speculative-preview" },
        });
  const previewsById = new Map(
    previews.map((preview) => {
      return [preview.itemId, preview];
    }),
  );
  return {
    ahead: _getPreviewsFromRows({ rows: options.ahead, previewsById }),
    behind: _getPreviewsFromRows({ rows: options.behind, previewsById }),
  };
}

/**
 * Reads at most three exact navigation targets without opening or seeing them.
 */
export async function readMediaNeighbors(
  options: Readonly<ReadOptions>,
): Promise<MediaNeighborsResponse> {
  const request = mediaNeighborsRequestSchema.parse(options.request);
  const selection = {
    database: options.database,
    viewer: options.viewer,
    filter: makeTimelineFilterFromQuery(request.selection),
  };
  const current = await _buildSelectedQuery({ options: selection })
    .where("id", "=", request.itemId)
    .limit(1)
    .executeTakeFirst();
  if (current === undefined) {
    return { ahead: [], behind: [] };
  }
  const step = { ...selection, current, direction: request.direction };
  const first = await _readStep(step);
  const second =
    first === undefined
      ? undefined
      : await _readStep({ ...step, current: first });
  const behind = await _readStep({
    ...step,
    direction: request.direction === "next" ? "previous" : "next",
  });
  return _readPreviewsFromNeighbors({
    readOptions: options,
    ahead: [first, second].filter((row) => {
      return row !== undefined;
    }),
    behind: behind === undefined ? [] : [behind],
  });
}
