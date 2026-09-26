import { Button, Modal, Stack } from "@mantine/core";
import {
  IconDownload,
  IconFlag,
  IconLock,
  IconTrash,
} from "@tabler/icons-react";
import { useState } from "react";
import { PHOTO_COMMENTS } from "@/data/fixtures";
import { BURST_FRAMES, NEWBORN } from "@/data/media";
import { Banner, Sheet, TopBar } from "@/system/Chrome";
import { Chip, ChipRow } from "@/system/Chip";
import { ICON_PROPS } from "@/system/icons";
import { CommentRow, Composer, Talk } from "@/system/Talk";
import { VisibilityControl, describeVisibility } from "@/system/Visibility";
import { LabelText, Prose } from "@/system/typography";
import classes from "@/system/system.module.css";
import type { Surface } from "@/surfaces/registry";

type PhotoState = "viewer" | "uploader" | "visibility" | "delete" | "quiet";

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
  const [subjects, setSubjects] = useState<readonly string[]>([
    "grp-grandparents",
    "mem-marisol",
  ]);

  const canManage = state !== "viewer" && state !== "quiet";

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
            <span>14 September 2026, 6:41 am</span>
            <span>Frame {CURRENT_FRAME} of 45</span>
            <span>Uploaded by Papá</span>
            {canManage ? (
              <span>
                <IconLock {...ICON_PROPS} />{" "}
                {describeVisibility(mode, subjects)}
              </span>
            ) : null}
          </p>
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
              <ChipRow>
                {PEOPLE_IN_THIS.map((person) => {
                  return <Chip key={person}>{person}</Chip>;
                })}
                {canManage ? <Chip>+ Tag somebody</Chip> : null}
              </ChipRow>
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
      id: "quiet",
      label: "No comments yet",
      note: "The composer is the surface rather than an afterthought under an empty list. A viewer who cannot find it is a product failure.",
      render: () => {
        return <PhotoSurface state="quiet" />;
      },
    },
  ],
};
