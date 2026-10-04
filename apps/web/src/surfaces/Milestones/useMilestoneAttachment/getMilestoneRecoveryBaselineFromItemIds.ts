import { listMilestoneCandidatesResponseSchema } from "@memory-shoebox/shared";
import {
  apiFetch,
  makePathFromSearchParams,
} from "@/api/clientHelpers/clientHelpers";
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
async function _readRecoveryPage(
  options: Readonly<{
    milestoneId: string;
    pending: ReadonlySet<string>;
    baseline: ReadonlyMap<string, boolean>;
    cursors: ReadonlySet<string>;
    cursor?: string;
  }>,
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
  if (page.nextCursor === null) {
    throw new Error(
      "Some chosen photographs are unavailable. Your choices are kept; restore access or cancel before saving.",
    );
  }
  if (options.cursors.has(page.nextCursor)) {
    throw new Error(
      "The photographs repeated a page. Your choices are kept. Retry the save.",
    );
  }
  return _readRecoveryPage({
    ...options,
    baseline,
    cursor: page.nextCursor,
    cursors: new Set([...options.cursors, page.nextCursor]),
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
