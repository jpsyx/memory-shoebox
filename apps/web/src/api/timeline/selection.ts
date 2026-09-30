/**
 * The selection four routes share, spelled once.
 *
 * `GET /api/timeline`, `GET /api/timeline/rail` and `GET /api/filters/facets`
 * all take the identical parameters, and the URL carries them: a filter is an
 * address in this product, so a texted `?person=<id>&from=2026-09-01` has to
 * land on the same pile. Three spellings of one selection would drift, so
 * there is one, and every query key is derived from it.
 */

/** What the filter strip is showing. */
export type TimelineSelection = {
  readonly tags: readonly string[];
  readonly people: readonly string[];
  /** Inclusive capture date. Capture, never upload. */
  readonly from: string | undefined;
  readonly until: string | undefined;
};

/**
 * The selection, plus where the stream starts.
 *
 * The jump is deliberately not part of the selection. The rail moves the pile
 * without filtering it, so `at` never puts a chip in the strip and the strip's
 * clear-all never touches it: a filter left on by accident is this surface's
 * worst failure, and a jump is not something anybody filtered by.
 *
 * Changing the selection does drop it, which is the one edit that may:
 * `TimelineSurface`'s own handlers say why.
 */
export type TimelineView = {
  readonly selection: TimelineSelection;
  /** `YYYY-MM-DD`. The newest day the stream should start at. */
  readonly at: string | undefined;
};

/** The route's validated search parameters, as `_oneOrMany` leaves them. */
export type TimelineSearch = {
  tag?: readonly string[];
  person?: readonly string[];
  from?: string;
  until?: string;
  at?: string;
  find?: boolean;
};

/** Reads a route's search parameters as a view. */
export function getViewFromSearch(search: TimelineSearch): TimelineView {
  return {
    selection: {
      tags: search.tag ?? [],
      people: search.person ?? [],
      from: search.from,
      until: search.until,
    },
    at: search.at,
  };
}

/** Whether anything is filtered, which is what draws the strip. */
export function isSelectionActive(selection: TimelineSelection): boolean {
  return (
    selection.tags.length > 0 ||
    selection.people.length > 0 ||
    selection.from !== undefined ||
    selection.until !== undefined
  );
}

/** The wire parameters for a selection, with no start position. */
export function makeQueryFromSelection(
  selection: TimelineSelection,
): URLSearchParams {
  const query = new URLSearchParams();
  for (const tag of selection.tags) {
    query.append("tags", tag);
  }
  for (const person of selection.people) {
    query.append("people", person);
  }
  if (selection.from !== undefined) {
    query.set("from", selection.from);
  }
  if (selection.until !== undefined) {
    query.set("until", selection.until);
  }
  return query;
}

/**
 * The wire parameters for a view.
 *
 * The jump rides on `until` because there is no other way to start the stream
 * partway down: the cursor is opaque and the client must not mint one. Where
 * both a jump and a real `until` are set the earlier wins, because both are
 * upper bounds and the tighter one is the only answer that satisfies each.
 */
export function makeQueryFromView(view: TimelineView): URLSearchParams {
  const query = makeQueryFromSelection(view.selection);
  if (view.at !== undefined) {
    const existing = query.get("until");
    query.set(
      "until",
      existing === null || view.at < existing ? view.at : existing,
    );
  }
  return query;
}

/** A selection as a `Link`'s search prop, with every empty dimension left out. */
export function makeSearchFromSelection(
  selection: TimelineSelection,
): TimelineSearch {
  return {
    ...(selection.tags.length > 0 ? { tag: selection.tags } : {}),
    ...(selection.people.length > 0 ? { person: selection.people } : {}),
    ...(selection.from === undefined ? {} : { from: selection.from }),
    ...(selection.until === undefined ? {} : { until: selection.until }),
  };
}
