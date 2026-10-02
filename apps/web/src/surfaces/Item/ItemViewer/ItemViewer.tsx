import type { ReactNode } from "react";
import type { ItemDetail } from "@memory-shoebox/shared";
import type { Viewer } from "@/session/requireSignedIn/requireSignedIn";
import { TopBar } from "@/system/Chrome/TopBar";
import { dayMonthLabel } from "@/system/labelHelpers/labelHelpers";
import classes from "@/system/system.module.css";
import { itemHeading } from "@/surfaces/Item/itemCopy/itemCopy";
import { ItemMediaColumn } from "@/surfaces/Item/ItemViewer/ItemMediaColumn";
import { useWayBack } from "@/surfaces/Item/ItemViewer/useWayBack";

type Props = {
  detail: ItemDetail;
  viewer: Viewer;
  timezone: string;
};

/**
 * Surfaces 3 and 4 once the item is in hand: `.viewer`, two columns, the
 * frame and its run on the left and the talk panel on the right, collapsing
 * to one column at 56rem (`design-spec.md` § Responsive behaviour).
 *
 * The heading is visually hidden: a sighted reader has the photograph, and a
 * screen reader needs somewhere to land that says what this page is.
 */
export function ItemViewer({
  detail,
  viewer,
  timezone,
}: Readonly<Props>): ReactNode {
  const wayBack = useWayBack(detail.capturedOn);
  return (
    <>
      <TopBar
        back={{
          label: `Back to ${dayMonthLabel(detail.capturedOn)}`,
          to: "/",
          search: { at: detail.capturedOn },
          onClick: wayBack.onBackClick,
        }}
      />
      <main className={classes.viewer}>
        <h1 className="visually-hidden">{itemHeading(detail)}</h1>
        <ItemMediaColumn detail={detail} viewer={viewer} timezone={timezone} />
      </main>
    </>
  );
}
