import { clsx } from "clsx";
import {
  useEffect,
  useRef,
  useState,
  type RefObject,
  type ReactNode,
} from "react";
import type { MediaRef } from "@memory-shoebox/shared";
import { PlayGlyph } from "@/system/icons";
import { clockLabel } from "@/system/labels";
import classes from "@/system/system.module.css";

export type TransportMark = {
  readonly id: string;
  readonly atSeconds: number;
  readonly label: string;
};

type Props = {
  readonly media: MediaRef;
  readonly marks: readonly TransportMark[];
  readonly pendingAt?: number;
  readonly videoRef: RefObject<HTMLVideoElement | null>;
  readonly startPlaying?: boolean;
  readonly onScrub?: (seconds: number) => void;
};

/** The two encodings the contract carries, in preference order. */
function _sourcesOf(
  media: MediaRef,
): ReadonlyArray<{ readonly url: string; readonly type: string }> {
  if (media.video === null) {
    return [];
  }
  return [
    { source: media.video.webm, type: "video/webm" },
    { source: media.video.mp4, type: "video/mp4" },
  ].flatMap((candidate) => {
    return candidate.source === null
      ? []
      : [{ url: candidate.source.url, type: candidate.type }];
  });
}

/**
 * A mark's left offset as a percentage, guarded against a duration of zero.
 *
 * `duration` starts at 0 until the video's metadata loads, and a mark
 * positioned before then would otherwise divide by zero and sit at
 * `Infinity%`. Pinning it to 0% instead keeps it a real, if momentarily
 * misplaced, element rather than a broken one.
 */
function _markPositionPercent(atSeconds: number, duration: number): number {
  return duration > 0 ? (atSeconds / duration) * 100 : 0;
}

/**
 * Whether the transport knows how long the video is.
 *
 * Until `loadedmetadata` fires there is no scale to place a mark against, and
 * a video that never loads never gets one. A mark parked at 0:00 on a video
 * nobody can play is worse than no mark: it points at a moment that is not
 * there. So the marks wait, and the bar reads as empty rather than as wrong.
 */
function _isMeasured(duration: number): boolean {
  return duration > 0;
}

/**
 * A video in its frame, standing on a measured transport bar.
 *
 * The bar is opaque chip black with a 9px tick rule behind a 3px track, so a
 * comment pinned at 0:14 stands somewhere a person can actually read rather
 * than floating on an unmarked line. Every mark carries an invisible 44x44
 * pointer target, because the mark itself is 3px wide and nothing in this
 * system may depend on precise pointing.
 */
export function VideoFrame({
  media,
  marks,
  pendingAt,
  videoRef,
  startPlaying = false,
  onScrub,
}: Props): ReactNode {
  const scrubberRef = useRef<HTMLDivElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(startPlaying);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    if (startPlaying) {
      void video.play().catch(() => {
        /* Autoplay policy. The frame still shows the moment. */
      });
    } else {
      video.pause();
    }
  }, [startPlaying, videoRef]);

  const playedFraction = duration > 0 ? currentTime / duration : 0;

  return (
    <div className={classes.frame}>
      <video
        ref={videoRef}
        poster={media.poster?.url}
        playsInline
        muted={startPlaying}
        preload="metadata"
        onLoadedMetadata={(event) => {
          return setDuration(event.currentTarget.duration);
        }}
        onTimeUpdate={(event) => {
          return setCurrentTime(event.currentTarget.currentTime);
        }}
        onPlay={() => {
          return setIsPlaying(true);
        }}
        onPause={() => {
          return setIsPlaying(false);
        }}
      >
        {_sourcesOf(media).map((source) => {
          return (
            <source key={source.url} src={source.url} type={source.type} />
          );
        })}
      </video>

      <div className={classes.transport}>
        <button
          type="button"
          className={classes.transportPlay}
          aria-label={isPlaying ? "Pause" : "Play"}
          onClick={() => {
            const video = videoRef.current;
            if (!video) {
              return;
            }
            if (video.paused) {
              void video.play().catch(() => {});
            } else {
              video.pause();
            }
          }}
        >
          <PlayGlyph paused={!isPlaying} />
        </button>

        <span className={classes.transportClock}>
          {clockLabel(currentTime)} / {clockLabel(duration)}
        </span>

        <div
          ref={scrubberRef}
          className={classes.scrubber}
          onClick={(event) => {
            const box = scrubberRef.current?.getBoundingClientRect();
            if (!box) {
              return;
            }
            const fraction = Math.min(
              Math.max((event.clientX - box.left) / box.width, 0),
              1,
            );
            const seconds = fraction * duration;
            setCurrentTime(seconds);
            if (videoRef.current) {
              videoRef.current.currentTime = seconds;
            }
            onScrub?.(seconds);
          }}
        >
          <div className={classes.scrubberRules} aria-hidden="true" />
          <div className={classes.scrubberTrack} aria-hidden="true" />
          <div
            className={classes.scrubberPlayed}
            style={{ width: `${playedFraction * 100}%` }}
            aria-hidden="true"
          />
          {!_isMeasured(duration)
            ? null
            : marks.map((mark) => {
                return (
                  <button
                    key={mark.id}
                    type="button"
                    className={classes.scrubberMark}
                    style={{
                      left: `${_markPositionPercent(mark.atSeconds, duration)}%`,
                    }}
                    aria-label={mark.label}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (videoRef.current) {
                        videoRef.current.currentTime = mark.atSeconds;
                      }
                      setCurrentTime(mark.atSeconds);
                    }}
                  />
                );
              })}
          {pendingAt === undefined ? null : (
            <span
              className={clsx(
                classes.scrubberMark,
                classes.scrubberMarkPending,
              )}
              style={{
                left: `${_markPositionPercent(pendingAt, duration)}%`,
              }}
              aria-hidden="true"
            />
          )}
        </div>
      </div>
    </div>
  );
}
