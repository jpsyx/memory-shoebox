import {
  Button,
  Modal,
  Stack,
  Table,
  TextInput,
  Textarea,
} from "@mantine/core";
import { IconPlus, IconSearch } from "@tabler/icons-react";
import { useState } from "react";
import {
  ARCHIVE_DAYS,
  MILESTONES,
  milestoneById,
  NEW_MILESTONE,
  type Milestone,
} from "@/data/fixtures";
import { describeMilestoneSpan } from "@/data/milestones";
import { Banner, Sheet, SheetHead, TopBar } from "@/system/Chrome";
import { ChipRow } from "@/system/Chip";
import { ICON_PROPS } from "@/system/icons";
import {
  MilestoneDateFields,
  type MilestoneSpan,
} from "@/system/MilestoneDates";
import { MilestoneFix, type StrayItem } from "@/system/MilestoneFix";
import { MilestoneBand, Print } from "@/system/Pile";
import { LabelText, Lede, Prose } from "@/system/typography";
import classes from "@/system/system.module.css";
import type { Surface } from "@/surfaces/registry";

type MilestonesState =
  | "list"
  | "create"
  | "create-span"
  | "created"
  | "edit"
  | "attach"
  | "fix"
  | "empty"
  | "delete";

const ATTACHABLE = ARCHIVE_DAYS[0]?.items.slice(0, 12) ?? [];

/**
 * The occasion the fix flow demonstrates with: five days, and four
 * photographs attached to it that were taken before it started.
 */
const SPAN_MILESTONE: Milestone =
  milestoneById("mil-visit") ?? (MILESTONES[0] as Milestone);

const SPAN_STRAYS: readonly StrayItem[] = (ARCHIVE_DAYS[1]?.items ?? [])
  .slice(0, 4)
  .map((item) => {
    return {
      id: item.id,
      media: item.media,
      capturedOn: ARCHIVE_DAYS[1]?.date ?? "2026-09-14",
    };
  });

