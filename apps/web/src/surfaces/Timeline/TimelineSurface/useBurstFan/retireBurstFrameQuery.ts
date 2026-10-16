import { burstFramesQueryOptions } from "@/api/burstQueryHelpers/burstQueryHelpers";
import type { QueryClient } from "@tanstack/react-query";

/** Cancels and evicts a frame query only after its last observer leaves. */
export function retireBurstFrameQuery({
  client,
  burstId,
}: Readonly<{
  client: QueryClient;
  burstId: string;
}>): void {
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
