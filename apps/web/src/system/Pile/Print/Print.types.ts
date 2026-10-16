import type { MediaRef } from "@memory-shoebox/shared";
import type { ReactNode } from "react";

/** Media, selection and non-interactive overlays accepted by a pile print. */
export type Props = {
  /** Non-interactive overlays that move with the photograph. */
  children?: ReactNode;
  /**
   * What a print draws: a pile print's whole `MediaRef`, or a fanned frame's
   * preview, catalog layout and alt text carried by a `BurstFrameRef`.
   */
  media: Pick<
    MediaRef,
    "thumb" | "altText" | "width" | "height" | "previewState"
  > &
    Partial<Pick<MediaRef, "durationMs">>;
  seed: number;
  /** Only the arrangement miniature names its local view-transition prints. */
  transitionName?: string;
  unseen?: boolean;
  /** The words on the lock chip, when the item is not visible to everyone. */
  restrictedLabel?: string;
  selected?: boolean;
  onClick?: () => void;
  eager?: boolean;
  /** How many tags, people or milestones have just been put on this one. */
  labelCount?: number;
  /**
   * The item this print draws, written to the DOM so the seen latch's one
   * observer can find every print on the page without a ref per print.
   */
  itemId?: string;
  /**
   * A burst cover renews by item identity while its seen latch stays
   * burst-scoped.
   */
  mediaItemId?: string;
};
