import { useState, type ReactNode } from "react";
import type { VideoTransport } from "@/surfaces/Item/ItemViewer/useVideoTransport";
import { Select } from "@/system/Select/Select";
import classes from "./VideoConversation.module.css";

type Props = { videoRef: VideoTransport["videoRef"] };

/** Keeps playback speed and its menu inside the fullscreen player. */
export function VideoSpeedSelect({ videoRef }: Readonly<Props>): ReactNode {
  const [speed, setSpeed] = useState(1);
  return (
    <Select
      className={classes.speed}
      classNames={{ input: classes.speedInput, section: classes.speedSection }}
      aria-label="Playback speed"
      value={String(speed)}
      comboboxProps={{
        withinPortal: false,
        position: "top-end",
        width: "8rem",
      }}
      floatingHeight="viewport"
      data={["0.5", "1", "1.5", "2"].map((value) => {
        return { value, label: `${value}×` };
      })}
      onChange={(value) => {
        const playbackRate = Number(value);
        setSpeed(playbackRate);
        if (videoRef.current !== null) {
          videoRef.current.playbackRate = playbackRate;
        }
      }}
    />
  );
}
