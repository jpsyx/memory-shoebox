import React, { useState } from "react";
import {
  Container,
  PlayButton,
  MuteButton,
  FullscreenButton,
} from "@videojs/react";
import { Video } from "@videojs/react/video";
import {
  IconPlayerPlayFilled,
  IconPlayerPauseFilled,
  IconVolume,
  IconVolumeOff,
  IconMaximize,
  IconMessageCircle,
  IconMoodSmile,
} from "@tabler/icons-react";
import { Timeline } from "./Timeline";
import { EMOJIS, makeTimestampFromSeconds as stamp } from "./model";
import type { Preview } from "./usePreview";

type Props = { preview: Preview };
/** Real media playback with a Loom-inspired reaction and marker layer. */
export function Player({ preview }: Props): React.ReactNode {
  const p = preview;
  return (
    <>
      <Container className="player" aria-label="Video player">
        <Video
          ref={p.videoRef}
          src={p.source}
          playsInline
          preload="auto"
          poster={
            p.source.startsWith("blob:")
              ? undefined
              : "/e2e/fixtures/cartoon-media/web/first-steps-poster.jpg"
          }
          onLoadedMetadata={(event) => {
            p.setDuration(event.currentTarget.duration);
            p.setHasError(false);
            const start = Number(
              new URLSearchParams(location.search).get("t") ?? 0,
            );
            if (Number.isFinite(start) && start > 0) {
              p.onSeek(Math.min(start, event.currentTarget.duration));
            }
          }}
          onTimeUpdate={(event) => {
            return p.setPosition(event.currentTarget.currentTime);
          }}
          onPlay={() => {
            return p.setIsPlaying(true);
          }}
          onPause={() => {
            return p.setIsPlaying(false);
          }}
          onEnded={() => {
            return p.setIsPlaying(false);
          }}
          onError={() => {
            return p.setHasError(true);
          }}
        />
        {!p.isPlaying && !p.hasError && (
          <PlayButton className="center-play" label="Play video">
            <IconPlayerPlayFilled size={30} />
          </PlayButton>
        )}
        {p.hasError && (
          <div className="media-error">
            <strong>This video couldn’t play</strong>
            <p>Try an MP4 or WebM using “Try your own video” above.</p>
          </div>
        )}
        {p.burst && (
          <div key={p.burst.id} className="reaction-burst" aria-hidden="true">
            {p.burst.emoji}
          </div>
        )}
        <div className="transport">
          <Timeline
            position={p.position}
            duration={p.duration || 10}
            comments={p.comments}
            reactions={p.reactions}
            onSeek={p.onSeek}
          />
          <Controls preview={p} />
        </div>
      </Container>
      <ReactionTray preview={p} />
    </>
  );
}

function Controls({ preview: p }: Props) {
  const [speed, setSpeed] = useState(1);
  return (
    <div className="controls">
      <PlayButton disabled={p.hasError}>
        <IconPlayerPlayFilled className="play-icon" />
        <IconPlayerPauseFilled className="pause-icon" />
      </PlayButton>
      <MuteButton>
        <IconVolume className="volume-icon" />
        <IconVolumeOff className="muted-icon" />
      </MuteButton>
      <span className="time-display">
        {stamp(p.position)} <span>/ {stamp(p.duration)}</span>
      </span>
      <label className="speed">
        <span className="sr-only">Playback speed</span>
        <select
          value={speed}
          onChange={(event) => {
            const value = Number(event.target.value);
            setSpeed(value);
            if (p.videoRef.current) {
              p.videoRef.current.playbackRate = value;
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

function ReactionTray({ preview: p }: Props) {
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  return (
    <div className="reaction-area">
      <div className="reaction-tray" aria-label="React to this moment">
        {EMOJIS.map((choice) => {
          return (
            <button
              className="emoji-button"
              key={choice.label}
              aria-label={`React: ${choice.label}`}
              title={`${choice.label} at ${stamp(p.position)}`}
              onClick={() => {
                return p.onReact(choice.emoji);
              }}
            >
              {choice.emoji}
            </button>
          );
        })}
        <div className="more-reactions">
          <button
            className="more-button"
            aria-label="More reactions"
            aria-expanded={isMoreOpen}
            onClick={() => {
              return setIsMoreOpen(!isMoreOpen);
            }}
          >
            <IconMoodSmile size={22} />
          </button>
          {isMoreOpen && (
            <div className="emoji-menu">
              {["❤️", "🥹", "🎉", "💯"].map((emoji) => {
                return (
                  <button
                    key={emoji}
                    aria-label={`React ${emoji}`}
                    onClick={() => {
                      p.onReact(emoji);
                      setIsMoreOpen(false);
                    }}
                  >
                    {emoji}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <button
          className="comment-action"
          aria-label="Comment on this moment"
          onClick={p.onComment}
        >
          <IconMessageCircle size={19} />
          <span>Comment</span>
        </button>
      </div>
      <p className="reaction-hint">
        React to this moment <span>·</span> {stamp(p.position)}
      </p>
    </div>
  );
}
