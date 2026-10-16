import { clsx } from "clsx";
import type { MediaPreview } from "@memory-shoebox/shared";
import { SelectedMediaPreview } from "@/media/SelectedMediaPreview";
import type { ReactNode } from "react";
import classes from "./ItemLoading.module.css";
import { ItemTopBar } from "@/surfaces/Item/ItemViewer/ItemTopBar";

type Props = { preview?: MediaPreview };

/**
 * While the item is on its way.
 *
 * Quiet on purpose: the design spec draws no loading state and asks whoever
 * builds the surface to own one, and on one origin talking to one SQLite file
 * this lasts a few frames. The empty viewer keeps the page's shape so nothing
 * jumps when the photograph arrives.
 */
export function ItemLoading({ preview }: Readonly<Props>): ReactNode {
  return (
    <>
      <ItemTopBar capturedOn={undefined} />
      <main
        className={clsx({
          [classes.itemLoading ?? ""]: preview === undefined,
          [classes.itemLoadingPage ?? ""]: preview !== undefined,
        })}
        aria-busy="true"
      >
        <h1 className="visually-hidden">Opening it</h1>
        {preview === undefined ? null : (
          <div className={classes.itemLoadingSurface}>
            <div className={classes.itemLoadingGrid}>
              <div className={classes.itemLoadingMediaColumn}>
                <SelectedMediaPreview preview={preview} />
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
