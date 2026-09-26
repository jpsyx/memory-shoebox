import { Button, Progress, Stack } from "@mantine/core";
import {
  IconAlertCircle,
  IconCheck,
  IconPhotoPlus,
  IconRefresh,
} from "@tabler/icons-react";
import { useState } from "react";
import {
  UPLOAD_FILES,
  UPLOAD_FILES_SETTLED,
  type UploadFile,
} from "@/data/fixtures";
import { Banner, Sheet, TopBar } from "@/system/Chrome";
import { ChipRow } from "@/system/Chip";
import { ICON_PROPS, ICON_PROPS_SMALL } from "@/system/icons";
import { VisibilityControl, type VisibilityMode } from "@/system/Visibility";
import { LabelText, Lede, Prose, Stat } from "@/system/typography";
import classes from "@/system/system.module.css";
import type { Surface } from "@/surfaces/registry";

type UploadState =
  | "select"
  | "chosen"
  | "visibility"
  | "sending"
  | "partial"
  | "done";

const STATE_WORD: Record<UploadFile["state"], string> = {
  waiting: "Waiting",
  sending: "Sending",
  done: "Up",
  failed: "Did not arrive",
  refused: "Not a photo",
};

function FileRow({ file }: { readonly file: UploadFile }) {
  return (
    <div className={classes.fileRow}>
      {file.media === null ? (
        <span className={`${classes.fileThumb} ${classes.fileThumbEmpty}`} />
      ) : (
        <span className={classes.fileThumb}>
          <img src={file.media.thumb} alt="" loading="lazy" />
        </span>
      )}
      <span>
        <span className={classes.fileName}>{file.name}</span>
        <br />
        <span className={classes.fileMeta}>
          {file.size}
          {file.state === "sending" ? ` · ${file.percent}%` : ""}
        </span>
      </span>
      <span className={classes.fileState}>{STATE_WORD[file.state]}</span>
      {file.problem === undefined ? null : (
        <span className={classes.fileProblem}>
          <IconAlertCircle {...ICON_PROPS_SMALL} />
          {file.problem}
        </span>
      )}
    </div>
  );
}

