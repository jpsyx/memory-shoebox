import type { ReactNode } from "react";
import { TopBar } from "@/system/Chrome/TopBar";
import { dayMonthLabel } from "@/system/labelHelpers/labelHelpers";
import { useWayBack } from "@/surfaces/Item/ItemViewer/useWayBack";

type Props = {
  /** The day the item was taken, or undefined when there is no item. */
  capturedOn: string | undefined;
};

/**
 * The item page's bar, with its way back: to the day the item was taken, or
 * to the whole pile when there is no item to read a day off.
 */
export function ItemTopBar({ capturedOn }: Readonly<Props>): ReactNode {
  const wayBack = useWayBack(capturedOn);
  return (
    <TopBar
      back={{
        label:
          capturedOn === undefined
            ? "Back to the pile"
            : `Back to ${dayMonthLabel(capturedOn)}`,
        to: "/",
        search: wayBack.search,
        onClick: wayBack.onBackClick,
      }}
    />
  );
}
