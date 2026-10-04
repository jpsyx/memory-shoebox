import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  listMilestonesRequestSchema,
  milestoneIdParamsSchema,
  type ListMilestonesRequest,
  type ListMilestonesResponse,
} from "@memory-shoebox/shared";
import { readMilestoneItemCounts } from "../../archive/readMilestoneItemCounts.ts";
import { requireViewer } from "../../http/requestContextHelpers.ts";
import {
  getMilestonePositionFromCursor,
  makeMilestoneCursorFromPosition,
} from "../../milestones/milestoneCursorHelpers.ts";
import {
  makeMilestoneSummaryFromMilestoneRow,
  readMilestoneDetail,
} from "../../milestones/milestoneReadHelpers.ts";
import type { MilestonesTable } from "../../db/types/catalog.types.ts";
import type { DatabaseExecutor } from "../../db/types/db.types.ts";
async function _readListRows(
  options: Readonly<{
    database: DatabaseExecutor;
    query: Readonly<ListMilestonesRequest>;
  }>,
): Promise<MilestonesTable[]> {
  const { database, query } = options;
  const position = getMilestonePositionFromCursor(query.cursor);
  const all = database
    .selectFrom("milestones")
    .selectAll()
    .orderBy("starts_on", "desc")
    .orderBy("id", "desc")
    .limit(query.limit + 1);
  const fromBounded =
    query.from === undefined ? all : all.where("ends_on", ">=", query.from);
  const toBounded =
    query.to === undefined
      ? fromBounded
      : fromBounded.where("starts_on", "<=", query.to);
  return (
    position === undefined
      ? toBounded
      : toBounded.where((eb) => {
          return eb.or([
            eb("starts_on", "<", position.startsOn),
            eb.and([
              eb("starts_on", "=", position.startsOn),
              eb("id", "<", position.milestoneId),
            ]),
          ]);
        })
  ).execute();
}
async function _listMilestones(
  request: Readonly<FastifyRequest>,
): Promise<ListMilestonesResponse> {
  const viewer = requireViewer(request);
  const query = listMilestonesRequestSchema.parse(request.query);
  const rows = await _readListRows({
    database: request.server.database,
    query,
  });
  const page = rows.slice(0, query.limit);
  const counts = await readMilestoneItemCounts({
    database: request.server.database,
    viewer,
    milestoneIds: page.map((row) => {
      return row.id;
    }),
  });
  const lastRow = page.at(-1);
  return {
    milestones: page.map((row) => {
      return makeMilestoneSummaryFromMilestoneRow({
        row,
        viewer,
        itemCount: counts.get(row.id) ?? 0,
      });
    }),
    nextCursor:
      rows.length > query.limit && lastRow !== undefined
        ? makeMilestoneCursorFromPosition({
            startsOn: lastRow.starts_on,
            milestoneId: lastRow.id,
          })
        : null,
  };
}
/** Registers member-visible occasion list and detail reads. */
export async function registerReadMilestoneRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get("/milestones", _listMilestones);
  app.get("/milestones/:milestoneId", async (request) => {
    const viewer = requireViewer(request);
    const { milestoneId } = milestoneIdParamsSchema.parse(request.params);
    return readMilestoneDetail({
      database: request.server.database,
      viewer,
      milestoneId,
    });
  });
}
