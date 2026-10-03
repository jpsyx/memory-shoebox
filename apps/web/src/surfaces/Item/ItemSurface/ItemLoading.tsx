import type { ReactNode } from "react";
import classes from "@/system/system.module.css";
import { ItemTopBar } from "@/surfaces/Item/ItemViewer/ItemTopBar";

/**
 * While the item is on its way.
 *
 * Quiet on purpose: the design spec draws no loading state and asks whoever
 * builds the surface to own one, and on one origin talking to one SQLite file
 * this lasts a few frames. The empty viewer keeps the page's shape so nothing
 * jumps when the photograph arrives.
 */
export function ItemLoading(): ReactNode {
  return (
    <>
      <ItemTopBar capturedOn={undefined} />
      <main className={classes.viewer} aria-busy="true">
        <h1 className="visually-hidden">Opening it</h1>
      </main>
    </>
  );
}
