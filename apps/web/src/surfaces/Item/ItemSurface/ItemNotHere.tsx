import type { ReactNode } from "react";
import { Page } from "@/system/Chrome/Page";
import { TopBar } from "@/system/Chrome/TopBar";
import { Lede } from "@/system/typography/Lede";
import { Prose } from "@/system/typography/Prose";
import {
  NOT_HERE_HEADING,
  NOT_HERE_PROSE,
} from "@/surfaces/Item/itemCopy/itemCopy";
import { useWayBack } from "@/surfaces/Item/ItemViewer/useWayBack";

/**
 * An item the viewer cannot open, for whatever reason.
 *
 * One state for a deleted item, an item outside the viewer's visibility and
 * an address that was never an item's, in the same words, because the server
 * answers the first two with a byte-identical `404` and anything that told
 * them apart would be a way of finding out what exists.
 */
export function ItemNotHere(): ReactNode {
  const wayBack = useWayBack(undefined);
  return (
    <>
      <TopBar
        back={{
          label: "Back to the pile",
          to: "/",
          search: wayBack.search,
          onClick: wayBack.onBackClick,
        }}
      />
      <Page>
        <Lede>{NOT_HERE_HEADING}</Lede>
        <Prose onPanel>{NOT_HERE_PROSE}</Prose>
      </Page>
    </>
  );
}
