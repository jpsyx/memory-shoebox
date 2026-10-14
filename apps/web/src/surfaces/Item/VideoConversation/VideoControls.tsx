import { onVideoPlay } from "./onVideoPlay";
import { FullscreenButton, MuteButton, PlayButton } from "@videojs/react";
import {
  IconMaximize,
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
  IconVolume,
  IconVolumeOff,
} from "@tabler/icons-react";
import type { ReactNode } from "react";
import type { VideoTransport } from "@/surfaces/Item/ItemViewer/useVideoTransport";
import { clockLabel } from "@/system/labelHelpers/labelHelpers";
import { VideoSpeedSelect } from "./VideoSpeedSelect";
import classes from "./VideoConversation.module.css";

type Props = {
  transport: VideoTransport;
  duration: number;
  hasError: boolean;
  onFailure: () => void;
};

/** Video.js primitives own playback, volume and fullscreen state. */
export function VideoControls({
  transport,
  duration,
  hasError,
  onFailure,
}: Readonly<Props>): ReactNode {
  return (
    <div className={classes.controls}>
      <PlayButton
        disabled={hasError}
        onClickCapture={(event) => {
          return onVideoPlay({
            event,
            video: transport.videoRef.current,
            onFailure,
          });
        }}
      >
        <IconPlayerPlayFilled className={classes.playIcon} />
        <IconPlayerPauseFilled className={classes.pauseIcon} />
      </PlayButton>
      <MuteButton>
        <IconVolume className={classes.volumeIcon} />
        <IconVolumeOff className={classes.mutedIcon} />
      </MuteButton>
      <span
        className={classes.clock}
      >{`${clockLabel(Math.min(duration, transport.position))} / ${clockLabel(duration)}`}</span>
      <VideoSpeedSelect videoRef={transport.videoRef} />
      <FullscreenButton>
        <IconMaximize />
      </FullscreenButton>
    </div>
  );
}
