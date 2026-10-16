import { MediaLoadingContext } from "@/media/MediaLoadingContext";
import { QueryClientContext } from "@tanstack/react-query";
import {
  useContext,
  useEffect,
  useMemo,
  useState,
  type RefObject,
} from "react";
import type { TimelineRenderRow } from "../timelineWindow.types";
type TimelineFocusOptions = {
  rows: readonly TimelineRenderRow[];
  viewKey: string;
  retirement: number;
  element?: RefObject<HTMLElement | null>;
};

type FocusRetirementOptions = {
  setFocus: React.Dispatch<
    React.SetStateAction<FocusedTimelineItem | undefined>
  >;
  focus?: { itemId: string };
  client: React.ContextType<typeof QueryClientContext>;
  resources: React.ContextType<typeof MediaLoadingContext>;
  element?: RefObject<HTMLElement | null>;
  viewKey: string;
  retirement: number;
};

type FocusedTimelineItem = {
  itemId: string;
  row: TimelineRenderRow;
  viewKey: string;
  retirement: number;
};

type TimelineFocus = {
  focusedItemId?: string;
  rows: readonly TimelineRenderRow[];
  onFocus: (itemId: string | undefined) => void;
  onBlur: () => void;
};

function _sliceRow({
  row,
  start,
  end,
}: {
  row: TimelineRenderRow;
  start: number;
  end: number;
}): TimelineRenderRow[] {
  if (start >= end) {
    return [];
  }
  const itemIds = row.itemIds.slice(start, end);
  return [
    {
      ...row,
      itemIds,
      key: `${row.day.capturedOn}:${row.burstId ?? ""}:${itemIds[0]}`,
      isLast: row.isLast && end === row.itemIds.length,
      ...(row.frames
        ? {
            frames: row.frames.slice(start, end),
            frameOffset: (row.frameOffset ?? 0) + start,
          }
        : {
            items: row.items.slice(start, end),
            seedBase: row.seedBase + start,
          }),
    },
  ];
}

/**
 * Leaves one keyed row parent intact across responsive regrouping and paging
 * eviction.
 */
function _getRowsWithFocus({
  rows,
  pinned,
}: {
  rows: readonly TimelineRenderRow[];
  pinned: TimelineRenderRow;
}): TimelineRenderRow[] {
  const ids = new Set(pinned.itemIds);
  let inserted = false;
  const result = rows.flatMap((row) => {
    if (
      !row.itemIds.some((id) => {
        return ids.has(id);
      })
    ) {
      return [row];
    }
    const first = row.itemIds.findIndex((id) => {
      return ids.has(id);
    });
    const last = row.itemIds.findLastIndex((id) => {
      return ids.has(id);
    });
    const before = _sliceRow({ row, start: 0, end: first });
    const after = _sliceRow({ row, start: last + 1, end: row.itemIds.length });
    if (inserted) {
      return [...before, ...after];
    }
    inserted = true;
    return [...before, pinned, ...after];
  });
  if (!inserted) {
    const index = result.findIndex((row) => {
      return row.day.capturedOn <= pinned.day.capturedOn;
    });
    result.splice(index < 0 ? result.length : index, 0, pinned);
  }
  return result;
}

function useFocusRetirement(options: FocusRetirementOptions): void {
  const { setFocus, focus, client, resources, element, viewKey, retirement } =
    options;
  useEffect(() => {
    setFocus(undefined);
  }, [viewKey, retirement, setFocus]);
  useEffect(
    function retireFocusForQueryChanges() {
      return client?.getQueryCache().subscribe((event) => {
        if (JSON.stringify(event.query.queryKey) !== viewKey) {
          return;
        }
        const isDirectional =
          event.query.state.fetchMeta?.fetchMore !== undefined;
        if (
          event.type === "removed" ||
          (event.type === "updated" &&
            (event.action.type === "invalidate" ||
              (event.action.type === "success" &&
                (!isDirectional || event.action.manual))))
        ) {
          setFocus(undefined);
        }
      });
    },
    [client, viewKey, setFocus],
  );
  useEffect(
    function retireDeniedFocusedItem() {
      if (!element?.current || !focus) {
        return;
      }
      const observer = new MutationObserver(() => {
        if (resources?.leases.isDenied(focus.itemId)) {
          setFocus(undefined);
        }
      });
      observer.observe(element.current, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["src"],
      });
      return () => {
        return observer.disconnect();
      };
    },
    [element, focus, resources, setFocus],
  );
}

/**
 * Focus state contains one bounded row, retired by blur, view, or authoritative
 * refresh.
 */
export function useTimelineFocus({
  rows,
  viewKey,
  retirement,
  element,
}: Readonly<TimelineFocusOptions>): TimelineFocus {
  const [focus, setFocus] = useState<FocusedTimelineItem>();
  const client = useContext(QueryClientContext);
  const resources = useContext(MediaLoadingContext);
  useFocusRetirement({
    setFocus,
    focus,
    client,
    resources,
    element,
    viewKey,
    retirement,
  });
  const current =
    focus?.viewKey === viewKey && focus.retirement === retirement
      ? focus
      : undefined;
  const focusedRow = current?.row;
  const focusedRows = useMemo(() => {
    return focusedRow ? _getRowsWithFocus({ rows, pinned: focusedRow }) : rows;
  }, [rows, focusedRow]);
  return {
    focusedItemId: current?.itemId,
    rows: focusedRows,
    onFocus: (itemId: string | undefined) => {
      const row = rows.find((candidate) => {
        return itemId && candidate.itemIds.includes(itemId);
      });
      setFocus(
        row && itemId
          ? {
              itemId,
              row: { ...row, day: { ...row.day, items: [...row.items] } },
              viewKey,
              retirement,
            }
          : undefined,
      );
    },
    onBlur: () => {
      return setFocus(undefined);
    },
  };
}
