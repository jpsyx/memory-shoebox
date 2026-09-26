import { clsx } from "clsx";
import {
  useEffect,
  useRef,
  useState,
  type RefObject,
  type ReactNode,
} from "react";
import type { MediaRef } from "@/data/media";
import { PlayGlyph } from "@/system/icons";
import { formatClock } from "@/system/Talk";
import classes from "@/system/system.module.css";

export interface TransportMark {
  readonly id: string;
  readonly atSeconds: number;
  readonly label: string;
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
}: {
  readonly media: MediaRef;
  readonly marks: readonly TransportMark[];
  readonly pendingAt?: number;
  readonly videoRef: RefObject<HTMLVideoElement | null>;
  readonly startPlaying?: boolean;
  readonly onScrub?: (seconds: number) => void;
}): ReactNode {
  const scrubberRef = useRef<HTMLDivElement>(null);
  const [currentTime, setCurrentTime] = useState(startPlaying ? 8 : 0);
  const [duration, setDuration] = useState(22);
  const [isPlaying, setIsPlaying] = useState(startPlaying);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    if (startPlaying) {
      video.currentTime = 8;
      void video.play().catch(() => {
        /* Autoplay policy. The frame still shows the moment. */
      });
    } else {
      video.pause();
      video.currentTime = 0;
    }
  }, [startPlaying, videoRef]);

  const playedFraction = duration > 0 ? currentTime / duration : 0;

  return (
    <div className={classes.frame}>
      <video
        ref={videoRef}
        poster={media.poster}
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
        {(media.sources ?? []).map((source) => {
          return (
            <source key={source.src} src={source.src} type={source.type} />
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
          {formatClock(currentTime)} / {formatClock(duration)}
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
          {marks.map((mark) => {
            return (
              <button
                key={mark.id}
                type="button"
                className={classes.scrubberMark}
                style={{ left: `${(mark.atSeconds / duration) * 100}%` }}
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
              style={{ left: `${(pendingAt / duration) * 100}%` }}
              aria-hidden="true"
            />
          )}
        </div>
      </div>
    </div>
  );
}
