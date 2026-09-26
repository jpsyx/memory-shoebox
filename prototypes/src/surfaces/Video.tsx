import { Button, Stack } from "@mantine/core";
import { IconPinned } from "@tabler/icons-react";
import { useRef, useState } from "react";
import { VIDEO_NOTES } from "@/data/fixtures";
import { CLIP } from "@/data/media";
import { Sheet, TopBar } from "@/system/Chrome";
import { Chip, ChipRow } from "@/system/Chip";
import { ICON_PROPS } from "@/system/icons";
import { Composer, NoteRow, Talk, formatClock } from "@/system/Talk";
import { VideoFrame, type TransportMark } from "@/system/VideoFrame";
import { LabelText, Prose } from "@/system/typography";
import classes from "@/system/system.module.css";
import type { Surface } from "@/surfaces/registry";

type VideoState = "paused" | "playing" | "pinning" | "quiet";

const MARKS: readonly TransportMark[] = VIDEO_NOTES.filter((note) => {
  return note.atSeconds !== undefined;
}).map((note) => {
  return {
    id: note.id,
    atSeconds: note.atSeconds ?? 0,
    label: `Jump to ${note.author}'s note at ${formatClock(note.atSeconds ?? 0)}`,
  };
});

function VideoSurface({ state }: { readonly state: VideoState }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [pendingAt, setPendingAt] = useState<number | undefined>(
    state === "pinning" ? 18 : undefined,
  );

  const notes = state === "quiet" ? [] : VIDEO_NOTES;
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
          <Sheet label="Pinning a note">
            <Stack gap="sm">
              <LabelText component="h2">Notes on a moment</LabelText>
              <Prose>
                A note can stand at a moment rather than at the bottom. Press
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
                    ? "Pin a note to this moment"
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
                note.
              </Prose>
              <Composer goesTo="Goes to all eight" />
            </Talk>
          ) : (
            <Talk
              heading={`${notes.length} notes, ${marks.length} pinned to a moment`}
            >
              {notes.map((note) => {
                return <NoteRow key={note.id} note={note} onSeek={seek} />;
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
    "The same frame, standing on a measured transport bar, with notes that can be pinned to the moment they are about.",
  states: [
    {
      id: "paused",
      label: "Paused",
      note: "Two pinned notes stand as marks on a 9px tick rule. Each 3px mark carries an invisible 44x44 pointer target.",
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
      label: "Pinning a note",
      note: "The mark being placed is an outline until the note lands. Pressing the bar anywhere moves it, which is the whole interaction.",
      render: () => {
        return <VideoSurface state="pinning" />;
      },
    },
    {
      id: "quiet",
      label: "No notes yet",
      note: "An empty thread still has to explain that a note can stand at a moment, because nobody guesses that feature.",
      render: () => {
        return <VideoSurface state="quiet" />;
      },
    },
  ],
};
