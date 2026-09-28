import { IconCheck, IconLock, IconTag } from "@tabler/icons-react";
import { clsx } from "clsx";
import type { ReactNode } from "react";
import type { MediaRef } from "@memory-shoebox/shared";
import { runtimeLabel } from "@/system/labelHelpers/labelHelpers";
import { ICON_PROPS_SMALL } from "@/system/icons";
import { scatterStyle } from "@/system/Pile/scatterStyle";
import classes from "@/system/system.module.css";

type Props = {
  media: MediaRef;
  seed: number;
  unseen?: boolean;
  /** The words on the lock chip, when the item is not visible to everyone. */
  restrictedLabel?: string;
  selected?: boolean;
  onClick?: () => void;
  eager?: boolean;
  /** How many tags, people or milestones have just been put on this one. */
  labelCount?: number;
};

/**
 * A print: a photograph stuck flat on the panel with 5px of paper around it
 * and a contact shadow. No card shell, no radius, no decorative shadow, and
 * never cropped to a square.
 */
export function Print({
  media,
  seed,
  unseen = false,
  restrictedLabel,
  selected,
  onClick,
  eager = false,
  labelCount,
}: Readonly<Props>): ReactNode {
  return (
    <button
      type="button"
      className={clsx(
        classes.print,
        selected !== undefined && classes.printSelectable,
        selected === true && classes.printSelected,
      )}
      style={scatterStyle(seed)}
      onClick={onClick}
      aria-pressed={selected}
    >
      <img
        src={media.thumb.url}
        alt={media.altText}
        width={media.thumb.width}
        height={media.thumb.height}
        loading={eager ? "eager" : "lazy"}
      />
      {media.durationMs === null ? null : (
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
      {selected === true ? (
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
    </button>
  );
}
