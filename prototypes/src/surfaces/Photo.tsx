import { Button, Modal, Stack, Textarea, TextInput } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import {
  IconAlertCircle,
  IconCalendar,
  IconDownload,
  IconEye,
  IconFlag,
  IconLock,
  IconTrash,
} from "@tabler/icons-react";
import { useState } from "react";
import {
  ITEM_VIEWERS,
  PHOTO_COMMENTS,
  PHOTO_REACTIONS,
  memberById,
} from "@/data/fixtures";
import { BURST_FRAMES, NEWBORN } from "@/data/media";
import { Banner, Sheet, TopBar } from "@/system/Chrome";
import { Chip, ChipRow } from "@/system/Chip";
import { PeopleField } from "@/system/PeopleField";
import { ICON_PROPS } from "@/system/icons";
import { Reactions } from "@/system/Reactions";
import { CommentRow, Composer, Talk } from "@/system/Talk";
import { VisibilityControl, describeVisibility } from "@/system/Visibility";
import { LabelText, Prose } from "@/system/typography";
import classes from "@/system/system.module.css";
import type { Surface } from "@/surfaces/registry";

type PhotoState =
  | "viewer"
  | "uploader"
  | "visibility"
  | "delete"
  | "reactions"
  | "quiet"
  | "fix-date"
  | "describe"
  | "who-opened";

const TAGS_ON_THIS = ["hospital", "mateo", "sleeping"];
const PEOPLE_IN_THIS = ["Mateo", "Papá", "Mamá"];
const CURRENT_FRAME = 7;

/** The burst this frame came out of, so the run stays visible. */
function Siblings() {
  return (
    <div className={classes.siblings} aria-label="Other frames from this burst">
      {BURST_FRAMES.slice(0, 24).map((frame, index) => {
        return (
          <button
            key={frame.id}
            type="button"
            className={classes.sibling}
            aria-current={index + 1 === CURRENT_FRAME ? "true" : undefined}
          >
            <img
              src={frame.thumb}
              alt={`Frame ${index + 1} of the burst`}
              loading="lazy"
            />
          </button>
        );
      })}
    </div>
  );
}

