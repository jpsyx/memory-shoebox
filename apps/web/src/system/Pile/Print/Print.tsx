import { PolaroidContainer } from "@/system/PolaroidContainer/PolaroidContainer";
import { scatterStyle } from "@/system/Pile/scatterStyle";
import { clsx } from "clsx";
import type { ReactNode } from "react";
import classes from "./Print.module.css";
import type { Props } from "./Print.types";
import { PrintMedia } from "./PrintMedia/PrintMedia";
import { PrintOverlays } from "./PrintOverlays/PrintOverlays";
import { usePrintInteraction } from "./usePrintInteraction";
import { usePrintMedia } from "./usePrintMedia";

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
  eager: _eager = false,
  labelCount,
  itemId,
  mediaItemId = itemId,
  children,
}: Readonly<Props>): ReactNode {
  const { media, thumbnail, reference } = usePrintMedia({
    media: initialMedia,
    itemId,
    mediaItemId,
  });
  const interaction = usePrintInteraction({
    itemId,
    selected,
    onClick,
    durationMs: media.durationMs ?? undefined,
  });
  return (
    <PolaroidContainer
      component="button"
      size="thumbnail"
      {...interaction.intent}
      type="button"
      ref={reference}
      data-photo-surface="pile"
      data-print-selection={interaction.isSelectable ? "timeline" : undefined}
      className={clsx(
        classes.print,
        interaction.isSelected !== undefined && classes.printSelectable,
        interaction.isSelected === true && classes.printSelected,
      )}
      style={{ ...scatterStyle(seed), viewTransitionName: transitionName }}
      disabled={interaction.isDisabled}
      onClick={interaction.onClick}
      aria-pressed={interaction.isSelected}
      data-item-id={itemId}
    >
      <PrintMedia media={media} thumbnail={thumbnail} />
      <PrintOverlays
        durationMs={media.durationMs ?? undefined}
        restrictedLabel={restrictedLabel}
        unseen={unseen}
        isSelected={interaction.isSelected}
        labelCount={labelCount}
      />
      {children}
    </PolaroidContainer>
  );
}
