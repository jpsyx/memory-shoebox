import type {
  MediaReadPurpose,
  RenditionPurpose,
} from "@memory-shoebox/shared";

/** Catalog metadata used to choose a representation before signing it. */
export type RenditionRow = {
  renditionId: string;
  purpose: RenditionPurpose;
  storageKey: string;
  contentType: string;
  byteSize: number;
  width: number;
  height: number;
};

function _isImage(row: Readonly<RenditionRow>): boolean {
  return (
    [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/avif",
      "image/gif",
    ].includes(row.contentType) &&
    row.width > 0 &&
    row.height > 0 &&
    row.byteSize >= 0
  );
}

/** Browser-decodable stills within a purpose's oriented dimensions and byte budget. */
function _isEconomicalImage(
  row: Readonly<RenditionRow>,
  maxDimension: number,
  maxBytes: number,
): boolean {
  return (
    _isImage(row) &&
    Math.max(row.width, row.height) <= maxDimension &&
    row.byteSize <= maxBytes
  );
}

function _getThumbnailFromRows(
  rows: readonly RenditionRow[],
  kind: "photo" | "video",
): RenditionRow | undefined {
  const purposes: RenditionPurpose[] =
    kind === "photo"
      ? [
          "thumb",
          "display_small",
          "display_small_webp",
          "display",
          "display_webp",
          "original",
        ]
      : ["thumb", "poster"];
  return purposes
    .flatMap((purpose) => {
      return rows.filter((row) => {
        return row.purpose === purpose;
      });
    })
    .find((row) => {
      return row.purpose === "original"
        ? _isEconomicalImage(row, 480, 128 * 1024)
        : _isImage(row) &&
            (row.purpose === "thumb" || Math.max(row.width, row.height) <= 480);
    });
}

function _getDisplaysFromRows(rows: readonly RenditionRow[]): RenditionRow[] {
  const displays = rows.filter((row) => {
    const isSmall =
      row.purpose === "display_small" || row.purpose === "display_small_webp";
    const isDisplay =
      isSmall || row.purpose === "display" || row.purpose === "display_webp";
    return isDisplay && _isImage(row);
  });
  if (displays.length > 0) return displays;
  const original = rows.find((row) => {
    return (
      row.purpose === "original" &&
      _isEconomicalImage(row, 2048, 1.5 * 1024 * 1024)
    );
  });
  return original === undefined ? [] : [original];
}

function _getPlaybackFromRows(
  rows: readonly RenditionRow[],
  purpose: MediaReadPurpose,
): RenditionRow | undefined {
  return (
    rows.find((row) => {
      return row.purpose === "video_mp4" && row.contentType === "video/mp4";
    }) ??
    rows.find((row) => {
      return row.purpose === "video_webm" && row.contentType === "video/webm";
    }) ??
    (purpose === "selected-view"
      ? rows.find((row) => {
          return (
            row.purpose === "original" && row.contentType.startsWith("video/")
          );
        })
      : undefined)
  );
}

/**
 * Selects economical previews before signing. Only selected videos may use an
 * original playback fallback; thumbnail reads never sign unused displays.
 */
export function getRenditionsFromReadPurpose(options: {
  rows: readonly RenditionRow[];
  kind: "photo" | "video";
  purpose: MediaReadPurpose;
}): readonly RenditionRow[] {
  const thumbnail = _getThumbnailFromRows(options.rows, options.kind);
  const selected = new Set<RenditionRow>(
    thumbnail === undefined ? [] : [thumbnail],
  );
  if (options.purpose !== "thumbnail") {
    if (options.kind === "photo") {
      _getDisplaysFromRows(options.rows).forEach((row) => {
        return selected.add(row);
      });
    } else {
      const poster = options.rows.find((row) => {
        return row.purpose === "poster" && _isImage(row);
      });
      const playback = _getPlaybackFromRows(options.rows, options.purpose);
      if (poster !== undefined) selected.add(poster);
      if (playback !== undefined) selected.add(playback);
    }
  }
  return options.rows.filter((row) => {
    return selected.has(row);
  });
}
