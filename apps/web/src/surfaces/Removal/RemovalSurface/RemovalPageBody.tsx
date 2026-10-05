import { RemovalActionFeedback } from "@/surfaces/RemovalRequests/RemovalActionFeedback";
import { Stack } from "@mantine/core";
import type { ReactNode } from "react";
import type { Viewer } from "@/session/requireSignedIn/requireSignedIn";
import { Prose } from "@/system/typography/Prose";
import { RemovalReadFailure } from "./RemovalReadFailure";
import { RemovalContents } from "./RemovalContents";
import type { useRemovalPageState } from "./useRemovalPageState";
type Props = {
  viewer: Viewer;
  timezone: string;
  page: ReturnType<typeof useRemovalPageState>;
  isUnavailable: boolean;
};
/** Loading, retry and confirmed history share the same request surface. */
export function RemovalPageBody({
  viewer,
  timezone,
  page,
  isUnavailable,
}: Readonly<Props>): ReactNode {
  const { history, confirmed, actions, ask, notice } = page;
  return (
    <Stack gap="lg">
      {actions.dialog === undefined ? (
        <RemovalActionFeedback
          actions={actions}
          pendingLabel="Updating your request…"
          onPanel
        />
      ) : null}
      {isUnavailable ? (
        <Prose onPanel>This photograph is unavailable.</Prose>
      ) : history.data !== undefined ? (
        <RemovalContents
          response={history.data}
          confirmed={confirmed}
          viewer={viewer}
          timezone={timezone}
          actions={actions}
          ask={ask}
          notice={notice}
          isRefreshing={history.isFetching || history.isError}
        />
      ) : history.isPending ? (
        <Prose onPanel role="status">
          Loading this request…
        </Prose>
      ) : null}
      {history.isError && page.isValidAddress ? (
        <RemovalReadFailure
          onRetry={() => {
            void history.refetch();
          }}
        />
      ) : null}
    </Stack>
  );
}
