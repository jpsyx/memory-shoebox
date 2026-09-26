import { Button, Modal, Progress, Stack, TextInput } from "@mantine/core";
import {
  IconAlertCircle,
  IconCheck,
  IconFlag,
  IconPhotoPlus,
  IconPlus,
  IconRefresh,
  IconTag,
  IconUser,
  IconX,
} from "@tabler/icons-react";
import { useState, type ReactNode } from "react";
import {
  MILESTONES,
  PEOPLE,
  TAGS,
  UPLOAD_DAYS,
  UPLOAD_FILES,
  UPLOAD_FILES_SETTLED,
  UPLOAD_TOTAL,
  type Milestone,
  type UploadDay,
  type UploadFile,
} from "@/data/fixtures";
import { Banner, Sheet, TopBar } from "@/system/Chrome";
import { Chip, ChipRow } from "@/system/Chip";
import { ICON_PROPS, ICON_PROPS_SMALL } from "@/system/icons";
import { Print } from "@/system/Pile";
import { VisibilityControl, type VisibilityMode } from "@/system/Visibility";
import { LabelText, Lede, Prose, Stat } from "@/system/typography";
import classes from "@/system/system.module.css";
import type { Surface } from "@/surfaces/registry";

type UploadState =
  | "select"
  | "days"
  | "selection"
  | "tag"
  | "person"
  | "milestone"
  | "milestone-new"
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

/** The ids a state arrives with already ticked, so a bulk action has a subject. */
const PRE_SELECTED: readonly UploadState[] = [
  "selection",
  "tag",
  "person",
  "milestone",
  "milestone-new",
];

function everyItemId(): readonly string[] {
  return UPLOAD_DAYS.flatMap((day) => {
    return day.items.map((item) => {
      return item.id;
    });
  });
}

function milestoneById(id: string | undefined): Milestone | undefined {
  return MILESTONES.find((milestone) => {
    return milestone.id === id;
  });
}

/* ------------------------------------------------------------ one day --- */

