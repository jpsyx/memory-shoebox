import { Tabs } from "@mantine/core";
import type { ReactNode } from "react";
import type { Viewer } from "@/session/requireSignedIn/requireSignedIn";
import type { RemovalActions } from "../useRemovalActions/useRemovalActions";
import { RemovalQueueTab } from "./RemovalQueueTab";
import type { useRemovalQueue } from "./useRemovalQueue";
type Props = {
  timezone: string;
  queue: ReturnType<typeof useRemovalQueue>;
  viewer: Viewer;
  actions: RemovalActions;
};
/** Counts describe the full scoped queue, including unloaded cards. */
export function RemovalQueueTabs({
  queue,
  viewer,
  actions,
  timezone,
}: Readonly<Props>): ReactNode {
  return (
    <Tabs defaultValue="open" keepMounted={false}>
      <Tabs.List>
        <Tabs.Tab value="open" data-removal-focus-fallback>
          Waiting · {queue.counts?.openCount ?? "…"}
        </Tabs.Tab>
        <Tabs.Tab value="settled" data-removal-focus-fallback>
          Settled · {queue.counts?.settledCount ?? "…"}
        </Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="open" pt="md">
        <RemovalQueueTab
          timezone={timezone}
          query={queue.open}
          state="open"
          viewer={viewer}
          actions={actions}
        />
      </Tabs.Panel>
      <Tabs.Panel value="settled" pt="md">
        <RemovalQueueTab
          timezone={timezone}
          query={queue.settled}
          state="settled"
          viewer={viewer}
          actions={actions}
        />
      </Tabs.Panel>
    </Tabs>
  );
}
