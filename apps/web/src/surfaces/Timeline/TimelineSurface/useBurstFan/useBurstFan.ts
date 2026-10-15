import { burstFramesQueryOptions } from "@/api/bursts/bursts";
import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import type {
  BurstFrameRef,
  BurstFramesResponse,
} from "@memory-shoebox/shared";
import type { QueryClient } from "@tanstack/react-query";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { createTimelineMemory } from "../../windowing/createTimelineMemory/createTimelineMemory";

type PendingFrameRead = Promise<readonly BurstFrameRef[] | undefined>;

type Options = {
  viewKey: string;
  memory: ReturnType<typeof createTimelineMemory>;
  retainedBurstIds: ReadonlySet<string>;
};

/** Retains browsing frames only while their page is retained; expansion is compact. */
export function useBurstFan(
  queryClient: QueryClient,
  options?: Options,
): {
  framesByBurstId: ReadonlyMap<string, readonly BurstFrameRef[]>;
  expanded: ReadonlyMap<
    string,
    import("../../windowing/timelineWindow.types").TimelineExpansion
  >;
  onOpenBurst: (burstId: string) => void;
  restoreBurst: (burstId: string) => PendingFrameRead;
  onCollapseBurst: (burstId: string) => void;
  onClearBursts: () => void;
} {
  const state = useBurstState(options);
  useBurstLifetime(queryClient, options, state);
  const actions = useBurstActions(queryClient, options, state);
  const { revision, framesByBurstId } = state;
  const expanded = useMemo(() => {
    void revision;
    return new Map(options?.memory.get(options.viewKey).expanded);
  }, [options?.memory, options?.viewKey, revision]);
  return { framesByBurstId, expanded, ...actions };
}

