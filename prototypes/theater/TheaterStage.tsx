import React, {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import {
  IconArrowLeft,
  IconChevronLeft,
  IconChevronRight,
  IconMaximize,
  IconMinimize,
  IconPlayerPlayFilled,
  IconReload,
} from "@tabler/icons-react";
import { CommentDock } from "./CommentDock";
import { VideoControls } from "./VideoControls";
import {
  REACTIONS,
  clockLabel,
  type TheaterComment,
  type TheaterDraft,
  type TheaterMedia,
} from "./model";
import styles from "./theater.module.css";

type Props = {
  media: TheaterMedia[];
  selected: number;
  onSelect: (index: number) => void;
  onExit: () => void;
  host: RefObject<HTMLDivElement | null>;
  comments: TheaterComment[];
  onComment: (itemId: string, comment: TheaterComment) => void;
  draft: TheaterDraft;
  onDraft: (draft: TheaterDraft) => void;
};
/** The app-owned fullscreen stage survives navigation across both media kinds. */
export function TheaterStage(props: Readonly<Props>): ReactNode {
  const item = props.media[props.selected]!;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(
    Boolean(document.fullscreenElement),
  );
  const [hasError, setHasError] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [reaction, setReaction] = useState<{ emoji: string; id: number }>();
  const [notice, setNotice] = useState("");
  const noticeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const play = () => {
    const video = videoRef.current;
    void video?.play().catch(() => {
      if (videoRef.current === video && video.isConnected) {
        setNotice("Press Play to start this video.");
      }
    });
  };
  const togglePlay = () => {
    if (videoRef.current?.paused) play();
    else videoRef.current?.pause();
  };
  const leave = () => {
    videoRef.current?.pause();
    props.onExit();
  };
  const move = (direction: number) => {
    const index = props.selected + direction;
    if (index < 0 || index >= props.media.length) return;
    videoRef.current?.pause();
    setPosition(0);
    setDuration(0);
    setIsReady(false);
    setHasError(false);
    setNotice("");
    setReaction(undefined);
    props.onSelect(index);
  };
  const seek = (seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = seconds;
      setPosition(seconds);
    }
  };
  useEffect(() => {
    const change = () => {
      return setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", change);
    return () => {
      return document.removeEventListener("fullscreenchange", change);
    };
  }, []);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      )
        return;
      const isEditing =
        event.target instanceof Element &&
        event.target.closest(
          'textarea, input, select, [contenteditable="true"]',
        );
      if (isEditing) return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        if (!event.repeat) move(event.key === "ArrowRight" ? 1 : -1);
      }
      if (event.key === "Escape" && !document.fullscreenElement) leave();
      if (
        event.code === "Space" &&
        item.kind === "video" &&
        !(event.target instanceof Element && event.target.closest("button"))
      ) {
        event.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener("keydown", keyboard);
    return () => {
      return window.removeEventListener("keydown", keyboard);
    };
  });
  useEffect(() => {
    return () => {
      return clearTimeout(noticeTimer.current);
    };
  }, []);
  const onReact = (emoji: string, label: string) => {
    setReaction({ emoji, id: Date.now() });
    setNotice(
      `${label} at ${clockLabel(videoRef.current?.currentTime ?? 0)}. Reaction added in this preview.`,
    );
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => {
      return setNotice("");
    }, 2200);
  };
  return (
    <main
      className={styles.theater}
      data-kind={item.kind}
      aria-label="Theater"
      tabIndex={-1}
    >
      <div className={styles.mediaStage}>
        {item.kind === "photo" ? (
          <img
            key={`${item.id}-${attempt}`}
            className={styles.media}
            src={item.source}
            alt={item.title}
            onLoad={() => {
              return setIsReady(true);
            }}
            onError={() => {
              return setHasError(true);
            }}
          />
        ) : (
          <video
            key={`${item.id}-${attempt}`}
            className={styles.media}
            ref={videoRef}
            src={item.source}
            poster={item.poster}
            autoPlay
            playsInline
            muted={isMuted}
            preload="auto"
            onLoadedMetadata={(event) => {
              setDuration(event.currentTarget.duration);
              play();
            }}
            onCanPlay={() => {
              return setIsReady(true);
            }}
            onPlay={() => {
              setIsPlaying(true);
              setNotice("");
            }}
            onPause={() => {
              return setIsPlaying(false);
            }}
            onEnded={() => {
              return setIsPlaying(false);
            }}
            onTimeUpdate={(event) => {
              return setPosition(event.currentTarget.currentTime);
            }}
            onError={() => {
              return setHasError(true);
            }}
            onClick={togglePlay}
          />
        )}
        {!isReady && !hasError ? (
          <div className={styles.loading} role="status">
            Opening this moment…
          </div>
        ) : null}
        {hasError ? (
          <div className={styles.mediaError} role="alert">
            <h2>This moment couldn’t open</h2>
            <p>Try again, or move to the next memory.</p>
            <button
              onClick={() => {
                setHasError(false);
                setAttempt(attempt + 1);
              }}
            >
              <IconReload /> Try again
            </button>
          </div>
        ) : null}
        {item.kind === "video" && !isPlaying && isReady && !hasError ? (
          <button
            className={styles.centerPlay}
            aria-label="Play video"
            onClick={play}
          >
            <IconPlayerPlayFilled />
          </button>
        ) : null}
      </div>
      <header className={styles.stageHeader}>
        <button
          className={styles.chromeButton}
          aria-label="Exit theater"
          onClick={leave}
        >
          <IconArrowLeft />
          <span>Back</span>
        </button>
        <div
          className={styles.stageIdentity}
          title={`${item.title} · ${item.date} · ${props.selected + 1}/${props.media.length}`}
        >
          {`${item.title} · ${item.date} · ${props.selected + 1}/${props.media.length}`}
        </div>
        <button
          className={styles.chromeButton}
          aria-label={isFullscreen ? "Leave full screen" : "Enter full screen"}
          onClick={() => {
            if (isFullscreen) void document.exitFullscreen();
            else
              void props.host.current?.requestFullscreen?.().catch(() => {
                return setNotice(
                  "Full screen is unavailable. Theater still fills this window.",
                );
              });
          }}
        >
          {isFullscreen ? <IconMinimize /> : <IconMaximize />}
        </button>
      </header>
      <nav aria-label="Timeline navigation">
        <div className={`${styles.edgeZone} ${styles.leftEdge}`}>
          <button
            className={styles.edgeArrow}
            disabled={props.selected === 0}
            aria-label="Previous photo or video"
            aria-keyshortcuts="ArrowLeft"
            onClick={() => {
              return move(-1);
            }}
          >
            <IconChevronLeft />
          </button>
        </div>
        <div className={`${styles.edgeZone} ${styles.rightEdge}`}>
          <button
            className={styles.edgeArrow}
            disabled={props.selected === props.media.length - 1}
            aria-label="Next photo or video"
            aria-keyshortcuts="ArrowRight"
            onClick={() => {
              return move(1);
            }}
          >
            <IconChevronRight />
          </button>
        </div>
      </nav>
      {item.kind === "video" ? (
        <div className={styles.videoDock}>
          {reaction ? (
            <div
              key={reaction.id}
              className={styles.reactionBurst}
              aria-hidden="true"
            >
              {reaction.emoji}
            </div>
          ) : null}
          <div className={styles.reactions} aria-label="React to this moment">
            {REACTIONS.map((choice) => {
              return (
                <button
                  key={choice.label}
                  aria-label={`React: ${choice.label}`}
                  title={choice.label}
                  onClick={() => {
                    return onReact(choice.emoji, choice.label);
                  }}
                >
                  {choice.emoji}
                </button>
              );
            })}
          </div>
          <VideoControls
            key={item.id}
            videoRef={videoRef}
            position={position}
            duration={duration}
            isPlaying={isPlaying}
            isMuted={isMuted}
            onTogglePlay={togglePlay}
            onToggleMute={() => {
              return setIsMuted(!isMuted);
            }}
            onSeek={seek}
          />
        </div>
      ) : null}
      <CommentDock
        key={item.id}
        isVideo={item.kind === "video"}
        comments={props.comments}
        draft={props.draft}
        onDraft={props.onDraft}
        onSend={(comment) => {
          return props.onComment(item.id, comment);
        }}
        onCapture={() => {
          const capturedPosition = videoRef.current?.currentTime ?? 0;
          videoRef.current?.pause();
          return capturedPosition;
        }}
        onSeek={seek}
      />
      <div className={styles.notice} role="status">
        {notice}
      </div>
      <span
        className={styles.srOnly}
        aria-live="polite"
      >{`${item.kind === "video" ? "Video" : "Photo"}, ${props.selected + 1} of ${props.media.length}: ${item.title}`}</span>
    </main>
  );
}
