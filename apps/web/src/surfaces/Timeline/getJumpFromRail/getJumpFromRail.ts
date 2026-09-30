/**
 * What pressing a day on the rail should do.
 *
 * The rail lists every visible day, which is hundreds, while the stream pages
 * ten at a time behind a cursor the client must not mint. A day already drawn
 * is therefore scrolled to and costs nothing; any other day restarts the stream
 * from there, which on the wire is `until` and in the URL is `at`.
 *
 * `at` is a start position and not a filter. It never puts a chip in the strip
 * and the strip's clear-all never touches it, because a filter left on by
 * accident is this surface's worst failure and a jump is not something anybody
 * filtered by.
 */
export type Jump =
  | { readonly kind: "scroll"; readonly anchorId: string }
  | { readonly kind: "restart"; readonly at: string };

/** Decides between scrolling to a loaded day and restarting the stream. */
export function getJumpFromRail(options: {
  capturedOn: string;
  loadedDays: readonly string[];
}): Jump {
  return options.loadedDays.includes(options.capturedOn)
    ? { kind: "scroll", anchorId: `day-${options.capturedOn}` }
    : { kind: "restart", at: options.capturedOn };
}
