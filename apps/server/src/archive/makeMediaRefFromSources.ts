import type { MediaRef, MediaSource } from "@memory-shoebox/shared";

/**
 * Everything needed to draw one print, from that item's signed renditions.
 *
 * `thumb` and `display` are non-nullable on `MediaRef` and ingest writes both,
 * so the fallback chain here is for a catalog that has lost one rather than
 * for the ordinary case: the display copy falls back to the original, and the
 * thumbnail to the display copy and then the original.
 *
 * **An item with no renditions at all returns `undefined`**, and its caller
 * leaves it out of `items` while leaving it in `itemCount`. That is the same
 * shape as a burst frame, which is counted and not drawn, so no count
 * disagrees with itself; dropping it from the count too would make a data
 * defect look like a visibility rule.
 *
 * @param options.sources That item's signed sources, by rendition purpose.
 * @param options.durationMs `items.duration_ms`. Non-null on every video.
 * @param options.altText The composed alt text. Never null.
 */
export function makeMediaRefFromSources(options: {
  sources: ReadonlyMap<string, MediaSource>;
  durationMs: number | null;
  altText: string;
}): MediaRef | undefined {
  const { sources } = options;
  const display =
    sources.get("display") ?? sources.get("original") ?? sources.get("thumb");
  const thumb =
    sources.get("thumb") ?? sources.get("display") ?? sources.get("original");

  if (display === undefined || thumb === undefined) {
    return undefined;
  }

  const webm = sources.get("video_webm") ?? null;
  const mp4 = sources.get("video_mp4") ?? null;

  return {
    thumb,
    display,
    poster: sources.get("poster") ?? null,
    video: webm === null && mp4 === null ? null : { webm, mp4 },
    durationMs: options.durationMs,
    altText: options.altText,
  };
}