function UploadSurface({ state }: { readonly state: UploadState }) {
  const [mode, setMode] = useState<VisibilityMode>(
    state === "visibility" ? "except" : "everyone",
  );
  const [subjects, setSubjects] = useState<readonly string[]>(
    state === "visibility" ? ["grp-cousins"] : [],
  );

  const hasChosen = state !== "select";
  const files =
    state === "partial" || state === "done"
      ? UPLOAD_FILES_SETTLED
      : state === "sending"
        ? UPLOAD_FILES.slice(0, 4)
        : UPLOAD_FILES.slice(0, 4).map((file) => {
            return { ...file, state: "waiting" as const, percent: 0 };
          });

  return (
    <>
      <TopBar back="Back to the pile" />
      <main className={classes.pageWide}>
        <Stack gap="lg">
          {state === "done" ? (
            <Stack gap="md">
              <Lede>210 up, on 14 September.</Lede>
              <div className={classes.uploadFigureRow}>
                <Stat figure="210" label="Went up" />
                <Stat figure="1" label="Did not arrive" />
                <Stat figure="1" label="Refused" />
                <Stat figure="8" label="People told" />
              </div>
              <Prose onPanel>
                One email has gone to the eight people who can see at least one
                of them. Not two hundred and ten emails: one.
              </Prose>
              <ChipRow>
                <Button>See them on the pile</Button>
                <Button variant="panel">Add another day</Button>
              </ChipRow>
            </Stack>
          ) : (
            <Stack gap="md">
              <Lede>
                {state === "sending"
                  ? "Putting them up."
                  : state === "partial"
                    ? "210 up. Two did not."
                    : "Put the whole day up."}
              </Lede>
              <Prose onPanel>
                {state === "sending"
                  ? "Four point eight gigabytes of a Monday morning. They go up in the background, and one email goes out when the last one lands."
                  : state === "partial"
                    ? "The 210 that arrived are on the day already and the circle has been told about them. The two below are the whole of what is missing."
                    : "Not the best six. All of it: the blurry ones, the twelve nearly identical ones, the video nobody will watch twice. Choosing between them is the work this is meant to save you, and the software collapses the runs so they do not bury the day."}
              </Prose>
            </Stack>
          )}

          {state === "select" ? (
            <button type="button" className={classes.dropzone}>
              <IconPhotoPlus size="3rem" stroke={1.5} />
              <span className={classes.lede}>Drop a day here</span>
              <Prose onPanel>
                Or choose them from this device. Photos and videos, any number,
                any size. Capture dates come off the files, so they land on the
                days they happened.
              </Prose>
            </button>
          ) : null}

          {hasChosen ? (
            <Sheet wide label="What is going up">
              <Stack gap="sm">
                <LabelText component="h2">
                  {state === "sending"
                    ? "212 chosen, 62 up so far"
                    : state === "partial"
                      ? "212 chosen, 210 up, 2 did not"
                      : state === "done"
                        ? "What happened"
                        : "212 chosen"}
                </LabelText>

                {state === "sending" ? (
                  <Stack gap="xs">
                    <div className={classes.uploadFigureRow}>
                      <span className={classes.uploadFigure}>62</span>
                      <span className={classes.fileMeta}>
                        of 212 · 1.4 GB of 4.8 GB
                      </span>
                    </div>
                    <Progress value={29} />
                    <Prose>
                      You can close this. They keep going, and the email goes
                      out when the last one lands.
                    </Prose>
                  </Stack>
                ) : null}

                {state === "partial" ? (
                  <div className={classes.uploadFigureRow}>
                    <Stat figure="210" label="Went up" />
                    <Stat figure="1" label="Did not arrive" />
                    <Stat figure="1" label="Refused" />
                  </div>
                ) : null}

                <div className={classes.fileList}>
                  {files.map((file) => {
                    return <FileRow key={file.id} file={file} />;
                  })}
                  <div className={classes.fileRow}>
                    <span />
                    <span className={classes.fileMeta}>
                      {state === "partial" || state === "done"
                        ? "and 207 more that went up without trouble"
                        : "and 206 more from the same morning"}
                    </span>
                    <span />
                  </div>
                </div>

                {state === "partial" ? (
                  <>
                    <Banner icon={<IconAlertCircle {...ICON_PROPS} />}>
                      <b>Two of the 212 are not up.</b> One lost its connection
                      partway through and can be tried again. One is a PDF,
                      which this is not for. The other 210 are up and nobody is
                      waiting on these.
                    </Banner>
                    <ChipRow>
                      <Button leftSection={<IconRefresh {...ICON_PROPS} />}>
                        Try the one that dropped
                      </Button>
                      <Button variant="default">
                        Leave it, the rest are up
                      </Button>
                    </ChipRow>
                  </>
                ) : null}

                {state === "done" ? (
                  <Banner icon={<IconCheck {...ICON_PROPS} />}>
                    <b>Everything that could go up went up.</b> The 45 frames
                    taken between 06:41 and 06:44 were collapsed into one stack,
                    so they sit as a single thing on the day rather than as
                    forty-five.
                  </Banner>
                ) : null}
              </Stack>
            </Sheet>
          ) : null}

          {state === "done" ? null : (
            <Sheet wide label="Who can see these">
              <VisibilityControl
                mode={mode}
                onModeChange={setMode}
                subjects={subjects}
                onSubjectsChange={setSubjects}
              />
            </Sheet>
          )}

          {state === "select" ||
          state === "chosen" ||
          state === "visibility" ? (
            <ChipRow>
              <Button disabled={state === "select"}>
                {state === "select" ? "Put them up" : "Put 212 up"}
              </Button>
              <Button variant="panel" disabled={state === "select"}>
                Cancel
              </Button>
            </ChipRow>
          ) : null}
        </Stack>
      </main>
    </>
  );
}

export const uploadSurface: Surface = {
  id: "upload",
  number: 8,
  title: "Upload",
  who: "uploaders and admins",
  group: "member",
  blurb:
    "Where dump it all either survives or quietly becomes curation. The product's promise lives on this surface.",
  states: [
    {
      id: "select",
      label: "Before choosing",
      note: "The same ghost frame the empty archive uses. The copy asks for everything by name, because asking for the best six is the failure mode.",
      render: () => {
        return <UploadSurface state="select" />;
      },
    },
    {
      id: "chosen",
      label: "Chosen, visibility pre-filled",
      note: "The visibility step is already answered with Everyone. It is present and skippable, which is the whole design of this surface.",
      render: () => {
        return <UploadSurface state="chosen" />;
      },
    },
    {
      id: "visibility",
      label: "Changing who can see",
      note: "The one uploader in ten who wants to keep a batch back gets the full control, in the flow rather than buried in a setting.",
      render: () => {
        return <UploadSurface state="visibility" />;
      },
    },
    {
      id: "sending",
      label: "In progress",
      note: "One figure and one bar. It says plainly that you can close the page, because a parent with a newborn will.",
      render: () => {
        return <UploadSurface state="sending" />;
      },
    },
    {
      id: "partial",
      label: "Partial failure",
      note: "Names what failed, why, and what is unaffected. A batch that half-worked must never read as a batch that failed.",
      render: () => {
        return <UploadSurface state="partial" />;
      },
    },
    {
      id: "done",
      label: "Done",
      note: "Counts as the interface, and the one email the whole batch sent. Also says the burst collapsed, so the uploader learns the idea.",
      render: () => {
        return <UploadSurface state="done" />;
      },
    },
  ],
};
