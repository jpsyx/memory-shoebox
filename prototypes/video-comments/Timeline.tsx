import React from "react";
import { IconMessageCircle } from "@tabler/icons-react";
import {
  makeTimestampFromSeconds as stamp,
  type Comment,
  type Reaction,
} from "./model";

type Props = {
  position: number;
  duration: number;
  comments: readonly Comment[];
  reactions: readonly Reaction[];
  onSeek: (seconds: number) => void;
};
/** Focusable moment markers share one position scale with the video scrubber. */
export function Timeline({
  position,
  duration,
  comments,
  reactions,
  onSeek,
}: Props): React.ReactNode {
  const marks = [
    ...comments
      .filter((comment) => {
        return comment.seconds !== undefined;
      })
      .map((comment) => {
        return {
          id: comment.id,
          seconds: comment.seconds!,
          label: `${comment.name}: ${comment.body}`,
          glyph: comment.initials,
          isComment: true,
        };
      }),
    ...reactions.map((reaction) => {
      return {
        ...reaction,
        label: `${reaction.name} reacted ${reaction.emoji}`,
        glyph: reaction.emoji,
        isComment: false,
      };
    }),
  ];
  return (
    <div className="timeline">
      <div className="marks" aria-label="Moments in this video">
        {marks.map((mark, index) => {
          return (
            <button
              key={mark.id}
              className={`mark ${mark.isComment ? "avatar-mark" : ""}`}
              style={{
                left: `${Math.min(97, Math.max(3, (mark.seconds / duration) * 100))}%`,
                top: index % 2 ? 19 : 0,
              }}
              aria-label={`${mark.label} at ${stamp(mark.seconds)}`}
              onClick={() => {
                return onSeek(mark.seconds);
              }}
            >
              {mark.glyph}
              <span className="marker-tip">
                {mark.isComment && <IconMessageCircle size={14} />} {mark.label}
                <b>{stamp(mark.seconds)}</b>
              </span>
            </button>
          );
        })}
      </div>
      <input
        aria-label="Video position"
        type="range"
        min="0"
        max={duration}
        step="0.01"
        value={position}
        style={{
          background: `linear-gradient(to right, #b8aaff ${(position / duration) * 100}%, #777780 ${(position / duration) * 100}%)`,
        }}
        onChange={(event) => {
          return onSeek(Number(event.target.value));
        }}
      />
    </div>
  );
}
