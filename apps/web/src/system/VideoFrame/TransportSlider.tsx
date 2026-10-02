import { useRef, type ReactNode } from "react";
import { clockLabel } from "@/system/labelHelpers/labelHelpers";
import classes from "@/system/system.module.css";

type Props = {
  position: number;
  duration: number;
  /** A position chosen on the bar, by a press or a key. */
  onSeek: (seconds: number) => void;
};

/**
 * Where a key takes the transport, or undefined for a key that is not one of
 * the slider's.
 *
 * The keys WAI-ARIA gives a slider: a second each way on the arrows, a tenth
 * of the video on Page Up and Page Down, and the two ends on Home and End.
 */
function _getPositionFromKey(
  options: Readonly<{ key: string; position: number; duration: number }>,
): number | undefined {
  const { key, position, duration } = options;
  const tenth = duration / 10;
  const positionByKey: Record<string, number> = {
    ArrowRight: position + 1,
    ArrowUp: position + 1,
    ArrowLeft: position - 1,
    ArrowDown: position - 1,
    PageUp: position + tenth,
    PageDown: position - tenth,
    Home: 0,
    End: duration,
  };
  const nextPosition = positionByKey[key];
  return nextPosition === undefined
    ? undefined
    : Math.min(Math.max(nextPosition, 0), duration);
}

/**
 * The scrubber, as a slider a keyboard can hold.
 *
 * It covers the whole bar under the marks, so a press anywhere seeks there and
 * nothing needs dragging (`PRODUCT.md` § Accessibility & Inclusion). Its
 * children are the tick rule, the track and the played bar, all decorative,
 * which is the only kind of child a slider may have.
 */
export function TransportSlider({
  position,
  duration,
  onSeek,
}: Readonly<Props>): ReactNode {
  const sliderRef = useRef<HTMLDivElement>(null);
  const playedFraction = duration > 0 ? Math.min(position / duration, 1) : 0;

  return (
    <div
      ref={sliderRef}
      role="slider"
      tabIndex={0}
      className={classes.scrubberSlider}
      aria-label="Where in the video"
      aria-valuemin={0}
      aria-valuemax={duration}
      aria-valuenow={position}
      aria-valuetext={`${clockLabel(position)} of ${clockLabel(duration)}`}
      onClick={(event) => {
        const box = sliderRef.current?.getBoundingClientRect();
        if (!box || box.width === 0) {
          return;
        }
        const fraction = Math.min(
          Math.max((event.clientX - box.left) / box.width, 0),
          1,
        );
        onSeek(fraction * duration);
      }}
      onKeyDown={(event) => {
        const nextPosition = _getPositionFromKey({
          key: event.key,
          position,
          duration,
        });
        if (nextPosition !== undefined) {
          event.preventDefault();
          onSeek(nextPosition);
        }
      }}
    >
      <div className={classes.scrubberRules} aria-hidden="true" />
      <div className={classes.scrubberTrack} aria-hidden="true" />
      <div
        className={classes.scrubberPlayed}
        style={{ width: `${playedFraction * 100}%` }}
        aria-hidden="true"
      />
    </div>
  );
}