function MilestonesSurface({ state }: { readonly state: MilestonesState }) {
  const [deleting, setDeleting] = useState<Milestone | undefined>(
    state === "delete" ? MILESTONES[1] : undefined,
  );
  const [chosen, setChosen] = useState<readonly string[]>(
    ATTACHABLE.slice(0, 5).map((item) => {
      return item.id;
    }),
  );
  const emptyMilestone = MILESTONES[3];
  const isWriting =
    state === "create" || state === "create-span" || state === "edit";
  const [span, setSpan] = useState<MilestoneSpan>(() => {
    if (state === "edit") {
      return { startsOn: "2026-09-17", endsOn: null, isMultiDay: false };
    }
    if (state === "create-span") {
      return {
        startsOn: SPAN_MILESTONE.startsOn,
        endsOn: SPAN_MILESTONE.endsOn,
        isMultiDay: true,
      };
    }
    return { startsOn: null, endsOn: null, isMultiDay: false };
  });

  return (
    <>
      <TopBar back="Back to my account" />
      <main className={classes.pageWide}>
        <Stack gap="lg">
          <Lede>Milestones.</Lede>
          <Prose onPanel>
            A dated occasion: a birth, a first day of school, a week at the
            grandparents'. It has no page of its own. It appears in the timeline
            across its own days, given a treatment that makes it read as an
            occasion rather than as another day, and an occasion that ran for
            five days reads as one occasion rather than five.
          </Prose>

          {isWriting ? (
            <Sheet wide label={state === "edit" ? "Edit" : "A new milestone"}>
              <SheetHead
                title={
                  state === "edit"
                    ? "Home from the hospital"
                    : "A new milestone, from nothing"
                }
              />
              <Stack gap="md">
                {state === "edit" ? null : (
                  <Prose>
                    Nothing is attached to it yet, so there is nothing to take a
                    date from. Say when it happened and the next step offers you
                    the photographs from those days.
                  </Prose>
                )}
                <TextInput
                  label="What happened"
                  placeholder="Mateo's first day of school"
                  defaultValue={
                    state === "edit"
                      ? "Home from the hospital"
                      : state === "create-span"
                        ? "The week Abuela stayed"
                        : ""
                  }
                />
                <MilestoneDateFields span={span} onChange={setSpan} />
                <Textarea
                  label="A line about it"
                  description="Optional. It sits under the name in the timeline."
                  defaultValue={
                    state === "edit"
                      ? "The car seat took four of us and twenty minutes."
                      : ""
                  }
                />
                <ChipRow>
                  <Button>
                    {state === "edit"
                      ? "Save the changes"
                      : "Create it and find its photographs"}
                  </Button>
                  <Button variant="default">Cancel</Button>
                </ChipRow>
              </Stack>
            </Sheet>
          ) : null}

          {state === "created" ? (
            <Sheet wide label="Photographs from those days">
              <SheetHead title={`Photographs from ${NEW_MILESTONE.name}`}>
                <span className={classes.fileMeta}>
                  {chosen.length} of {ATTACHABLE.length} chosen
                </span>
              </SheetHead>
              <Stack gap="md">
                <Banner>
                  <b>{NEW_MILESTONE.name} exists and holds nothing.</b> These
                  are everything in the archive captured between{" "}
                  {describeMilestoneSpan(NEW_MILESTONE)}, which is where its
                  photographs are most likely to be. Anything outside those days
                  can be attached later from the pile.
                </Banner>
                <div className={classes.pile}>
                  {ATTACHABLE.map((item, index) => {
                    return (
                      <Print
                        key={item.id}
                        media={item.media}
                        seed={index}
                        selected={chosen.includes(item.id)}
                        onClick={() => {
                          return setChosen((current) => {
                            return current.includes(item.id)
                              ? current.filter((id) => {
                                  return id !== item.id;
                                })
                              : [...current, item.id];
                          });
                        }}
                      />
                    );
                  })}
                </div>
                <ChipRow>
                  <Button>Attach {chosen.length}</Button>
                  <Button variant="default">Leave it empty for now</Button>
                </ChipRow>
                <Prose>
                  Leaving it empty is fine. The occasion still stands in the
                  timeline at its own dates, and anybody can attach to it later.
                </Prose>
              </Stack>
            </Sheet>
          ) : null}

          {state === "fix" ? (
            <MilestoneFix
              milestone={SPAN_MILESTONE}
              strays={SPAN_STRAYS}
              onDone={() => {
                return undefined;
              }}
            />
          ) : null}

          {state === "attach" ? (
            <Sheet wide label="Attach items">
              <SheetHead title="What belongs to Mateo is born">
                <span className={classes.fileMeta}>
                  {chosen.length} of 212 chosen
                </span>
              </SheetHead>
              <Stack gap="md">
                <TextInput
                  label="Narrow it down"
                  placeholder="A day, a tag, a person"
                  leftSection={<IconSearch {...ICON_PROPS} />}
                  defaultValue="14 September 2026"
                />
                <Prose>
                  Press a print to attach or detach it. Attaching does not move
                  anything: the photographs stay on the days they were taken,
                  and the milestone simply points at them.
                </Prose>
                <div className={classes.pile}>
                  {ATTACHABLE.map((item, index) => {
                    return (
                      <Print
                        key={item.id}
                        media={item.media}
                        seed={index}
                        selected={chosen.includes(item.id)}
                        onClick={() => {
                          return setChosen((current) => {
                            return current.includes(item.id)
                              ? current.filter((id) => {
                                  return id !== item.id;
                                })
                              : [...current, item.id];
                          });
                        }}
                      />
                    );
                  })}
                </div>
                <ChipRow>
                  <Button>Attach {chosen.length}</Button>
                  <Button variant="default">Cancel</Button>
                </ChipRow>
              </Stack>
            </Sheet>
          ) : null}

          {state === "empty" && emptyMilestone !== undefined ? (
            <Sheet wide label="A milestone with nothing attached">
              <SheetHead title={emptyMilestone.name} />
              <Stack gap="md">
                <Banner>
                  <b>Nothing is attached to this one yet.</b> It still sits in
                  the timeline on 2 August 2026, because the date is the point:
                  a family knows the day happened whether or not anybody got a
                  photograph of it.
                </Banner>
                <div>
                  <LabelText component="h3">
                    How it reads in the timeline
                  </LabelText>
                  <MilestoneBand milestone={emptyMilestone} />
                </div>
                <ChipRow>
                  <Button leftSection={<IconPlus {...ICON_PROPS} />}>
                    Attach photographs
                  </Button>
                  <Button variant="default">Ask Marisol for hers</Button>
                </ChipRow>
              </Stack>
            </Sheet>
          ) : null}

          <Sheet wide label="Milestones">
            <SheetHead title={`${MILESTONES.length} milestones`}>
              {state === "create" ? null : (
                <Button leftSection={<IconPlus {...ICON_PROPS} />}>
                  New milestone
                </Button>
              )}
            </SheetHead>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>What happened</Table.Th>
                  <Table.Th>When</Table.Th>
                  <Table.Th>Attached</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {MILESTONES.map((milestone) => {
                  return (
                    <Table.Tr key={milestone.id}>
                      <Table.Td>
                        <b>{milestone.name}</b>
                        <br />
                        <span className={classes.fileMeta}>
                          {milestone.blurb}
                        </span>
                      </Table.Td>
                      <Table.Td className={classes.tabular}>
                        {describeMilestoneSpan(milestone)}
                      </Table.Td>
                      <Table.Td className={classes.tabular}>
                        {milestone.itemCount === 0
                          ? "Nothing yet"
                          : `${milestone.itemCount} items`}
                      </Table.Td>
                      <Table.Td>
                        <ChipRow>
                          <Button variant="default" size="sm">
                            Edit
                          </Button>
                          <Button variant="default" size="sm">
                            Attach
                          </Button>
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => {
                              return setDeleting(milestone);
                            }}
                          >
                            Delete
                          </Button>
                        </ChipRow>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Sheet>
        </Stack>
      </main>

      <Modal
        opened={deleting !== undefined}
        onClose={() => {
          return setDeleting(undefined);
        }}
        title={`Delete ${deleting?.name ?? "this milestone"}?`}
      >
        <Stack gap="md">
          <Prose>
            The occasion goes from the timeline. The {deleting?.itemCount ?? 0}{" "}
            photographs attached to it stay exactly where they are, on the days
            they were taken. Nothing is deleted except the label.
          </Prose>
          <ChipRow>
            <Button
              variant="danger"
              onClick={() => {
                return setDeleting(undefined);
              }}
            >
              Delete the milestone
            </Button>
            <Button
              variant="default"
              onClick={() => {
                return setDeleting(undefined);
              }}
            >
              Cancel
            </Button>
          </ChipRow>
        </Stack>
      </Modal>
    </>
  );
}

export const milestonesSurface: Surface = {
  id: "milestones",
  number: 14,
  title: "Milestones",
  who: "uploaders and admins",
  group: "admin",
  blurb:
    "A dated event with items attached, appearing inline in the timeline. There is no milestone view, because that would be another thing to curate.",
  states: [
    {
      id: "list",
      label: "The list",
      note: "Three milestones, one of them carrying nothing. The date is the primary fact, so it is a column rather than a detail.",
      render: () => {
        return <MilestonesSurface state="list" />;
      },
    },
    {
      id: "create",
      label: "Create with a date",
      note: "One date by default, because most occasions are one day and offering a range first turns every birthday into a form. Made from nothing here, so there is no date to pre-fill.",
      render: () => {
        return <MilestonesSurface state="create" />;
      },
    },
    {
      id: "create-span",
      label: "Create one that ran for days",
      note: "The switch turns one date into a range. A week at the grandparents' is one occasion, not seven, so the model is a span and a one-day milestone is simply a span whose ends match.",
      render: () => {
        return <MilestonesSurface state="create-span" />;
      },
    },
    {
      id: "created",
      label: "Finding its photographs",
      note: "Made from nothing, so it has dates and no contents. The picker offers exactly what was captured inside its span, which is where its photographs will be.",
      render: () => {
        return <MilestonesSurface state="created" />;
      },
    },
    {
      id: "fix",
      label: "Photographs outside a span",
      note: "A five-day occasion with four photographs from before it started. Because the occasion runs for days, moving the photographs has to ask which of its days each one belongs to rather than guessing.",
      render: () => {
        return <MilestonesSurface state="fix" />;
      },
    },
    {
      id: "edit",
      label: "Edit",
      note: "Same three fields. Editing a milestone never touches the photographs pointing at it.",
      render: () => {
        return <MilestonesSurface state="edit" />;
      },
    },
    {
      id: "attach",
      label: "Attach items",
      note: "Choosing happens in the pile itself, with a 5px ink outline inside the paper edge. Attaching moves nothing.",
      render: () => {
        return <MilestonesSurface state="attach" />;
      },
    },
    {
      id: "empty",
      label: "Nothing attached",
      note: "Still appears in the timeline at its date, shown here exactly as it will read there. A family knows the day happened.",
      render: () => {
        return <MilestonesSurface state="empty" />;
      },
    },
    {
      id: "delete",
      label: "Delete",
      note: "Says plainly that only the label goes. Deleting a milestone that deleted photographs would be unforgivable.",
      render: () => {
        return <MilestonesSurface state="delete" />;
      },
    },
  ],
};
