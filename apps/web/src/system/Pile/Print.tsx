import { useMediaIntent } from "@/media/useMediaIntent";
import { useReSigning } from "@/surfaces/Timeline/useReSigning/useReSigning";
import { MediaPlaceholder } from "@/system/MediaPlaceholder/MediaPlaceholder";
import { usePhotoArrival } from "@/system/motion/usePhotoArrival";
import { stagePhotoTransition } from "@/system/motion/photoTransition/photoTransition";
import { IconCheck, IconLock, IconTag } from "@tabler/icons-react";
import { clsx } from "clsx";
import { useContext, type ReactNode } from "react";
import { PileSelectionContext } from "./PileSelection/PileSelection";
import type { MediaRef } from "@memory-shoebox/shared";
import { runtimeLabel } from "@/system/labelHelpers/labelHelpers";
import { ICON_PROPS_SMALL } from "@/system/icons";
import { scatterStyle } from "@/system/Pile/scatterStyle";
import classes from "@/system/system.module.css";

type Props = {
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
};

/**
 * A print: a photograph stuck flat on the panel with 5px of paper around it
 * and a contact shadow. No card shell, no radius, no decorative shadow, and
 * never cropped to a square.
 */
export function Print({
  media: initialMedia,
  seed,
  transitionName,
  unseen = false,
  restrictedLabel,
  selected,
  onClick,
  eager = false,
  labelCount,
  itemId,
  children,
}: Readonly<Props>): ReactNode {
  const photoRef = usePhotoArrival<HTMLButtonElement>(
    itemId,
    initialMedia.thumb?.url ?? "",
  );
  const media = useReSigning({
    itemId,
    media: initialMedia,
    element: photoRef,
  }) ?? { ...initialMedia, thumb: null };
  const intent = useMediaIntent({ itemId: itemId ?? "" });
  const selection = useContext(PileSelectionContext);
  const isSelectable = selection !== undefined && itemId !== undefined;
  const isSelected = isSelectable
    ? selection.selectedItemIds.has(itemId)
    : selected;
  return (
    <button
      {...intent}
      type="button"
      ref={photoRef}
      data-photo-surface="pile"
      className={clsx(
        classes.print,
        isSelected !== undefined && classes.printSelectable,
        isSelectable && classes.printTimelineSelectable,
        isSelected === true && classes.printSelected,
      )}
      style={{ ...scatterStyle(seed), viewTransitionName: transitionName }}
      disabled={isSelectable && selection.isBusy}
      onClick={
        isSelectable
          ? () => {
              selection.onToggle(itemId);
            }
          : (event) => {
              if (itemId && onClick && media.durationMs == null) {
                stagePhotoTransition(event.currentTarget, itemId);
              }
              onClick?.();
            }
      }
      aria-pressed={isSelected}
      data-item-id={itemId}
    >
      {media.thumb === null ? (
        <MediaPlaceholder
          altText={media.altText}
          width={media.width}
          height={media.height}
          state={media.previewState}
        />
      ) : (
        <img
          src={media.thumb.url}
          alt={media.altText}
          width={media.thumb.width}
          height={media.thumb.height}
          loading={eager ? "eager" : "lazy"}
        />
      )}
      {media.durationMs === null || media.durationMs === undefined ? null : (
        <span className={classes.printRuntime}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 5.5v13l11-6.5z" />
          </svg>
          {runtimeLabel(media.durationMs)}
        </span>
      )}
      {restrictedLabel === undefined ? null : (
        <span className={classes.printRestricted}>
          <IconLock {...ICON_PROPS_SMALL} />
          {restrictedLabel}
        </span>
      )}
      {unseen ? (
        <span className={classes.printUnseen}>
          <span className="visually-hidden">Not seen yet</span>
        </span>
      ) : null}
      {isSelected === true ? (
        <span className={classes.printTick} aria-hidden="true">
          <IconCheck size="1.15rem" stroke={2.5} />
        </span>
      ) : null}
      {labelCount === undefined || labelCount === 0 ? null : (
        <span className={classes.printLabels}>
          <IconTag size="0.85rem" stroke={2} />
          {labelCount}
        </span>
      )}
      {children}
    </button>
  );
}
