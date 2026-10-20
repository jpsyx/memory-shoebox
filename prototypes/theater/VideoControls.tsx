import React, { type ReactNode, type RefObject } from "react";
import {
  IconPlayerPlayFilled,
  IconPlayerPauseFilled,
  IconVolume,
  IconVolumeOff,
} from "@tabler/icons-react";
import { clockLabel } from "./model";
import styles from "./theater.module.css";

type Props = {
  videoRef: RefObject<HTMLVideoElement | null>;
  position: number;
  duration: number;
  isPlaying: boolean;
  isMuted: boolean;
  onTogglePlay: () => void;
  onToggleMute: () => void;
  onSeek: (position: number) => void;
};
/** Compact transport leaves reaction controls visible even during idle playback. */
export function VideoControls(props: Readonly<Props>): ReactNode {
  return (
    <div className={styles.videoControls} aria-label="Video controls">
      <input
        className={styles.scrubber}
        type="range"
        aria-label="Video position"
        min={0}
        max={props.duration || 1}
        step={0.01}
        value={Math.min(props.position, props.duration || 1)}
        aria-valuetext={`${clockLabel(props.position)} of ${clockLabel(props.duration)}`}
        onChange={(event) => {
          return props.onSeek(Number(event.target.value));
        }}
      />
      <div className={styles.transportRow}>
        <button
          aria-label={props.isPlaying ? "Pause video" : "Play video"}
          onClick={props.onTogglePlay}
        >
          {props.isPlaying ? (
            <IconPlayerPauseFilled />
          ) : (
            <IconPlayerPlayFilled />
          )}
        </button>
        <button
          aria-label={props.isMuted ? "Unmute video" : "Mute video"}
          onClick={props.onToggleMute}
        >
          {props.isMuted ? <IconVolumeOff /> : <IconVolume />}
        </button>
        <span>
          {clockLabel(props.position)}{" "}
          <span>/ {clockLabel(props.duration)}</span>
        </span>
        <select
          aria-label="Playback speed"
          defaultValue="1"
          onChange={(event) => {
            if (props.videoRef.current)
              props.videoRef.current.playbackRate = Number(event.target.value);
          }}
        >
          <option value="0.5">0.5×</option>
          <option value="1">1×</option>
          <option value="1.5">1.5×</option>
          <option value="2">2×</option>
        </select>
      </div>
    </div>
  );
}
