import { FullscreenButton, MuteButton, PlayButton } from "@videojs/react";
import {
  IconMaximize,
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
  IconVolume,
  IconVolumeOff,
} from "@tabler/icons-react";
import { useState, type ReactNode } from "react";
import type { VideoTransport } from "@/surfaces/Item/ItemViewer/useVideoTransport";
import { clockLabel } from "@/system/labelHelpers/labelHelpers";
import classes from "./VideoConversation.module.css";

type Props = { transport: VideoTransport; duration: number; hasError: boolean };

/** Video.js primitives own playback, volume and fullscreen state. */
export function VideoControls({
  transport,
  duration,
  hasError,
}: Readonly<Props>): ReactNode {
  const [speed, setSpeed] = useState(1);
  return (
    <div className={classes.controls}>
      <PlayButton disabled={hasError}>
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
      <label className={classes.speed}>
        <span className="visually-hidden">Playback speed</span>
        <select
          value={speed}
          onChange={(event) => {
            const value = Number(event.currentTarget.value);
            setSpeed(value);
            if (transport.videoRef.current !== null) {
              transport.videoRef.current.playbackRate = value;
            }
          }}
        >
          <option value="0.5">0.5×</option>
          <option value="1">1×</option>
          <option value="1.5">1.5×</option>
          <option value="2">2×</option>
        </select>
      </label>
      <FullscreenButton>
        <IconMaximize />
      </FullscreenButton>
    </div>
  );
}