function UploadDayGroup({
  day,
  selected,
  onToggleItem,
  onSelectDay,
  onAssignDay,
}: {
  readonly day: UploadDay;
  readonly selected: readonly string[];
  readonly onToggleItem: (id: string) => void;
  readonly onSelectDay: (day: UploadDay) => void;
  readonly onAssignDay: (day: UploadDay) => void;
}): ReactNode {
  const milestone = milestoneById(day.milestoneId);
  const selectedHere = day.items.filter((item) => {
    return selected.includes(item.id);
  }).length;

  return (
    <div className={classes.uploadDay}>
      <div className={classes.uploadDayHead}>
        <span className={classes.uploadDayFigure}>{day.dayNumber}</span>
        <span className={classes.uploadDayMonth}>
          {day.month} {day.year}
        </span>
        <span className={classes.uploadDayCount}>
          {day.totalCount.toLocaleString("en-GB")}
        </span>
        <span className={classes.uploadDayEnd}>
          {selectedHere > 0 ? (
            <span className={classes.fileMeta}>{selectedHere} ticked</span>
          ) : null}
          <Button
            variant="default"
            size="sm"
            onClick={() => {
              return onSelectDay(day);
            }}
          >
            Tick all {day.totalCount}
          </Button>
        </span>
      </div>

      <div className={classes.uploadDayMilestone}>
        {milestone === undefined ? (
          <>
            <span className={classes.fileMeta}>No milestone</span>
            <Button
              variant="default"
              size="sm"
              leftSection={<IconFlag {...ICON_PROPS_SMALL} />}
              onClick={() => {
                return onAssignDay(day);
              }}
            >
              Put this day under one
            </Button>
          </>
        ) : (
          <>
            <IconFlag {...ICON_PROPS_SMALL} />
            <b>{milestone.name}</b>
            <span className={classes.fileMeta}>
              the whole of {day.dayNumber} {day.month}
            </span>
            <Button
              variant="default"
              size="sm"
              onClick={() => {
                return onAssignDay(day);
              }}
            >
              Change
            </Button>
          </>
        )}
      </div>

      <div className={`${classes.pile} ${classes.uploadDayBody}`}>
        {day.items.map((item, index) => {
          return (
            <Print
              key={item.id}
              media={item}
              seed={index}
              selected={selected.includes(item.id)}
              onClick={() => {
                return onToggleItem(item.id);
              }}
            />
          );
        })}
      </div>
      {day.totalCount > day.items.length ? (
        <Prose>
          and {day.totalCount - day.items.length} more from the same day.
          Ticking the day takes all {day.totalCount} of them, not just the ones
          on screen.
        </Prose>
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------- file lists --- */

function FileRow({ file }: { readonly file: UploadFile }): ReactNode {
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

/* --------------------------------------------------------- the surface --- */

function UploadSurface({ state }: { readonly state: UploadState }): ReactNode {
  const [selected, setSelected] = useState<readonly string[]>(() => {
    return PRE_SELECTED.includes(state) ? everyItemId().slice(0, 12) : [];
  });
  const [openAction, setOpenAction] = useState<
    "tag" | "person" | "milestone" | undefined
  >(
    state === "tag"
      ? "tag"
      : state === "person"
        ? "person"
        : state === "milestone" || state === "milestone-new"
          ? "milestone"
          : undefined,
  );
  const [isCreatingMilestone, setIsCreatingMilestone] = useState(
    state === "milestone-new",
  );
  const [chosenMilestone, setChosenMilestone] = useState<string | undefined>(
    "mil-home",
  );
  const [mode, setMode] = useState<VisibilityMode>(
    state === "visibility" ? "except" : "everyone",
  );
  const [subjects, setSubjects] = useState<readonly string[]>(
    state === "visibility" ? ["grp-cousins"] : [],
  );

  const isChoosing =
    state === "days" ||
    state === "selection" ||
    state === "tag" ||
    state === "person" ||
    state === "milestone" ||
    state === "milestone-new" ||
    state === "visibility";
  const isSettled = state === "partial" || state === "done";
  const files =
    state === "done"
      ? UPLOAD_FILES_SETTLED.filter((file) => {
          return file.state === "done";
        })
      : state === "partial"
        ? UPLOAD_FILES_SETTLED
        : UPLOAD_FILES.slice(0, 4);

  const toggleItem = (id: string) => {
    setSelected((current) => {
      return current.includes(id)
        ? current.filter((candidate) => {
            return candidate !== id;
          })
        : [...current, id];
    });
  };

  const selectDay = (day: UploadDay) => {
    setSelected((current) => {
      const ids = day.items.map((item) => {
        return item.id;
      });
      return [
        ...current.filter((id) => {
          return !ids.includes(id);
        }),
        ...ids,
      ];
    });
  };

  return (
    <>
      <TopBar back="Back to the pile" />

      {selected.length > 0 && isChoosing ? (
        <div className={classes.selectionBar}>
          <span className={classes.selectionCount}>
            {selected.length}
            <small>ticked</small>
          </span>
          <button
            type="button"
            className={classes.selectionButton}
            onClick={() => {
              return setOpenAction("tag");
            }}
          >
            <IconTag {...ICON_PROPS_SMALL} />
            Add a tag
          </button>
          <button
            type="button"
            className={classes.selectionButton}
            onClick={() => {
              return setOpenAction("person");
            }}
          >
            <IconUser {...ICON_PROPS_SMALL} />
            Tag somebody
          </button>
          <button
            type="button"
            className={classes.selectionButton}
            onClick={() => {
              return setOpenAction("milestone");
            }}
          >
            <IconFlag {...ICON_PROPS_SMALL} />
            Put under a milestone
          </button>
          <span className={classes.selectionEnd}>
            <button
              type="button"
              className={classes.selectionButton}
              onClick={() => {
                return setSelected(everyItemId());
              }}
            >
              Tick everything
            </button>
            <button
              type="button"
              className={classes.selectionButton}
              onClick={() => {
                return setSelected([]);
              }}
            >
              <IconX {...ICON_PROPS_SMALL} />
              Untick
            </button>
          </span>
        </div>
      ) : null}

      <main className={classes.pageWide}>
        <Stack gap="lg">
          {state === "done" ? (
            <Stack gap="md">
              <Lede>264 up, across three days.</Lede>
              <div className={classes.uploadFigureRow}>
                <Stat figure="264" label="Went up" />
                <Stat figure="3" label="Days" />
                <Stat figure="2" label="Milestones" />
                <Stat figure="8" label="People told" />
              </div>
              <Prose onPanel>
                One email has gone to the eight people who can see at least one
                of them. Not two hundred and sixty-four emails, and not one per
                day: one.
              </Prose>
              <ChipRow>
                <Button>See them on the pile</Button>
                <Button variant="panel">Upload more</Button>
              </ChipRow>
            </Stack>
          ) : (
            <Stack gap="md">
              <Lede>
                {state === "sending"
                  ? "Putting them up."
                  : state === "partial"
                    ? "262 up. Two did not."
                    : "Put it all up."}
              </Lede>
              <Prose onPanel>
                {state === "sending"
                  ? "Five point two gigabytes across three days. They go up in the background, and one email goes out when the last one lands."
                  : state === "partial"
                    ? "The 262 that arrived are on their days already and the circle has been told about them. The two below are the whole of what is missing."
                    : "Not the best six. All of it: the blurry ones, the twelve nearly identical ones, the videos nobody will watch twice. Choosing between them is the work this is meant to save you, and the software sorts them onto the days they happened."}
              </Prose>
            </Stack>
          )}

          {state === "select" ? (
            <button type="button" className={classes.dropzone}>
              <IconPhotoPlus size="3rem" stroke={1.5} />
              <span className={classes.lede}>Drop photos and videos here</span>
              <Prose onPanel>
                Or choose them from this device. Any number, any size, any
                number of days. Capture dates come off the files themselves, so
                a phone nobody has emptied since the hospital lands on the weeks
                it actually covers rather than on today.
              </Prose>
            </button>
          ) : null}

          {isChoosing ? (
            <>
              <Sheet wide label="What is going up">
                <Stack gap="md">
                  <div className={classes.uploadFigureRow}>
                    <Stat
                      figure={UPLOAD_TOTAL.toLocaleString("en-GB")}
                      label="Chosen"
                    />
                    <Stat figure={String(UPLOAD_DAYS.length)} label="Days" />
                    <Stat figure="5.2 GB" label="To send" />
                    <Stat figure="2" label="Milestones" />
                  </div>
                  <Banner>
                    <b>This is three weeks, not a day.</b> The batch is grouped
                    by the day each file was captured on, which is where each
                    one will land in the archive. Nothing here is one post.
                  </Banner>
                  <Prose>
                    Press a print to tick it. Ticking several gives you the bar
                    at the top: one tag, one person or one milestone applied to
                    the lot, instead of the same thing done two hundred times.
                  </Prose>
                </Stack>
              </Sheet>

              <Sheet wide label="The days in this batch">
                {UPLOAD_DAYS.map((day) => {
                  return (
                    <UploadDayGroup
                      key={day.id}
                      day={day}
                      selected={selected}
                      onToggleItem={toggleItem}
                      onSelectDay={selectDay}
                      onAssignDay={(target) => {
                        selectDay(target);
                        setOpenAction("milestone");
                      }}
                    />
                  );
                })}
              </Sheet>

              <Sheet wide label="Who can see these">
                <VisibilityControl
                  heading="Who can see all of these"
                  mode={mode}
                  onModeChange={setMode}
                  subjects={subjects}
                  onSubjectsChange={setSubjects}
                />
              </Sheet>

              <ChipRow>
                <Button>Put {UPLOAD_TOTAL.toLocaleString("en-GB")} up</Button>
                <Button variant="panel">Cancel</Button>
              </ChipRow>
            </>
          ) : null}

          {state === "select" ? (
            <>
              <Sheet wide label="Who can see these">
                <VisibilityControl
                  heading="Who can see all of these"
                  mode={mode}
                  onModeChange={setMode}
                  subjects={subjects}
                  onSubjectsChange={setSubjects}
                />
              </Sheet>
              <ChipRow>
                <Button disabled>Put them up</Button>
                <Button variant="panel" disabled>
                  Cancel
                </Button>
              </ChipRow>
            </>
          ) : null}

          {state === "sending" || isSettled ? (
            <Sheet wide label="What happened">
              <Stack gap="sm">
                <LabelText component="h2">
                  {state === "sending"
                    ? "264 chosen, 62 up so far"
                    : state === "partial"
                      ? "264 chosen, 262 up, 2 did not"
                      : "What happened"}
                </LabelText>

                {state === "sending" ? (
                  <Stack gap="xs">
                    <div className={classes.uploadFigureRow}>
                      <span className={classes.uploadFigure}>62</span>
                      <span className={classes.fileMeta}>
                        of 264 · 1.4 GB of 5.2 GB · on 14 September
                      </span>
                    </div>
                    <Progress value={23} />
                    <Prose>
                      You can close this. They keep going, and the email goes
                      out when the last one lands.
                    </Prose>
                  </Stack>
                ) : null}

                {state === "partial" ? (
                  <div className={classes.uploadFigureRow}>
                    <Stat figure="262" label="Went up" />
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
                      {state === "done"
                        ? "and 261 more, across three days"
                        : state === "partial"
                          ? "and 259 more that went up without trouble"
                          : "and 260 more, across three days"}
                    </span>
                    <span />
                  </div>
                </div>

                {state === "partial" ? (
                  <>
                    <Banner icon={<IconAlertCircle {...ICON_PROPS} />}>
                      <b>Two of the 264 are not up.</b> One lost its connection
                      partway through and can be tried again. One is a PDF,
                      which this is not for. The other 262 are up, on all three
                      days, and nobody is waiting on these.
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
                    so they sit as a single thing on 14 September rather than as
                    forty-five. Two milestones were filled: <b>Mateo is born</b>{" "}
                    and <b>Home from the hospital</b>.
                  </Banner>
                ) : null}
              </Stack>
            </Sheet>
          ) : null}
        </Stack>
      </main>

      {/* --- Bulk: one tag on the lot --- */}
      <Modal
        opened={openAction === "tag"}
        onClose={() => {
          return setOpenAction(undefined);
        }}
        title={`Tag ${selected.length} at once`}
        size="lg"
      >
        <Stack gap="md">
          <TextInput
            label="A new tag"
            description="Free text. One word usually beats a sentence, because a tag is something you will type again later."
            placeholder="hospital"
          />
          <div>
            <LabelText component="h3">Or one you have used before</LabelText>
            <ChipRow>
              {TAGS.slice(0, 8).map((tag) => {
                return (
                  <Chip key={tag.id}>
                    {tag.name}{" "}
                    <span className={classes.tabular}>
                      {tag.itemCount.toLocaleString("en-GB")}
                    </span>
                  </Chip>
                );
              })}
            </ChipRow>
          </div>
          <Prose>
            The tag goes on all {selected.length}, and on nothing else. Anything
            already tagged keeps what it has.
          </Prose>
          <ChipRow>
            <Button
              onClick={() => {
                return setOpenAction(undefined);
              }}
            >
              Tag all {selected.length}
            </Button>
            <Button
              variant="default"
              onClick={() => {
                return setOpenAction(undefined);
              }}
            >
              Cancel
            </Button>
          </ChipRow>
        </Stack>
      </Modal>

      {/* --- Bulk: one person on the lot --- */}
      <Modal
        opened={openAction === "person"}
        onClose={() => {
          return setOpenAction(undefined);
        }}
        title={`Who is in these ${selected.length}?`}
        size="lg"
      >
        <Stack gap="md">
          <ChipRow>
            {PEOPLE.slice(0, 8).map((person) => {
              return <Chip key={person.id}>{person.name}</Chip>;
            })}
          </ChipRow>
          <TextInput
            label="Somebody who is not on that list"
            description="They do not need an account. A great-grandmother worth tracking in the archive never has to have one, and inviting her later joins the two up."
            placeholder="Bisabuela Elena"
          />
          <Banner>
            <b>A people tag is never a key.</b> Saying who is in a photograph
            does not let them open it. Who can see these is the control further
            down the page, and it is a separate decision on purpose.
          </Banner>
          <ChipRow>
            <Button
              onClick={() => {
                return setOpenAction(undefined);
              }}
            >
              Tag all {selected.length}
            </Button>
            <Button
              variant="default"
              onClick={() => {
                return setOpenAction(undefined);
              }}
            >
              Cancel
            </Button>
          </ChipRow>
        </Stack>
      </Modal>

      {/* --- Bulk: a milestone, existing or made here --- */}
      <Modal
        opened={openAction === "milestone"}
        onClose={() => {
          setOpenAction(undefined);
          setIsCreatingMilestone(false);
        }}
        title={`Put ${selected.length} under a milestone`}
        size="lg"
      >
        <Stack gap="md">
          {isCreatingMilestone ? (
            <>
              <TextInput
                label="What happened"
                placeholder="Mateo's first night at home"
                defaultValue="Mateo's first night at home"
              />
              <TextInput
                type="date"
                label="When"
                description="Taken from the capture date of what you have ticked. Change it if the occasion is not the same day as the photographs."
                defaultValue="2026-09-17"
              />
              <TextInput
                label="A line about it"
                placeholder="He slept four hours, which we are told is good."
              />
              <Prose>
                It appears in the timeline on that date straight away, carrying
                these {selected.length}. You can attach more to it later.
              </Prose>
              <ChipRow>
                <Button
                  onClick={() => {
                    setIsCreatingMilestone(false);
                    setOpenAction(undefined);
                  }}
                >
                  Create it and attach {selected.length}
                </Button>
                <Button
                  variant="default"
                  onClick={() => {
                    return setIsCreatingMilestone(false);
                  }}
                >
                  Back to the list
                </Button>
              </ChipRow>
            </>
          ) : (
            <>
              <div>
                {MILESTONES.map((milestone) => {
                  return (
                    <button
                      key={milestone.id}
                      type="button"
                      className={`${classes.milestoneOption} ${
                        chosenMilestone === milestone.id
                          ? classes.milestoneOptionOn
                          : ""
                      }`}
                      aria-pressed={chosenMilestone === milestone.id}
                      onClick={() => {
                        return setChosenMilestone(milestone.id);
                      }}
                    >
                      <span>
                        <span className={classes.milestoneOptionName}>
                          {milestone.name}
                        </span>
                        <br />
                        <span className={classes.milestoneOptionMeta}>
                          {milestone.happenedOn} ·{" "}
                          {milestone.itemCount === 0
                            ? "nothing attached yet"
                            : `${milestone.itemCount} attached`}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>

              <Button
                variant="default"
                leftSection={<IconPlus {...ICON_PROPS} />}
                onClick={() => {
                  return setIsCreatingMilestone(true);
                }}
              >
                Create a new milestone here
              </Button>

              <Prose>
                One upload is not one milestone. This batch already covers two,
                and a Tuesday in between that is not an occasion at all.
                Anything left without one simply sits on its own day.
              </Prose>

              <ChipRow>
                <Button
                  onClick={() => {
                    return setOpenAction(undefined);
                  }}
                >
                  Attach {selected.length}
                </Button>
                <Button
                  variant="default"
                  onClick={() => {
                    return setOpenAction(undefined);
                  }}
                >
                  Cancel
                </Button>
              </ChipRow>
            </>
          )}
        </Stack>
      </Modal>
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
    "Where dump it all either survives or quietly becomes curation. One upload is routinely several weeks and several milestones, so the batch is grouped by capture day and everything is done to a selection rather than one at a time.",
  states: [
    {
      id: "select",
      label: "Before choosing",
      note: "Asks for everything by name, and says capture dates come off the files, so a phone nobody has emptied since the hospital is the expected case.",
      render: () => {
        return <UploadSurface state="select" />;
      },
    },
    {
      id: "days",
      label: "Grouped by day",
      note: "264 files across three days, grouped the way the archive groups everything. Two days already carry a milestone; the one in between is just a Tuesday.",
      render: () => {
        return <UploadSurface state="days" />;
      },
    },
    {
      id: "selection",
      label: "Several ticked",
      note: "A solid ink bar, because a selection is a mode. One tag, one person or one milestone applied to the lot instead of the same thing done two hundred times.",
      render: () => {
        return <UploadSurface state="selection" />;
      },
    },
    {
      id: "tag",
      label: "Bulk: add a tag",
      note: "A new tag or one already in use, with its count so you can tell a real tag from a typo of one.",
      render: () => {
        return <UploadSurface state="tag" />;
      },
    },
    {
      id: "person",
      label: "Bulk: tag a person",
      note: "Somebody with an account or somebody without one, and the sentence that stops a people tag being read as a permission.",
      render: () => {
        return <UploadSurface state="person" />;
      },
    },
    {
      id: "milestone",
      label: "Bulk: put under a milestone",
      note: "Existing milestones, each carrying its date and what is already attached. One upload is not one milestone and the copy says so.",
      render: () => {
        return <UploadSurface state="milestone" />;
      },
    },
    {
      id: "milestone-new",
      label: "A new milestone, here",
      note: "Made in the flow rather than in the admin surface, with the date pre-filled from the capture date of what is ticked.",
      render: () => {
        return <UploadSurface state="milestone-new" />;
      },
    },
    {
      id: "visibility",
      label: "Who can see them",
      note: "Pre-filled to Everyone and applied to the whole batch. The one uploader in ten who wants to keep something back gets the full control, in the flow.",
      render: () => {
        return <UploadSurface state="visibility" />;
      },
    },
    {
      id: "sending",
      label: "In progress",
      note: "One figure and one bar, naming the day it is working through. It says plainly that you can close the page, because a parent with a newborn will.",
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
      note: "Counts as the interface: what went up, over how many days, into how many milestones, and the one email the whole batch sent.",
      render: () => {
        return <UploadSurface state="done" />;
      },
    },
  ],
};
