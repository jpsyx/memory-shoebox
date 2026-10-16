import { burstFramesQueryOptions } from "@/api/burstQueryHelpers/burstQueryHelpers";
import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import type { QueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { retireBurstFrameQuery } from "./retireBurstFrameQuery";
import type { BurstState, PendingFrameRead } from "./useBurstFan.types";

function _openBurst(
  options: Pick<
    BurstState,
    | "pending"
    | "owned"
    | "latest"
    | "generation"
    | "setRevision"
    | "setFramesByBurstId"
  > & { burstId: string; queryClient: QueryClient },
): PendingFrameRead {
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
    retireBurstFrameQuery({ client: queryClient, burstId: oldest });
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
      current?.memory.expand({
        viewKey: current.viewKey,
        burstId: burstId,
        height:
          current.memory.get(current.viewKey).expanded.get(burstId)?.height ??
          0,
      });
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

/** Reuses the owned burst read while rejecting results from retired views. */
export function useOpenBurst({
  queryClient,
  state,
}: Readonly<{
  queryClient: QueryClient;
  state: BurstState;
}>): (burstId: string) => PendingFrameRead {
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
