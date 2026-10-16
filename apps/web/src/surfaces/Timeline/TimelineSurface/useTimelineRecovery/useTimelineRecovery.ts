import type { TimelineView } from "@/api/timelineHelpers/timelineSelectionHelpers/timelineSelectionHelpers";
import { readTimelinePageFromCursor } from "@/api/timelineHelpers/timelineHelpers";
import { MediaLoadingContext } from "@/media/MediaLoadingContext";
import type { MediaLoadingResources } from "@/media/createMediaLoadingResources/createMediaLoadingResources";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { TimelineAnchor } from "../../windowing/timelineWindow.types";

type Options = { view: TimelineView; queryKey: string[] };
type Recovery = {
  key: string;
  client: QueryClient;
  resources: MediaLoadingResources | undefined;
  latest: RefObject<Readonly<Options>>;
  operation: RefObject<AbortController | undefined>;
  setRecoveringKey: (key: string | undefined) => void;
};

async function _recoverPage({
  recovery,
  anchor,
}: {
  recovery: Recovery;
  anchor: TimelineAnchor;
}): Promise<void> {
  const { operation, setRecoveringKey, key, client } = recovery;
  operation.current?.abort();
  const controller = new AbortController();
  operation.current = controller;
  setRecoveringKey(key);
  const current = recovery.latest.current;
  const authority = recovery.resources?.previews.captureEpoch();
  let unsubscribe = () => {};
  try {
    await client.cancelQueries({ queryKey: current.queryKey, exact: true });
    controller.signal.throwIfAborted();
    unsubscribe = _watchRecoveryQuery({ client, key, controller });
    const page = await readTimelinePageFromCursor({
      view: current.view,
      cursor: anchor.pageCursor,
      signal: controller.signal,
      client,
      queryKey: current.queryKey,
    });
    controller.signal.throwIfAborted();
    if (
      JSON.stringify(recovery.latest.current.queryKey) !== key ||
      recovery.resources?.previews.captureEpoch() !== authority
    ) {
      return;
    }
    unsubscribe();
    client.setQueryData(current.queryKey, {
      pages: [page],
      pageParams: [
        page.requestCursorKnown || page.requestCursor !== undefined
          ? page.requestCursor
          : anchor.pageCursor,
      ],
    });
  } catch (error) {
    if (!controller.signal.aborted) {
      throw error;
    }
  } finally {
    unsubscribe();
    if (operation.current === controller) {
      operation.current = undefined;
      setRecoveringKey(undefined);
    }
  }
}

/**
 * Exact-query recovery preserves old pages until a guarded atomic replacement
 * succeeds.
 */
export function useTimelineRecovery(options: Readonly<Options>): {
  recoverPage: (anchor: TimelineAnchor) => Promise<void>;
  isRecovering: boolean;
  isPending: () => boolean;
} {
  const client = useQueryClient();
  const resources = useContext(MediaLoadingContext);
  const operation = useRef<AbortController | undefined>(undefined);
  const [recoveringKey, setRecoveringKey] = useState<string>();
  const key = JSON.stringify(options.queryKey);
  const latest = useRef(options);
  latest.current = options;
  useEffect(
    function cancelRetiredTimelineRecovery() {
      return () => {
        operation.current?.abort();
        operation.current = undefined;
      };
    },
    [key],
  );
  const recoverPage = useCallback(
    (anchor: TimelineAnchor) => {
      return _recoverPage({
        recovery: {
          key,
          client,
          resources,
          latest,
          operation,
          setRecoveringKey,
        },
        anchor,
      });
    },
    [key, client, resources],
  );
  return {
    recoverPage,
    isRecovering: recoveringKey === key,
    isPending: () => {
      return operation.current !== undefined;
    },
  };
}

function _watchRecoveryQuery({
  client,
  key,
  controller,
}: {
  client: QueryClient;
  key: string;
  controller: AbortController;
}): () => void {
  return client.getQueryCache().subscribe((event) => {
    if (
      JSON.stringify(event.query.queryKey) === key &&
      (event.type === "added" ||
        event.type === "removed" ||
        (event.type === "updated" &&
          ["invalidate", "fetch", "success", "setState"].includes(
            event.action.type,
          )))
    ) {
      controller.abort();
    }
  });
}
