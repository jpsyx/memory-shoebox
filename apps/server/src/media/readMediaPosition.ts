import { sql, type Expression, type RawBuilder } from "kysely";
import {
  mediaPositionRequestSchema,
  mediaPositionResponseSchema,
  type MediaPositionRequest,
  type MediaPositionResponse,
} from "@memory-shoebox/shared";
import {
  makeSelectionExpressionFromFilter,
  makeTimelineFilterFromQuery,
} from "../archive/selectionFilterHelpers.ts";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";

/**
 * Counts and ranks one authorized selection in a single database snapshot.
 * Group anchors follow neighbors; frames use index ASC NULLS LAST, then ID.
 * This archive-wide read is deliberately separate from bounded neighbors.
 */
export async function readMediaPosition(
  options: Readonly<{
    database: DatabaseExecutor;
    viewer: Viewer;
    request: MediaPositionRequest;
  }>,
): Promise<MediaPositionResponse> {
  const request = mediaPositionRequestSchema.parse(options.request);
  const selected = options.database
    .selectFrom("items")
    .select([
      "id",
      "captured_on",
      "captured_at",
      "seq",
      "burst_id",
      "burst_index",
    ])
    .where(
      makeSelectionExpressionFromFilter({
        viewer: options.viewer,
        filter: makeTimelineFilterFromQuery(request.selection),
      }),
    );
  const query = _buildPositionQuery({ selected, itemId: request.itemId });
  const result = await query.execute(options.database);
  return mediaPositionResponseSchema.parse(result.rows[0] ?? null);
}

/** Keeps all ordering and aggregate work inside the selected SQL snapshot. */
function _buildPositionQuery(
  options: Readonly<{
    selected: Expression<unknown>;
    itemId: string;
  }>,
): RawBuilder<NonNullable<MediaPositionResponse>> {
  return sql<NonNullable<MediaPositionResponse>>`
    with selected as ${options.selected},
    anchored as (
      select selected.*,
        first_value(captured_at) over group_order as anchor_capture,
        first_value(seq) over group_order as anchor_sequence,
        first_value(id) over group_order as anchor_id
      from selected
      where exists (select 1 from selected where id = ${options.itemId})
      window group_order as (
        partition by captured_on, coalesce(burst_id, id)
        order by captured_at, seq, id
      )
    ),
    ranked as (
      select id, count(*) over () as total,
        row_number() over (
          order by captured_on desc, anchor_capture desc,
            anchor_sequence desc, anchor_id desc,
            burst_index asc nulls last, id asc
        ) as position
      from anchored
    )
    select position, total from ranked where id = ${options.itemId}
  `;
}
