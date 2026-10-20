import { IconArrowLeft, IconMaximize, IconMinimize } from "@tabler/icons-react";
import type { ItemDetail, MediaPositionResponse } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { theaterTitleLabel } from "./theaterTitleLabel/theaterTitleLabel";
import type { TheaterMode } from "./useTheaterMode/useTheaterMode";
import classes from "./ItemTheater.module.css";

type Props = {
  theater: TheaterMode;
  detail?: ItemDetail;
  timezone: string;
  position?: MediaPositionResponse;
};

/** Selected authorized metadata and persistent exit/fullscreen controls. */
export function ItemTheaterHeader({
  theater,
  detail,
  timezone,
  position,
}: Readonly<Props>): ReactNode {
  const label =
    detail === undefined
      ? "Media theater"
      : theaterTitleLabel({ detail, timezone, position });
  return (
    <header
      className={classes.itemTheaterHeader}
      hidden={theater.presentation !== "theater"}
    >
      <button
        type="button"
        className={classes.itemTheaterBack}
        data-theater-back
        onClick={theater.exit}
      >
        <IconArrowLeft size={20} />
        Back
      </button>
      <div
        className={classes.itemTheaterTitle}
        title={label}
        aria-live="polite"
        aria-atomic="true"
      >
        {label}
      </div>
      <button
        type="button"
        className={classes.itemTheaterFullscreen}
        onClick={theater.toggleFullscreen}
        aria-label={
          theater.isFullscreen ? "Leave fullscreen" : "Enter fullscreen"
        }
      >
        {theater.isFullscreen ? (
          <IconMinimize size={20} />
        ) : (
          <IconMaximize size={20} />
        )}
      </button>
    </header>
  );
}
