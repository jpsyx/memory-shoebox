import type { MediaPreview } from "@memory-shoebox/shared";
import { SelectedMediaPreview } from "@/media/SelectedMediaPreview";
import itemClasses from "../ItemConversation/ItemConversation.module.css";
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
export function ItemLoading({
  preview,
}: Readonly<{ preview?: MediaPreview }>): ReactNode {
  return (
    <>
      <ItemTopBar capturedOn={undefined} />
      <main
        className={
          preview === undefined ? classes.viewer : itemClasses.itemPage
        }
        aria-busy="true"
      >
        <h1 className="visually-hidden">Opening it</h1>
        {preview === undefined ? null : (
          <div className={itemClasses.surface}>
            <div className={itemClasses.watchGrid}>
              <div className={itemClasses.mediaColumn}>
                <SelectedMediaPreview preview={preview} />
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
