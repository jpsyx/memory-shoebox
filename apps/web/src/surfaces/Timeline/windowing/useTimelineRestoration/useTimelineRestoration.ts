import type { Virtualizer } from "@tanstack/react-virtual";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type RefObject,
} from "react";
import { getAnchorNodeFromTimelineWindow } from "../timelineGeometryHelpers/timelineGeometryHelpers";
import type {
  TimelineAnchor,
  TimelineWindowOptions,
} from "../timelineWindow.types";
type AnchorPreparationOptions = {
  anchor: TimelineAnchor;
  committed: RefObject<Options>;
  waitForCommit: WaitForCommit;
  signal: AbortSignal;
};

type Options = Readonly<TimelineWindowOptions>;
type WindowVirtualizer = Virtualizer<Window, HTMLElement>;
type WaitForCommit = (
  predicate: (options: Options) => boolean,
  signal: AbortSignal,
) => Promise<void>;

function useCommittedRows(options: Options): {
  committed: RefObject<Options>;
  waitForCommit: WaitForCommit;
} {
  const committed = useRef(options);
  const waiting = useRef(new Set<() => void>());
  useLayoutEffect(function publishCommittedTimelineRows() {
    committed.current = options;
    waiting.current.forEach((check) => {
      check();
    });
  });
  const waitForCommit = useCallback<WaitForCommit>((predicate, signal) => {
    return new Promise<void>((fulfill, reject) => {
      const finish = () => {
        waiting.current.delete(check);
        signal.removeEventListener("abort", check);
        if (signal.aborted) {
          reject(signal.reason);
        } else {
          fulfill();
        }
      };
      const check = () => {
        if (signal.aborted || predicate(committed.current)) {
          finish();
        }
      };
      waiting.current.add(check);
      signal.addEventListener("abort", check, { once: true });
      check();
    });
  }, []);
  return { committed, waitForCommit };
}

async function _prepareAnchor(
  options: AnchorPreparationOptions,
): Promise<void> {
  const { anchor, committed, signal, waitForCommit } = options;
  if (
    !committed.current.rows.some((row) => {
      return row.day.capturedOn === anchor.capturedOn;
    })
  ) {
    await committed.current.recoverPage?.(anchor);
    await new Promise<void>((done) => {
      requestAnimationFrame(() => {
        done();
      });
    });
  }
  signal.throwIfAborted();
  const burstId = anchor.burstId;
  if (
    !burstId ||
    committed.current.rows.some((row) => {
      return row.itemIds.includes(anchor.itemId ?? "");
    })
  ) {
    return;
  }
  const frames = await committed.current.restoreBurst?.(burstId);
  signal.throwIfAborted();
  if (frames === undefined) {
    return;
  }
  await _waitForBurstRows({ burstId, waitForCommit, signal });
}

function _waitForBurstRows({
  burstId,
  waitForCommit,
  signal,
}: {
  burstId: string;
  waitForCommit: WaitForCommit;
  signal: AbortSignal;
}): Promise<void> {
  return waitForCommit((current) => {
    const hasBurst = current.rows.some((row) => {
      return row.items.some((item) => {
        return item.burst?.burstId === burstId;
      });
    });
    return (
      !hasBurst ||
      current.rows.some((row) => {
        return (
          row.burstId === burstId &&
          row.isFanHeader === true &&
          row.reservedHeight === undefined
        );
      })
    );
  }, signal);
}

type RestoreOptions = {
  anchor: TimelineAnchor;
  committed: RefObject<Options>;
  waitForCommit: WaitForCommit;
  signal: AbortSignal;
  virtualizer: WindowVirtualizer;
  correctOffset: (virtualizer: WindowVirtualizer, offset: number) => void;
};

async function _restoreCommittedAnchor(options: RestoreOptions): Promise<void> {
  const { anchor, committed, waitForCommit, signal, virtualizer } = options;
  const index = committed.current.rows.findIndex((row) => {
    return anchor.itemId
      ? row.itemIds.includes(anchor.itemId)
      : row.day.capturedOn === anchor.capturedOn;
  });
  if (index < 0) {
    const surviving = committed.current.rows.findIndex((row) => {
      return row.day.capturedOn === anchor.capturedOn;
    });
    virtualizer.scrollToIndex(Math.max(0, surviving), { align: "start" });
    return;
  }
  virtualizer.scrollToIndex(index, { align: "start", behavior: "auto" });
  await waitForCommit((current) => {
    return (
      getAnchorNodeFromTimelineWindow({ current, itemId: anchor.itemId }) !==
        undefined ||
      !current.rows.some((row) => {
        return row.itemIds.includes(anchor.itemId ?? "");
      })
    );
  }, signal);
  signal.throwIfAborted();
  _correctAnchorOffset(options);
}

function _correctAnchorOffset({
  anchor,
  committed,
  virtualizer,
  correctOffset,
}: RestoreOptions): void {
  const node = getAnchorNodeFromTimelineWindow({
    current: committed.current,
    itemId: anchor.itemId,
  });
  if (node) {
    correctOffset(
      virtualizer,
      window.scrollY + node.getBoundingClientRect().top - anchor.offsetPx,
    );
  }
}

async function _restoreOwnedAnchor({
  options,
  operation,
}: {
  options: Omit<RestoreOptions, "signal">;
  operation: RefObject<AbortController | undefined>;
}): Promise<void> {
  operation.current?.abort();
  const controller = new AbortController();
  operation.current = controller;
  try {
    await (async (restoreOptions: RestoreOptions) => {
      await _prepareAnchor(restoreOptions);
      restoreOptions.signal.throwIfAborted();
      await _restoreCommittedAnchor(restoreOptions);
    })({ ...options, signal: controller.signal });
  } catch (error) {
    if (!controller.signal.aborted) {
      throw error;
    }
  } finally {
    if (operation.current === controller) {
      operation.current = undefined;
    }
  }
}

/**
 * Restores one explicit saved position after its owned metadata and DOM commit
 * are ready.
 */
export function useTimelineRestoration({
  options,
  virtualizer,
  correctOffset,
}: Readonly<{
  options: Options;
  virtualizer: WindowVirtualizer;
  correctOffset: (virtualizer: WindowVirtualizer, offset: number) => void;
}>): (anchor: TimelineAnchor) => Promise<void> {
  const { committed, waitForCommit } = useCommittedRows(options);
  const operation = useRef<AbortController | undefined>(undefined);
  useEffect(
    function retireSavedPositionRestoration() {
      return () => {
        operation.current?.abort();
        operation.current = undefined;
      };
    },
    [options.viewKey],
  );
  return useCallback(
    (anchor: TimelineAnchor) => {
      return _restoreOwnedAnchor({
        options: {
          anchor,
          committed,
          waitForCommit,
          virtualizer,
          correctOffset,
        },
        operation,
      });
    },
    [committed, waitForCommit, virtualizer, correctOffset],
  );
}
