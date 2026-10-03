import type { ReactNode } from "react";
import { Page } from "@/system/Chrome/Page";
import { Lede } from "@/system/typography/Lede";
import { Prose } from "@/system/typography/Prose";
import {
  NOT_HERE_HEADING,
  NOT_HERE_PROSE,
} from "@/surfaces/Item/itemCopy/itemCopy";
import { ItemTopBar } from "@/surfaces/Item/ItemViewer/ItemTopBar";

/**
 * An item the viewer cannot open, for whatever reason.
 *
 * One state for a deleted item, an item outside the viewer's visibility and
 * an address that was never an item's, in the same words, because the server
 * answers the first two with a byte-identical `404` and anything that told
 * them apart would be a way of finding out what exists.
 */
export function ItemNotHere(): ReactNode {
  return (
    <>
      <ItemTopBar capturedOn={undefined} />
      <Page>
        <Lede>{NOT_HERE_HEADING}</Lede>
        <Prose onPanel>{NOT_HERE_PROSE}</Prose>
      </Page>
    </>
  );
}
