import { clsx } from "clsx";
import type { ReactNode } from "react";
import type { TransportMark } from "@/system/VideoFrame/VideoFrame";
import classes from "@/system/system.module.css";

type Props = {
  marks: readonly TransportMark[];
  pendingAt?: number;
  duration: number;
  onSeek: (seconds: number) => void;
};

/**
 * The pinned-comment marks, and the outlined one being placed.
 *
 * A layer over the slider rather than inside it: a slider's children are
 * presentational to assistive technology, so a mark nested in it could not be
 * reached. The layer lets presses through to the bar between its marks.
 *
 * With no duration there is no scale to place a mark on, and a mark parked at
 * 0:00 points at a moment that is not there, so the layer draws nothing.
 */
export function TransportMarks({
  marks,
  pendingAt,
  duration,
  onSeek,
}: Readonly<Props>): ReactNode {
  if (duration <= 0) {
    return null;
  }
  const getLeftFromSeconds = (seconds: number) => {
    return `${(Math.min(seconds, duration) / duration) * 100}%`;
  };
  return (
    <div className={classes.scrubberMarks}>
      {marks.map((mark) => {
        return (
          <button
            key={mark.id}
            type="button"
            className={classes.scrubberMark}
            style={{ left: getLeftFromSeconds(mark.atSeconds) }}
            aria-label={mark.label}
            onClick={() => {
              return onSeek(mark.atSeconds);
            }}
          />
        );
      })}
      {pendingAt === undefined ? null : (
        <span
          className={clsx(classes.scrubberMark, classes.scrubberMarkPending)}
          style={{ left: getLeftFromSeconds(pendingAt) }}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
