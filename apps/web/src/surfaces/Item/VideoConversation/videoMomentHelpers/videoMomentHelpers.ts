import { getInitialsFromDisplayName } from "@/system/labelHelpers/getInitialsFromDisplayName";
import type { CommentDto, VideoReaction } from "@memory-shoebox/shared";
import { clockLabel } from "@/system/labelHelpers/labelHelpers";

/** One comment or reaction that can be reached on the timeline. */
export type VideoMoment = {
  id: string;
  atSeconds: number;
  label: string;
  glyph: string;
  authorName: string;
  body?: string;
  reaction?: VideoReaction;
};
/** Nearby marks share one focus target and open into their full list. */
export type VideoMomentGroup = {
  atSeconds: number;
  leftPercent: number;
  moments: VideoMoment[];
};

/** Places top-level timed comments and reactions into bounded-width groups. */
export function makeMomentGroupsFromEvents(
  options: Readonly<{
    comments: readonly CommentDto[];
    reactions: readonly VideoReaction[];
    duration: number;
    width?: number;
  }>,
): VideoMomentGroup[] {
  if (!Number.isFinite(options.duration) || options.duration <= 0) {
    return [];
  }
  const comments = options.comments.flatMap((comment): VideoMoment[] => {
    return comment.parentCommentId !== null || comment.atSeconds === null
      ? []
      : [
          {
            id: comment.commentId,
            atSeconds: comment.atSeconds,
            label: `${comment.author.displayName}: ${comment.body}`,
            glyph: getInitialsFromDisplayName(comment.author.displayName),
            authorName: comment.author.displayName,
            body: comment.body,
          },
        ];
  });
  const reactions = options.reactions.map((reaction): VideoMoment => {
    return {
      id: reaction.reactionId,
      atSeconds: reaction.atSeconds,
      label: `${reaction.author.displayName} reacted ${reaction.emoji}`,
      glyph: reaction.emoji,
      authorName: reaction.author.displayName,
      reaction,
    };
  });
  const railWidth = Math.max(70, (options.width || 320) - 18);
  return [...comments, ...reactions]
    .sort((left, right) => {
      return left.atSeconds - right.atSeconds;
    })
    .reduce<VideoMomentGroup[]>((groups, moment) => {
      const group = groups.at(-1);
      const pixelPosition = Math.min(
        railWidth - 35,
        Math.max(35, (moment.atSeconds / options.duration) * railWidth),
      );
      if (
        group !== undefined &&
        pixelPosition - (group.leftPercent / 100) * railWidth < 76
      ) {
        group.moments.push(moment);
      } else {
        groups.push({
          atSeconds: moment.atSeconds,
          leftPercent: (pixelPosition / railWidth) * 100,
          moments: [moment],
        });
      }
      return groups;
    }, []);
}

/** Playback crossings exclude seeks, backward jumps and invalid times. */
export function getCrossedReactions(
  options: Readonly<{
    reactions: readonly VideoReaction[];
    previousTime: number;
    currentTime: number;
    isSeeking: boolean;
  }>,
): VideoReaction[] {
  if (options.isSeeking || options.currentTime <= options.previousTime) {
    return [];
  }
  return options.reactions.filter((reaction) => {
    return (
      reaction.atSeconds > options.previousTime &&
      reaction.atSeconds <= options.currentTime
    );
  });
}

/** Announces a moment's actual author and position. */
export function videoMomentLabel(moment: Readonly<VideoMoment>): string {
  return `Seek to ${clockLabel(moment.atSeconds)}: ${moment.label}`;
}
