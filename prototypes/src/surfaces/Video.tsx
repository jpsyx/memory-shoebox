import { Button, Stack } from "@mantine/core";
import { IconPinned } from "@tabler/icons-react";
import { useRef, useState } from "react";
import { VIDEO_COMMENTS } from "@/data/fixtures";
import { CLIP } from "@/data/media";
import { Sheet, TopBar } from "@/system/Chrome";
import { Chip, ChipRow } from "@/system/Chip";
import { ICON_PROPS } from "@/system/icons";
import { CommentRow, Composer, Talk, formatClock } from "@/system/Talk";
import { VideoFrame, type TransportMark } from "@/system/VideoFrame";
import { LabelText, Prose } from "@/system/typography";
import classes from "@/system/system.module.css";
import type { Surface } from "@/surfaces/registry";

type VideoState = "paused" | "playing" | "pinning" | "quiet";

const MARKS: readonly TransportMark[] = VIDEO_COMMENTS.filter((comment) => {
  return comment.atSeconds !== undefined;
}).map((comment) => {
  return {
    id: comment.id,
    atSeconds: comment.atSeconds ?? 0,
    label: `Jump to ${comment.author}'s comment at ${formatClock(comment.atSeconds ?? 0)}`,
  };
});

function VideoSurface({ state }: { readonly state: VideoState }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [pendingAt, setPendingAt] = useState<number | undefined>(
    state === "pinning" ? 18 : undefined,
  );

  const comments = state === "quiet" ? [] : VIDEO_COMMENTS;
  const marks = state === "quiet" ? [] : MARKS;

  const seek = (seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = seconds;
      void videoRef.current.play().catch(() => {
        /* Autoplay policy. The seek still lands. */
      });
    }
  };

  return (
    <>
      <TopBar back="Back to 14 September" />
      <main className={classes.viewer}>
        <div>
          <VideoFrame
            media={CLIP}
            marks={marks}
            pendingAt={pendingAt}
            videoRef={videoRef}
            startPlaying={state === "playing"}
            onScrub={
              state === "pinning"
                ? (seconds) => {
                    return setPendingAt(seconds);
                  }
                : undefined
            }
          />
          <p className={classes.viewerMeta}>
            <span>14 September 2026, 7:02 pm</span>
            <span>0:22</span>
            <span>Uploaded by Mamá</span>
          </p>
          <Sheet label="Pinning a comment">
            <Stack gap="sm">
              <LabelText component="h2">Comments on a moment</LabelText>
              <Prose>
                A comment can stand at a moment rather than at the bottom. Press
                the bar where it happens, write it, and it shows up there for
                everybody: on the scrubber and in the thread with the time
                attached.
              </Prose>
              <ChipRow>
                <Button
                  variant={pendingAt === undefined ? "default" : "filled"}
                  leftSection={<IconPinned {...ICON_PROPS} />}
                  onClick={() => {
                    return setPendingAt(
                      pendingAt === undefined
                        ? (videoRef.current?.currentTime ?? 18)
                        : undefined,
                    );
                  }}
                >
                  {pendingAt === undefined
                    ? "Pin a comment to this moment"
                    : `Pinned at ${formatClock(pendingAt)}`}
                </Button>
              </ChipRow>
            </Stack>
          </Sheet>
        </div>

        <Stack gap="md">
          {state === "quiet" ? (
            <Talk heading="Nothing said yet">
              <Prose>
                Nobody has written on this one. Anything said here can stand at
                a moment in the video, or just at the bottom like an ordinary
                comment.
              </Prose>
              <Composer goesTo="Goes to all eight" />
            </Talk>
          ) : (
            <Talk
              heading={`${comments.length} comments, ${marks.length} pinned to a moment`}
            >
              {comments.map((comment) => {
                return (
                  <CommentRow
                    key={comment.id}
                    comment={comment}
                    onSeek={seek}
                  />
                );
              })}
              <Composer
                goesTo="Goes to all eight"
                pinnedAt={pendingAt}
                onClearPin={() => {
                  return setPendingAt(undefined);
                }}
              />
            </Talk>
          )}

          <Sheet label="What is in this one">
            <LabelText component="h2">In this one</LabelText>
            <Stack gap="sm" mt="sm">
              <ChipRow>
                <Chip>Mateo</Chip>
                <Chip>Papá</Chip>
              </ChipRow>
              <ChipRow>
                <Chip>hospital</Chip>
                <Chip>sleeping</Chip>
              </ChipRow>
            </Stack>
          </Sheet>
        </Stack>
      </main>
    </>
  );
}

export const videoSurface: Surface = {
  id: "video",
  number: 4,
  title: "One video",
  who: "every member",
  group: "member",
  blurb:
    "The same frame, standing on a measured transport bar, with comments that can be pinned to the moment they are about.",
  states: [
    {
      id: "paused",
      label: "Paused",
      note: "Two pinned comments stand as marks on a 9px tick rule. Each 3px mark carries an invisible 44x44 pointer target.",
      render: () => {
        return <VideoSurface state="paused" />;
      },
    },
    {
      id: "playing",
      label: "Playing",
      note: "The played bar is ink, not accent: the accent means unseen and nothing else. The clock is tabular so it does not shuffle.",
      render: () => {
        return <VideoSurface state="playing" />;
      },
    },
    {
      id: "pinning",
      label: "Pinning a comment",
      note: "The mark being placed is an outline until the comment lands. Pressing the bar anywhere moves it, which is the whole interaction.",
      render: () => {
        return <VideoSurface state="pinning" />;
      },
    },
    {
      id: "quiet",
      label: "No comments yet",
      note: "An empty thread still has to explain that a comment can stand at a moment, because nobody guesses that feature.",
      render: () => {
        return <VideoSurface state="quiet" />;
      },
    },
  ],
};
