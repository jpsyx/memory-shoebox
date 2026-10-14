import type {
  MediaNeighborsResponse,
  MediaPreview,
  MediaSource,
} from "@memory-shoebox/shared";
import { appConfig } from "../../../../app.config";
import type {
  PrefetchCandidate,
  PrefetchEnvironment,
} from "./mediaPrefetch.types";

/** Converts direction-ordered neighbors using the viewer's source selector. */
export function getPrefetchCandidatesFromNeighbors(
  options: Readonly<{
    neighbors: Readonly<MediaNeighborsResponse>;
    selectPhotoSource: (
      preview: Readonly<MediaPreview>,
    ) => MediaSource | undefined;
  }>,
): PrefetchCandidate[] {
  const neighbors = [
    ...options.neighbors.ahead.slice(0, 2).map((preview, rank) => {
      return { preview, rank };
    }),
    ...options.neighbors.behind.slice(0, 1).map((preview) => {
      return { preview, rank: 2 };
    }),
  ];
  return neighbors.flatMap(({ preview, rank }) => {
    const source =
      preview.kind === "photo"
        ? options.selectPhotoSource(preview)
        : (preview.media.poster ?? preview.media.thumb ?? undefined);
    return source === undefined
      ? []
      : [
          {
            itemId: preview.itemId,
            source,
            kind:
              preview.kind === "photo"
                ? ("photo" as const)
                : ("poster" as const),
            rank,
            decode: preview.kind === "photo" && rank === 0,
          },
        ];
  });
}

/** Estimates owned work from the actual rendition, never the original item. */
export function getPrefetchCostsFromCandidate(
  candidate: Readonly<PrefetchCandidate>,
): {
  encodedBytes: number;
  decodedBytes: number;
} {
  return {
    encodedBytes: candidate.source.byteSize,
    decodedBytes: candidate.decode
      ? candidate.source.width * candidate.source.height * 4
      : 0,
  };
}

function _isAllowedCandidate(options: {
  candidate: Readonly<PrefetchCandidate>;
  environment: Readonly<PrefetchEnvironment>;
  now: number;
}): boolean {
  const { candidate, environment, now } = options;
  const { source } = candidate;
  return (
    candidate.kind !== "video-metadata" &&
    source.contentType.startsWith("image/") &&
    source.byteSize > 0 &&
    source.byteSize <= appConfig.media.prefetch.maxEncodedBytes &&
    Number.isFinite(source.width * source.height) &&
    source.width > 0 &&
    source.height > 0 &&
    Date.parse(source.expiresAt) > now &&
    (environment.effectiveType !== "3g" ||
      candidate.kind === "poster" ||
      candidate.rank === 0)
  );
}

/** Guards all callers, including unknown browsers and older source metadata. */
export function getAllowedPrefetchCandidatesFromEnvironment(
  options: Readonly<{
    candidates: readonly PrefetchCandidate[];
    environment: Readonly<PrefetchEnvironment>;
    now: number;
  }>,
): PrefetchCandidate[] {
  const { environment, now } = options;
  if (
    !environment.visible ||
    environment.saveData ||
    ["slow-2g", "2g"].includes(environment.effectiveType)
  ) {
    return [];
  }
  const identities = new Set<string>();
  return [...options.candidates]
    .sort((left, right) => {
      return left.rank - right.rank;
    })
    .filter((candidate) => {
      const id = candidate.source.renditionId;
      const isAllowed =
        !identities.has(id) &&
        _isAllowedCandidate({ candidate, environment, now });
      identities.add(id);
      return isAllowed;
    })
    .slice(0, 3)
    .map((candidate) => {
      return {
        ...candidate,
        decode:
          candidate.decode &&
          candidate.kind === "photo" &&
          candidate.rank === 0 &&
          candidate.source.width * candidate.source.height * 4 <=
            appConfig.media.prefetch.maxDecodedBytes,
      };
    });
}

/** Missing Network Information support uses the conservative default policy. */
export function getPrefetchEnvironmentFromBrowser(
  options: Readonly<{
    memberId: string;
    selectionKey: string;
  }>,
): PrefetchEnvironment {
  const connection = (
    navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }
  ).connection;
  const effectiveType = connection?.effectiveType;
  return {
    ...options,
    visible: document.visibilityState === "visible",
    saveData: connection?.saveData === true,
    effectiveType:
      effectiveType === "slow-2g" ||
      effectiveType === "2g" ||
      effectiveType === "3g" ||
      effectiveType === "4g"
        ? effectiveType
        : "unknown",
  };
}
