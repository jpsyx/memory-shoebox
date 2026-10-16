import type {
  BurstFrameRef,
  BurstFramesResponse,
} from "@memory-shoebox/shared";
import type { QueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  BurstState,
  FrameSetter,
  Options,
  PendingFrameRead,
} from "./useBurstFan.types";
import { retireBurstFrameQuery } from "./retireBurstFrameQuery";
import { useOpenBurst } from "./useOpenBurst";
type RetainedFramesOptions = {
  queryClient: QueryClient;
  options?: Options;
  setFramesByBurstId: FrameSetter;
  pending: Map<string, PendingFrameRead>;
  owned: Set<string>;
};

type BurstActions = {
  onOpenBurst: (burstId: string) => void;
  restoreBurst: (burstId: string) => PendingFrameRead;
  onCollapseBurst: (burstId: string) => void;
  onClearBursts: () => void;
};

type BurstFan = BurstActions & {
  framesByBurstId: ReadonlyMap<string, readonly BurstFrameRef[]>;
  expanded: ReadonlyMap<
    string,
    import("../../windowing/timelineWindow.types").TimelineExpansion
  >;
};

function useBurstState(options?: Options): BurstState {
  const [framesByBurstId, setFramesByBurstId] = useState<
    Map<string, readonly BurstFrameRef[]>
  >(() => {
    return new Map();
  });
  const [revision, setRevision] = useState(0);
  const generation = useRef(0);
  const pending = useRef(new Map<string, PendingFrameRead>());
  const owned = useRef(new Set<string>());
  const latest = useRef(options);
  latest.current = options;
  return {
    framesByBurstId,
    setFramesByBurstId,
    revision,
    setRevision,
    generation,
    pending,
    owned,
    latest,
  };
}

function useBurstLifetime({
  queryClient,
  options,
  state,
}: {
  queryClient: QueryClient;
  options: Options | undefined;
  state: BurstState;
}): void {
  const { generation, pending, owned, setFramesByBurstId } = state;
  useEffect(
    function retireBurstQueries() {
      const pendingRequests = pending.current;
      const ownedQueries = owned.current;
      return () => {
        generation.current += 1;
        pendingRequests.clear();
        ownedQueries.forEach((id) => {
          return retireBurstFrameQuery({ client: queryClient, burstId: id });
        });
        ownedQueries.clear();
      };
    },
    [options?.viewKey, queryClient, generation, pending, owned],
  );
  useRetainedFrames({
    queryClient,
    options,
    setFramesByBurstId,
    pending: pending.current,
    owned: owned.current,
  });
  useBurstUpdates({ queryClient, setFrames: setFramesByBurstId });
}

function useBurstActions({
  queryClient,
  options,
  state,
}: {
  queryClient: QueryClient;
  options: Options | undefined;
  state: BurstState;
}): BurstActions {
  const { generation, pending, setRevision, setFramesByBurstId } = state;
  const restoreBurst = useOpenBurst({ queryClient, state });
  const onOpenBurst = useCallback(
    (burstId: string) => {
      void restoreBurst(burstId).catch(() => {});
    },
    [restoreBurst],
  );
  return {
    onOpenBurst,
    restoreBurst,
    onCollapseBurst: (burstId: string) => {
      pending.current.delete(burstId);
      state.owned.current.delete(burstId);
      retireBurstFrameQuery({ client: queryClient, burstId });
      options?.memory.get(options.viewKey).expanded.delete(burstId);
      setRevision((value) => {
        return value + 1;
      });
    },
    onClearBursts: () => {
      generation.current += 1;
      pending.current.clear();
      state.owned.current.forEach((id) => {
        retireBurstFrameQuery({ client: queryClient, burstId: id });
      });
      state.owned.current.clear();
      options?.memory.get(options.viewKey).expanded.clear();
      setFramesByBurstId(new Map());
      setRevision((value) => {
        return value + 1;
      });
    },
  };
}

function useRetainedFrames(options: RetainedFramesOptions): void {
  const retainedKey = options.options
    ? `${[...options.options.retainedBurstIds].join(",")}:${[
        ...options.options.memory.get(options.options.viewKey).expanded.keys(),
      ].join(",")}:${[...options.pending.keys()].join(",")}`
    : undefined;
  const latest = useRef(options);
  latest.current = options;
  useEffect(
    function retireUnretainedFrames() {
      const current = latest.current;
      if (!current.options) {
        return;
      }
      const retained = new Set(
        [...current.options.retainedBurstIds].filter((id) => {
          return (
            current.pending.has(id) ||
            current
              .options!.memory.get(current.options!.viewKey)
              .expanded.has(id)
          );
        }),
      );
      current.owned.forEach((id) => {
        if (retained.has(id)) {
          return;
        }
        current.pending.delete(id);
        retireBurstFrameQuery({ client: current.queryClient, burstId: id });
        current.owned.delete(id);
      });
      current.setFramesByBurstId((previous) => {
        return [...previous.keys()].every((id) => {
          return retained.has(id);
        })
          ? previous
          : new Map(
              [...previous].filter(([id]) => {
                return retained.has(id);
              }),
            );
      });
    },
    [retainedKey],
  );
}

function useBurstUpdates({
  queryClient,
  setFrames,
}: {
  queryClient: QueryClient;
  setFrames: FrameSetter;
}): void {
  useEffect(
    function synchronizeBurstFrames() {
      return queryClient.getQueryCache().subscribe((event) => {
        const [category, burstId, kind] = event.query.queryKey;
        if (
          event.type !== "updated" ||
          event.action.type !== "success" ||
          event.query.queryKey.length !== 3 ||
          category !== "bursts" ||
          kind !== "frames" ||
          typeof burstId !== "string"
        ) {
          return;
        }
        const response = queryClient.getQueryData<BurstFramesResponse>(
          event.query.queryKey,
        );
        if (response) {
          setFrames((previous) => {
            return previous.has(burstId)
              ? new Map(previous).set(burstId, response.frames)
              : previous;
          });
        }
      });
    },
    [queryClient, setFrames],
  );
}

/**
 * Retains browsing frames only while their page is retained; expansion is
 * compact.
 */
export function useBurstFan({
  queryClient,
  options,
}: Readonly<{
  queryClient: QueryClient;
  options?: Readonly<Options>;
}>): BurstFan {
  const state = useBurstState(options);
  useBurstLifetime({ queryClient, options, state });
  const actions = useBurstActions({ queryClient, options, state });
  const { revision, framesByBurstId } = state;
  const expanded = useMemo(() => {
    void revision;
    return new Map(options?.memory.get(options.viewKey).expanded);
  }, [options?.memory, options?.viewKey, revision]);
  return { framesByBurstId, expanded, ...actions };
}
