import type { ReactNode } from "react";
import { TopBar } from "@/system/Chrome/TopBar";
import classes from "@/system/system.module.css";
import { useWayBack } from "@/surfaces/Item/ItemViewer/useWayBack";

/**
 * While the item is on its way.
 *
 * Quiet on purpose: the design spec draws no loading state and asks whoever
 * builds the surface to own one, and on one origin talking to one SQLite file
 * this lasts a few frames. The empty viewer keeps the page's shape so nothing
 * jumps when the photograph arrives.
 */
export function ItemLoading(): ReactNode {
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
      <main className={classes.viewer} aria-busy="true">
        <h1 className="visually-hidden">Opening it</h1>
      </main>
    </>
  );
}
