import { APP_CONFIG } from "../../../../../app.config";
import type { MediaLoadingResources } from "../createMediaLoadingResources/createMediaLoadingResources";
import { getSelectedSourceFromPreview } from "../getSelectedSourceFromPreview";
import { getPrefetchEnvironmentFromBrowser } from "../mediaPrefetchPolicyHelpers/mediaPrefetchPolicyHelpers";

type IntentResources = Pick<
  MediaLoadingResources,
  "memberId" | "previews" | "readPreviews" | "scheduler" | "navigation"
>;

async function _warm(
  resources: IntentResources,
  itemId: string,
  isCurrent: () => boolean,
): Promise<void> {
  const cached = resources.previews.read(itemId);
  const epoch = resources.previews.captureEpoch();
  const hasFreshDisplay =
    cached &&
    [
      ...cached.media.displayCandidates,
      cached.media.display,
      cached.media.poster,
    ].some((source) => {
      return (
        source !== null &&
        source.purpose !== "thumb" &&
        Date.parse(source.expiresAt) > Date.now() + 60_000
      );
    });
  const preview = hasFreshDisplay
    ? cached
    : (
        await resources.readPreviews({
          request: { itemIds: [itemId], purpose: "speculative-preview" },
        })
      )[0];
  if (!isCurrent() || epoch !== resources.previews.captureEpoch()) {
    return;
  }
  const selected = getSelectedSourceFromPreview({
    preview,
    viewport: resources.navigation.viewport,
  });
  if (!selected || !preview) {
    return;
  }
  resources.scheduler.schedule({
    candidates: [
      {
        itemId,
        source: selected,
        kind: preview.kind === "photo" ? "photo" : "poster",
        rank: 0,
        decode: preview.kind === "photo",
      },
    ],
    environment: getPrefetchEnvironmentFromBrowser({
      memberId: resources.memberId,
      selectionKey: `intent:${itemId}`,
    }),
    dwellMs: 0,
  });
}

/** One current intent per member, with cleanup tied to the initiating hover. */
export function createMediaIntent(resources: IntentResources): {
  enter: (itemId: string, immediate?: boolean) => () => void;
  clear: () => void;
} {
  let current:
    | { itemId: string; timer?: ReturnType<typeof setTimeout> }
    | undefined;
  const clear = () => {
    clearTimeout(current?.timer);
    current = undefined;
  };
  return {
    clear,
    enter: (itemId, immediate = false) => {
      if (current?.itemId !== itemId) {
        clear();
      }
      const owner = current ?? { itemId };
      const start = () => {
        owner.timer = undefined;
        void _warm(resources, itemId, () => {
          return current === owner;
        }).catch(() => {});
      };
      if (current === undefined || (immediate && owner.timer !== undefined)) {
        current = owner;
        clearTimeout(owner.timer);
        owner.timer = setTimeout(
          start,
          immediate ? 0 : APP_CONFIG.media.prefetch.intentDwellMs,
        );
      }
      return () => {
        if (current === owner) {
          clear();
          resources.scheduler.clear();
        }
      };
    },
  };
}
