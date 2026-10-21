import { onVideoPlay, onVideoPlayKey } from "../videoPlaybackHelpers";
import { MuteButton, PlayButton } from "@videojs/react";
import {
  IconMaximize,
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
  IconVolume,
  IconVolumeOff,
} from "@tabler/icons-react";
import type { KeyboardEvent, ReactNode } from "react";
import type { VideoTransport } from "@/surfaces/Item/ItemViewer/useVideoTransport";
import { clockLabel } from "@/system/labelHelpers/labelHelpers";
import { VideoSpeedSelect } from "../VideoSpeedSelect/VideoSpeedSelect";
import { clsx } from "clsx";
import type { ItemPresentation } from "../../ItemViewer/ItemViewer.types";
import classes from "./VideoControls.module.css";

type Props = {
  transport: VideoTransport;
  duration: number;
  hasError: boolean;
  onFailure: () => void;
  presentation?: ItemPresentation;
  onEnterTheater: () => void;
};

/** Video.js owns playback and volume; the shared host owns theater entry. */
export function VideoControls({
  transport,
  duration,
  hasError,
  onFailure,
  presentation = "page",
  onEnterTheater,
}: Readonly<Props>): ReactNode {
  const onKeyCapture = (event: KeyboardEvent) => {
    onVideoPlayKey({
      event,
      video: transport.videoRef.current ?? undefined,
      onFailure,
      isDisabled: hasError,
    });
  };
  return (
    <div
      className={clsx(
        classes.videoControls,
        presentation === "theater" && classes.theater,
      )}
    >
      <PlayButton
        disabled={hasError}
        onKeyDownCapture={onKeyCapture}
        onKeyUpCapture={onKeyCapture}
        onClickCapture={(event) => {
          return onVideoPlay({
            event,
            video: transport.videoRef.current ?? undefined,
            onFailure,
            isDisabled: hasError,
          });
        }}
      >
        <IconPlayerPlayFilled className={classes.videoControlsPlayIcon} />
        <IconPlayerPauseFilled className={classes.videoControlsPauseIcon} />
      </PlayButton>
      <MuteButton>
        <IconVolume className={classes.videoControlsVolumeIcon} />
        <IconVolumeOff className={classes.videoControlsMutedIcon} />
      </MuteButton>
      <span
        className={classes.videoControlsClock}
      >{`${clockLabel(Math.min(duration, transport.position))} / ${clockLabel(duration)}`}</span>
      <VideoSpeedSelect videoRef={transport.videoRef} />
      {presentation === "page" ? (
        <button
          type="button"
          aria-label="Enter full screen"
          data-theater-entry
          onClick={onEnterTheater}
        >
          <IconMaximize />
        </button>
      ) : null}
    </div>
  );
}
