import {
  ApiRequestError,
  apiFetch,
  makePathFromSearchParams,
} from "@/api/clientHelpers/clientHelpers";
import { listMilestoneCandidatesResponseSchema } from "@memory-shoebox/shared";
type ReadRecoveryPageOptions = {
  milestoneId: string;
  pending: Set<string>;
  baseline: Map<string, boolean>;
  cursors: Set<string>;
  cursor?: string;
};

function _getRecoveryPathFromCursor(
  options: Readonly<{ milestoneId: string; cursor?: string }>,
): string {
  const searchParams = new URLSearchParams({ scope: "all" });
  if (options.cursor !== undefined) {
    searchParams.set("cursor", options.cursor);
  }
  return makePathFromSearchParams({
    basePath: `/milestones/${encodeURIComponent(options.milestoneId)}/candidates`,
    searchParams,
  });
}
function _requireRecoveryCursor({
  cursor,
  cursors,
}: Readonly<{
  cursor: string | undefined;
  cursors: ReadonlySet<string>;
}>): string {
  if (cursor === undefined) {
    throw new ApiRequestError({
      status: 409,
      code: "occasion_choices_unavailable",
      message: "Chosen photographs unavailable",
    });
  }
  if (cursors.has(cursor)) {
    throw new ApiRequestError({
      status: 409,
      code: "occasion_choices_repeated",
      message: "Photograph page repeated",
    });
  }
  return cursor;
}
async function _readRecoveryPage(
  options: Readonly<
    Omit<ReadRecoveryPageOptions, "pending" | "baseline" | "cursors"> & {
      pending: ReadonlySet<string>;
      baseline: ReadonlyMap<string, boolean>;
      cursors: ReadonlySet<string>;
    }
  >,
): Promise<Map<string, boolean>> {
  const page = await apiFetch({
    path: _getRecoveryPathFromCursor(options),
    schema: listMilestoneCandidatesResponseSchema,
  });
  const baseline = new Map(options.baseline);
  page.candidates.forEach(({ item, isAttached }) => {
    if (options.pending.has(item.itemId)) {
      baseline.set(item.itemId, isAttached);
    }
  });
  if (
    [...options.pending].every((itemId) => {
      return baseline.has(itemId);
    })
  ) {
    return baseline;
  }
  const cursor = _requireRecoveryCursor({
    cursor: page.nextCursor ?? undefined,
    cursors: options.cursors,
  });
  return _readRecoveryPage({
    ...options,
    baseline,
    cursor,
    cursors: new Set([...options.cursors, cursor]),
  });
}
/** Re-reads each pending identity after an uncertain attachment answer. */
export function getMilestoneRecoveryBaselineFromItemIds(
  options: Readonly<{ milestoneId: string; pending: ReadonlySet<string> }>,
): Promise<Map<string, boolean>> {
  return _readRecoveryPage({
    ...options,
    baseline: new Map(),
    cursors: new Set(),
  });
}
