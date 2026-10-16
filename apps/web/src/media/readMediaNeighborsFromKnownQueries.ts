import type {
  MediaNeighborsRequest,
  MediaNeighborsResponse,
  MediaPreview,
} from "@memory-shoebox/shared";
import type { QueryClient } from "@tanstack/react-query";
import type { MediaLoadingResources } from "./createMediaLoadingResources/createMediaLoadingResources";
import {
  getKnownMediaNeighborWindowFromQueries,
  type KnownMediaNeighbor,
} from "./getKnownMediaNeighborWindowFromQueries";

/** Query-local ordering provenance; reuse never renews metadata authority. */
export type KnownMediaNeighborsResponse = MediaNeighborsResponse & {
  metadataUpdatedAt: number;
};

type Options = {
  request: MediaNeighborsRequest;
  queryClient: QueryClient;
  resources: MediaLoadingResources;
};
function _hasFreshMedia(
  preview: MediaPreview | undefined,
): preview is MediaPreview {
  if (preview === undefined) {
    return false;
  }
  return [
    preview.media.thumb,
    preview.media.display,
    ...preview.media.displayCandidates,
    preview.media.poster,
  ].every((source) => {
    return (
      source === null || Date.parse(source.expiresAt) > Date.now() + 60_000
    );
  });
}
function _getSafePreview(preview: MediaPreview): MediaPreview {
  return { ...preview, media: { ...preview.media, playback: null } };
}
async function _getPreviewsFromKnownNodes({
  nodes,
  resources,
}: {
  nodes: KnownMediaNeighbor[];
  resources: MediaLoadingResources;
}): Promise<Map<string, MediaPreview>> {
  const previews = new Map<string, MediaPreview>();
  nodes.forEach((node) => {
    const stored = resources.previews.read(node.itemId);
    const preview = _hasFreshMedia(stored) ? stored : node.preview;
    if (_hasFreshMedia(preview)) {
      previews.set(node.itemId, _getSafePreview(preview));
    }
  });
  const missing = nodes
    .filter((node) => {
      return !previews.has(node.itemId);
    })
    .map((node) => {
      return node.itemId;
    });
  if (missing.length > 0) {
    const renewed = await resources.readPreviews({
      request: {
        itemIds: missing,
        purpose: "speculative-preview",
      },
    });
    renewed.forEach((preview) => {
      previews.set(preview.itemId, _getSafePreview(preview));
    });
  }
  return previews;
}
async function _readNeighbors(
  options: Readonly<Options>,
): Promise<KnownMediaNeighborsResponse> {
  const metadataUpdatedAt = Date.now();
  return {
    ...(await options.resources.readNeighbors(options.request)),
    metadataUpdatedAt,
  };
}

/**
 * Reuses provable identities; missing identity falls back to the safe server
 * probe.
 */
export async function readMediaNeighborsFromKnownQueries(
  options: Readonly<Options>,
): Promise<KnownMediaNeighborsResponse> {
  const { resources, request, queryClient } = options;
  const known = getKnownMediaNeighborWindowFromQueries({
    queryClient,
    request,
    memberId: resources.memberId,
  });
  if (known === undefined) {
    return _readNeighbors(options);
  }
  const epoch = resources.previews.captureEpoch();
  const nodes = [...known.ahead, ...known.behind];
  const previews = await _getPreviewsFromKnownNodes({ nodes, resources });
  if (
    nodes.some((node) => {
      return !previews.has(node.itemId);
    })
  ) {
    return _readNeighbors(options);
  }
  resources.previews.put({ previews: [...previews.values()], epoch: epoch });
  const getPreview = (node: KnownMediaNeighbor) => {
    return previews.get(node.itemId)!;
  };
  return {
    metadataUpdatedAt: known.metadataUpdatedAt,
    ahead: known.ahead.map(getPreview),
    behind: known.behind.map(getPreview),
  };
}
