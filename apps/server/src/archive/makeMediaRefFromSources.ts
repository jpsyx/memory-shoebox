import type {
  MediaReadPurpose,
  MediaRef,
  MediaSource,
} from "@memory-shoebox/shared";
import { getRenditionsFromReadPurpose } from "../media/getRenditionsFromReadPurpose.ts";

type MediaRefOptions = {
  sources: ReadonlyMap<string, MediaSource>;
  kind: "photo" | "video";
  width: number;
  height: number;
  previewState: MediaRef["previewState"];
  durationMs: number | null;
  altText: string;
};

function _getEligibleSourcesFromSources(
  options: Readonly<MediaRefOptions>,
  purpose: MediaReadPurpose,
): MediaSource[] {
  const rows = [...options.sources.values()].map((source) => {
    return { ...source, storageKey: source.url };
  });
  return getRenditionsFromReadPurpose({
    rows,
    kind: options.kind,
    purpose,
  }).flatMap((row) => {
    const source = options.sources.get(row.purpose);
    return source === undefined ? [] : [source];
  });
}

function _getDisplayCandidatesFromSources(
  sources: readonly MediaSource[],
): MediaSource[] {
  return sources
    .filter((source) => {
      return (
        source.purpose.startsWith("display") || source.purpose === "original"
      );
    })
    .sort((first, second) => {
      return first.width - second.width || first.byteSize - second.byteSize;
    });
}

function _getDisplayFromCandidates(
  candidates: readonly MediaSource[],
  thumb: MediaSource | null,
): MediaSource | null {
  return (
    candidates.find((source) => {
      return source.purpose === "display";
    }) ??
    candidates.find((source) => {
      return source.contentType === "image/jpeg";
    }) ??
    candidates[0] ??
    thumb
  );
}

function _getRepresentationRolesFromSources(
  options: Readonly<MediaRefOptions>,
): Pick<
  MediaRef,
  "thumb" | "display" | "displayCandidates" | "poster" | "playback"
> {
  const selected = _getEligibleSourcesFromSources(options, "selected-view");
  const thumb = _getEligibleSourcesFromSources(options, "thumbnail")[0] ?? null;
  const candidates =
    options.kind === "photo" ? _getDisplayCandidatesFromSources(selected) : [];
  const display =
    options.kind === "photo"
      ? _getDisplayFromCandidates(candidates, thumb)
      : null;
  return {
    thumb,
    display,
    displayCandidates:
      candidates.length === 0 && display !== null ? [display] : candidates,
    poster:
      options.kind === "video"
        ? (selected.find((source) => {
            return source.purpose === "poster";
          }) ?? thumb)
        : null,
    playback:
      options.kind === "video"
        ? (selected.find((source) => {
            return source.contentType.startsWith("video/");
          }) ?? null)
        : null,
  };
}

/** Maps only economical signed sources to explicit roles, retaining catalog layout. */
export function makeMediaRefFromSources(
  options: Readonly<MediaRefOptions>,
): MediaRef {
  const roles = _getRepresentationRolesFromSources(options);
  const hasPreview =
    roles.thumb !== null || roles.display !== null || roles.poster !== null;
  return {
    ...roles,
    width: options.width,
    height: options.height,
    previewState: hasPreview ? "ready" : options.previewState,
    durationMs: options.durationMs,
    altText: options.altText,
  };
}