function useBurstState(options?: Options) {
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
type BurstState = ReturnType<typeof useBurstState>;

function useBurstLifetime(
  queryClient: QueryClient,
  options: Options | undefined,
  state: BurstState,
): void {
  const { generation, pending, owned, setFramesByBurstId } = state;
  useEffect(() => {
    const pendingRequests = pending.current;
    const ownedQueries = owned.current;
    return () => {
      generation.current += 1;
      pendingRequests.clear();
      ownedQueries.forEach((id) => {
        return _retireFrameQuery(queryClient, id);
      });
      ownedQueries.clear();
    };
  }, [options?.viewKey, queryClient, generation, pending, owned]);
  useRetainedFrames({
    queryClient,
    options,
    setFramesByBurstId,
    pending: pending.current,
    owned: owned.current,
  });
  useBurstUpdates(queryClient, setFramesByBurstId);
}

function useBurstActions(
  queryClient: QueryClient,
  options: Options | undefined,
  state: BurstState,
) {
  const { generation, pending, setRevision, setFramesByBurstId } = state;
  const restoreBurst = useOpenBurst(queryClient, state);
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
      _retireFrameQuery(queryClient, burstId);
      options?.memory.get(options.viewKey).expanded.delete(burstId);
      setRevision((value) => {
        return value + 1;
      });
    },
    onClearBursts: () => {
      generation.current += 1;
      pending.current.clear();
      state.owned.current.forEach((id) => {
        _retireFrameQuery(queryClient, id);
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

type FrameSetter = React.Dispatch<
  React.SetStateAction<Map<string, readonly BurstFrameRef[]>>
>;

function _retireFrameQuery(client: QueryClient, burstId: string): void {
  const key = burstFramesQueryOptions(burstId).queryKey;
  if (
    client
      .getQueryCache()
      .find({ queryKey: key, exact: true })
      ?.getObserversCount()
  ) {
    return;
  }
  void client.cancelQueries({ queryKey: key, exact: true });
  client.removeQueries({ queryKey: key, exact: true });
}

function useRetainedFrames(options: {
  queryClient: QueryClient;
  options?: Options;
  setFramesByBurstId: FrameSetter;
  pending: Map<string, PendingFrameRead>;
  owned: Set<string>;
}): void {
  const retainedKey = options.options
    ? [...options.options.retainedBurstIds].join(",") +
      ":" +
      [
        ...options.options.memory.get(options.options.viewKey).expanded.keys(),
      ].join(",") +
      ":" +
      [...options.pending.keys()].join(",")
    : undefined;
  const latest = useRef(options);
  latest.current = options;
  useEffect(() => {
    const current = latest.current;
    if (!current.options) {
      return;
    }
    const retained = new Set(
      [...current.options.retainedBurstIds].filter((id) => {
        return (
          current.pending.has(id) ||
          current.options!.memory.get(current.options!.viewKey).expanded.has(id)
        );
      }),
    );
    current.owned.forEach((id) => {
      if (retained.has(id)) {
        return;
      }
      current.pending.delete(id);
      _retireFrameQuery(current.queryClient, id);
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
  }, [retainedKey]);
}

function useBurstUpdates(
  queryClient: QueryClient,
  setFrames: FrameSetter,
): void {
  useEffect(() => {
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
  }, [queryClient, setFrames]);
}

function _openBurst(options: {
  burstId: string;
  queryClient: QueryClient;
  pending: RefObject<Map<string, PendingFrameRead>>;
  owned: RefObject<Set<string>>;
  latest: RefObject<Options | undefined>;
  generation: RefObject<number>;
  setRevision: React.Dispatch<React.SetStateAction<number>>;
  setFramesByBurstId: FrameSetter;
}): PendingFrameRead {
  const {
    burstId,
    queryClient,
    pending,
    owned,
    latest,
    generation,
    setRevision,
    setFramesByBurstId,
  } = options;
  const existing = pending.current.get(burstId);
  if (existing) {
    return existing;
  }
  const current = latest.current;
  if (current && !current.retainedBurstIds.has(burstId)) {
    return Promise.resolve(undefined);
  }
  const epoch = generation.current;

  owned.current.add(burstId);
  if (owned.current.size > 20) {
    const oldest = owned.current.values().next().value!;
    pending.current.delete(oldest);
    owned.current.delete(oldest);
    current?.memory.get(current.viewKey).expanded.delete(oldest);
    _retireFrameQuery(queryClient, oldest);
  }
  const request = queryClient
    .fetchQuery(burstFramesQueryOptions(burstId))
    .catch((error: unknown) => {
      if (error instanceof ApiRequestError && error.status === 404) {
        return { frames: [], nextCursor: null };
      }
      throw error;
    })
    .then((response) => {
      if (
        epoch !== generation.current ||
        pending.current.get(burstId) !== request ||
        latest.current?.viewKey !== current?.viewKey ||
        (latest.current && !latest.current.retainedBurstIds.has(burstId))
      ) {
        return;
      }
      current?.memory.expand(
        current.viewKey,
        burstId,
        current.memory.get(current.viewKey).expanded.get(burstId)?.height ?? 0,
      );
      setFramesByBurstId((previous) => {
        return new Map(previous).set(burstId, response.frames);
      });
      setRevision((value) => {
        return value + 1;
      });
      return response.frames;
    })
    .finally(() => {
      if (pending.current.get(burstId) === request) {
        pending.current.delete(burstId);
        setRevision((value) => {
          return value + 1;
        });
      }
    });
  pending.current.set(burstId, request);
  setRevision((value) => {
    return value + 1;
  });
  return request;
}

function useOpenBurst(
  queryClient: QueryClient,
  state: BurstState,
): (burstId: string) => PendingFrameRead {
  const {
    pending,
    owned,
    latest,
    generation,
    setRevision,
    setFramesByBurstId,
  } = state;
  const onOpenBurst = useCallback(
    (burstId: string) => {
      return _openBurst({
        burstId,
        queryClient,
        pending,
        owned,
        latest,
        generation,
        setRevision,
        setFramesByBurstId,
      });
    },
    [
      queryClient,
      pending,
      owned,
      latest,
      generation,
      setRevision,
      setFramesByBurstId,
    ],
  );
  return onOpenBurst;
}
