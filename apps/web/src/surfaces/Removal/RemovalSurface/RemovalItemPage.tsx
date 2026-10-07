import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import type { Viewer } from "@/session/requireSignedIn/requireSignedIn";
import { RemovalActionDialogs } from "@/surfaces/RemovalRequests/RemovalActionDialogs/RemovalActionDialogs";
import { Page } from "@/system/Chrome/Page";
import { TopBar } from "@/system/Chrome/TopBar";
import { Lede } from "@/system/typography/Lede";
import type { ReactNode } from "react";
import { RemovalPageBody } from "./RemovalPageBody";
import { useRemovalPageState } from "./useRemovalPageState/useRemovalPageState";
type Props = { itemId: string; viewer: Viewer; timezone: string };

/** Reads scoped authority before rendering any request controls. */
export function RemovalItemPage({
  itemId,
  viewer,
  timezone,
}: Readonly<Props>): ReactNode {
  const { isValidAddress, history, notice, confirmed, actions, ask } =
    useRemovalPageState({ itemId, viewer });
  const isUnavailable =
    !isValidAddress ||
    (history.error instanceof ApiRequestError &&
      [403, 404].includes(history.error.status));
  const hasItem = history.data !== undefined && !isUnavailable;
  return (
    <>
      <TopBar
        back={
          hasItem
            ? {
                label: "Back to the photo",
                to: "/items/$itemId",
                params: { itemId },
              }
            : { label: "Back to the timeline", to: "/" }
        }
      />
      <Page>
        <div tabIndex={-1} data-removal-page-focus>
          <Lede>
            {isUnavailable
              ? "This one is not here."
              : "Ask for this one to come down."}
          </Lede>
        </div>
        <RemovalPageBody
          viewer={viewer}
          timezone={timezone}
          page={{ isValidAddress, history, notice, confirmed, actions, ask }}
          isUnavailable={isUnavailable}
        />
      </Page>
      <RemovalActionDialogs actions={actions} viewer={viewer} />
    </>
  );
}

/** Local confirmation travels only with this navigation entry. */
declare module "@tanstack/react-router" {
  interface HistoryState {
    removalDeleted?: boolean;
  }
}