function PhotoSurface({ state }: { readonly state: PhotoState }) {
  const [isDeleting, setIsDeleting] = useState(state === "delete");
  const [isChangingVisibility, setIsChangingVisibility] = useState(
    state === "visibility",
  );
  const [mode, setMode] = useState<"everyone" | "only" | "except">("only");
  const [people, setPeople] = useState<readonly string[]>(PEOPLE_IN_THIS);
  const [isNamingPeople, setIsNamingPeople] = useState(false);
  const [subjects, setSubjects] = useState<readonly string[]>([
    "grp-grandparents",
    "mem-marisol",
  ]);

  const [isFixingDate, setIsFixingDate] = useState(state === "fix-date");
  const [capturedAt, setCapturedAt] = useState<Date | null>(
    new Date(2026, 8, 14),
  );
  const [description, setDescription] = useState(
    state === "describe"
      ? "Papá in scrubs holding Mateo, minutes old, with Mamá asleep behind them."
      : "",
  );

  const canManage = state !== "viewer" && state !== "quiet";
  const movedDay = capturedAt !== null && capturedAt.getDate() !== 14;

  return (
    <>
      <TopBar back="Back to 14 September" />
      <main className={classes.viewer}>
        <div>
          <div className={classes.frame}>
            <img
              src={NEWBORN.src}
              alt={NEWBORN.alt}
              width={NEWBORN.width}
              height={NEWBORN.height}
            />
          </div>
          <p className={classes.viewerMeta}>
            <span>
              {movedDay
                ? `${capturedAt.getDate()} September 2026, 6:41 am`
                : "14 September 2026, 6:41 am"}
            </span>
            <span>Frame {CURRENT_FRAME} of 45</span>
            <span>Uploaded by Papá</span>
            {canManage ? (
              <span>
                <IconLock {...ICON_PROPS} />{" "}
                {describeVisibility(mode, subjects)}
              </span>
            ) : null}
          </p>
          <div className={classes.frameReactions}>
            <Reactions
              onPanel
              reactions={PHOTO_REACTIONS}
              mine={state === "reactions" ? "love" : undefined}
              goesTo="A reaction is the whole of what most people will ever leave, and that is plenty. Nobody is emailed about one."
            />
          </div>
          <Siblings />
        </div>

        <Stack gap="md">
          {state === "quiet" ? (
            <Talk heading="Nothing said yet">
              <Prose>
                Nobody has written on this one. There are eight people who can
                see it, and any of them can be the first.
              </Prose>
              <Composer goesTo="Goes to all eight" />
            </Talk>
          ) : (
            <Talk heading={`${PHOTO_COMMENTS.length} comments`}>
              {PHOTO_COMMENTS.map((comment) => {
                return <CommentRow key={comment.id} comment={comment} />;
              })}
              <Composer goesTo="Goes to all eight" />
            </Talk>
          )}

          <Sheet label="What is in this one">
            <LabelText component="h2">In this one</LabelText>
            <Stack gap="sm" mt="sm">
              {isNamingPeople ? (
                <PeopleField
                  label="Who is in it"
                  description="Start typing. Press Enter on a name the archive has never heard of to add it."
                  placeholder="Mateo, Abuela Rosa"
                  value={people}
                  onChange={setPeople}
                  mode="anyone"
                  defaultDropdownOpened
                />
              ) : (
                <ChipRow>
                  {people.map((person) => {
                    return <Chip key={person}>{person}</Chip>;
                  })}
                  {canManage ? (
                    <Chip
                      onClick={() => {
                        return setIsNamingPeople(true);
                      }}
                    >
                      + Tag somebody
                    </Chip>
                  ) : null}
                </ChipRow>
              )}
              <ChipRow>
                {TAGS_ON_THIS.map((tag) => {
                  return <Chip key={tag}>{tag}</Chip>;
                })}
                {canManage ? <Chip>+ Add a tag</Chip> : null}
              </ChipRow>
              <Prose>
                A tag on a person says who is in the photograph. It never says
                who may open it.
              </Prose>
            </Stack>
          </Sheet>

          {canManage ? (
            <Sheet label="Who can see this">
              {isChangingVisibility ? (
                <Stack gap="md">
                  <VisibilityControl
                    heading="Who can see this one"
                    mode={mode}
                    onModeChange={setMode}
                    subjects={subjects}
                    onSubjectsChange={setSubjects}
                  />
                  <ChipRow>
                    <Button
                      onClick={() => {
                        return setIsChangingVisibility(false);
                      }}
                    >
                      Save
                    </Button>
                    <Button
                      variant="default"
                      onClick={() => {
                        return setIsChangingVisibility(false);
                      }}
                    >
                      Cancel
                    </Button>
                  </ChipRow>
                </Stack>
              ) : (
                <Stack gap="sm">
                  <LabelText component="h2">Who can see this</LabelText>
                  <p className={classes.title}>
                    {describeVisibility(mode, subjects)}
                  </p>
                  <Prose>
                    To everyone else this photograph is not there at all, and it
                    is not counted in the day's total.
                  </Prose>
                  <ChipRow>
                    <Button
                      variant="default"
                      onClick={() => {
                        return setIsChangingVisibility(true);
                      }}
                    >
                      Change who can see it
                    </Button>
                  </ChipRow>
                </Stack>
              )}
            </Sheet>
          ) : null}

          {canManage ? (
            <Sheet label="When this was taken">
              <Stack gap="sm">
                <LabelText component="h2">When this was taken</LabelText>
                {isFixingDate ? (
                  <Stack gap="md">
                    <Prose>
                      The file said <b>14 September 2026, 6:41 am</b>. If that
                      is wrong, put it right: the date is what decides which day
                      this sits on and which milestone it falls inside.
                    </Prose>
                    <DatePickerInput
                      label="The day it was taken"
                      value={capturedAt}
                      onChange={(next) => {
                        return setCapturedAt(
                          next === null ? null : new Date(next),
                        );
                      }}
                      leftSection={<IconCalendar {...ICON_PROPS} />}
                    />
                    <TextInput
                      label="The time"
                      description="Leave it if only the day was wrong."
                      defaultValue="06:41"
                    />
                    {movedDay ? (
                      <Banner icon={<IconAlertCircle {...ICON_PROPS} />}>
                        <b>
                          Moving it off 14 September takes it out of its burst.
                        </b>{" "}
                        A burst is a run of frames from one moment, so a frame
                        on another day is not part of it any more. The other 44
                        stay where they are. It also sits outside{" "}
                        <b>Mateo is here</b>, and you will be asked what to do
                        about that next.
                      </Banner>
                    ) : null}
                    <ChipRow>
                      <Button
                        onClick={() => {
                          return setIsFixingDate(false);
                        }}
                      >
                        Put it right
                      </Button>
                      <Button
                        variant="default"
                        onClick={() => {
                          setCapturedAt(new Date(2026, 8, 14));
                          setIsFixingDate(false);
                        }}
                      >
                        Cancel
                      </Button>
                    </ChipRow>
                    <Prose>
                      Whatever the file originally said is kept, so this is
                      always undoable, however many times the date is moved.
                    </Prose>
                  </Stack>
                ) : (
                  <Stack gap="sm">
                    <p className={classes.title}>
                      {movedDay
                        ? `${capturedAt.getDate()} September 2026, 6:41 am`
                        : "14 September 2026, 6:41 am"}
                    </p>
                    <Prose>
                      Read off the file itself. Cameras with a flat battery and
                      scans of old prints get this wrong, and a photograph on
                      the wrong day is a photograph nobody finds again.
                    </Prose>
                    <ChipRow>
                      <Button
                        variant="default"
                        leftSection={<IconCalendar {...ICON_PROPS} />}
                        onClick={() => {
                          return setIsFixingDate(true);
                        }}
                      >
                        Put the date right
                      </Button>
                    </ChipRow>
                  </Stack>
                )}
              </Stack>
            </Sheet>
          ) : null}

          {canManage ? (
            <Sheet label="Describing it">
              <Stack gap="sm">
                <LabelText component="h2">For somebody listening</LabelText>
                <Textarea
                  label="Describe this photograph"
                  description="Optional. Read aloud by a screen reader instead of the line below."
                  placeholder="Papá in scrubs holding Mateo, minutes old"
                  value={description}
                  autosize
                  minRows={2}
                  onChange={(event) => {
                    return setDescription(event.currentTarget.value);
                  }}
                  classNames={{ input: classes.composerField }}
                />
                <Prose>
                  {description.trim().length > 0
                    ? "That is what gets read out. It replaces what we worked out on our own."
                    : "Left empty, this one reads as \u201cMateo, Pap\u00e1 and Mam\u00e1, 14 September 2026\u201d, built from who is tagged in it and when it was taken. That is honest and it is usually enough, which is the point: nobody is going to describe 264 files by hand."}
                </Prose>
              </Stack>
            </Sheet>
          ) : null}

          {state === "who-opened" ? (
            <Sheet label="Who has opened this">
              <Stack gap="sm">
                <LabelText component="h2">Who has opened this</LabelText>
                <div>
                  {ITEM_VIEWERS.map((viewer) => {
                    const member = memberById(viewer.memberId);
                    return (
                      <div className={classes.viewerRow} key={viewer.memberId}>
                        <span className={classes.viewerName}>
                          {member?.name ?? viewer.memberId}
                        </span>
                        <span className={classes.viewerWhen}>
                          {viewer.opened === null
                            ? "Never opened"
                            : viewer.opened}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <Banner icon={<IconEye {...ICON_PROPS} />}>
                  <b>Only an admin sees this panel.</b> Whether your son has
                  opened your photograph is not something the software should
                  tell you.
                </Banner>
              </Stack>
            </Sheet>
          ) : null}

          <Sheet label="Actions">
            <Stack gap="sm">
              <ChipRow>
                <Button
                  variant="default"
                  leftSection={<IconDownload {...ICON_PROPS} />}
                >
                  Download the original
                </Button>
              </ChipRow>
              {canManage ? (
                <>
                  <ChipRow>
                    <Button
                      variant="danger"
                      leftSection={<IconTrash {...ICON_PROPS} />}
                      onClick={() => {
                        return setIsDeleting(true);
                      }}
                    >
                      Delete this photograph
                    </Button>
                  </ChipRow>
                  <Prose>
                    You uploaded this one, so you can take it down. Deleting
                    removes the file as well as the record.
                  </Prose>
                </>
              ) : (
                <>
                  <ChipRow>
                    <Button
                      variant="default"
                      leftSection={<IconFlag {...ICON_PROPS} />}
                    >
                      Ask for this to come down
                    </Button>
                  </ChipRow>
                  <Prose>
                    You are tagged in this one. Asking tells Papá, who put it
                    up, and everyone who runs the archive.
                  </Prose>
                </>
              )}
            </Stack>
          </Sheet>
        </Stack>
      </main>

      <Modal
        opened={isDeleting}
        onClose={() => {
          return setIsDeleting(false);
        }}
        title="Delete this photograph?"
      >
        <Stack gap="md">
          <Prose>
            It goes for good: the record and the file behind it. Nobody in the
            Shoebox will be able to open it again, and the three comments on it
            go with it.
          </Prose>
          <Banner icon={<IconTrash {...ICON_PROPS} />}>
            This is not a hidden flag. A family member who asks for a photograph
            to come down expects it to be gone, so it is gone.
          </Banner>
          <ChipRow>
            <Button
              variant="danger"
              onClick={() => {
                return setIsDeleting(false);
              }}
            >
              Delete it
            </Button>
            <Button
              variant="default"
              onClick={() => {
                return setIsDeleting(false);
              }}
            >
              Keep it
            </Button>
          </ChipRow>
        </Stack>
      </Modal>
    </>
  );
}

export const photoSurface: Surface = {
  id: "photo",
  number: 3,
  title: "One photo",
  who: "every member",
  group: "member",
  blurb:
    "A full frame, the burst it came out of, the comments on it, and, for whoever put it up, the controls that decide who else sees it.",
  states: [
    {
      id: "viewer",
      label: "A viewer looking",
      note: "No visibility control and no delete. A viewer tagged in the photograph gets the one thing they can do: ask for it to come down.",
      render: () => {
        return <PhotoSurface state="viewer" />;
      },
    },
    {
      id: "uploader",
      label: "The uploader looking",
      note: "The same frame with the rule stated in words, a way to change it, and a delete that says plainly the file goes too.",
      render: () => {
        return <PhotoSurface state="uploader" />;
      },
    },
    {
      id: "visibility",
      label: "Setting visibility",
      note: "Groups first, then people, in one list. The admin sentence sits under it wherever visibility is set, never in a tooltip.",
      render: () => {
        return <PhotoSurface state="visibility" />;
      },
    },
    {
      id: "delete",
      label: "Deleting it",
      note: "Says what is destroyed and what goes with it. The destructive button earns its weight from a 2px stroke, not from red.",
      render: () => {
        return <PhotoSurface state="delete" />;
      },
    },
    {
      id: "reactions",
      label: "Reacting",
      note: "Six choices, each carrying its word, because nothing here may lean on a hover tooltip. Stroked and monochrome: colour in this system means unseen, and six bright badges would say it six times.",
      render: () => {
        return <PhotoSurface state="reactions" />;
      },
    },
    {
      id: "fix-date",
      label: "Putting the date right",
      note: "The one edit that destroys something the file said, so it names what it will break before it breaks it: the burst, and the milestone the photograph falls out of.",
      render: () => {
        return <PhotoSurface state="fix-date" />;
      },
    },
    {
      id: "describe",
      label: "Describing it",
      note: "Generated from the people tags and the date unless somebody writes something better. Nobody is going to describe 264 files, so the default has to be honest rather than absent.",
      render: () => {
        return <PhotoSurface state="describe" />;
      },
    },
    {
      id: "who-opened",
      label: "Who has opened it",
      note: "Admin only, and says so. Opened at full size is the fact worth having; scrolled past is not the same thing and is not shown as though it were.",
      render: () => {
        return <PhotoSurface state="who-opened" />;
      },
    },
    {
      id: "quiet",
      label: "No comments yet",
      note: "The composer is the surface rather than an afterthought under an empty list. A viewer who cannot find it is a product failure.",
      render: () => {
        return <PhotoSurface state="quiet" />;
      },
    },
  ],
};
