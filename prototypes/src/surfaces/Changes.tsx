import { Stack } from "@mantine/core";
import { IconEye, IconLock } from "@tabler/icons-react";
import {
  CHANGE_EVENTS,
  CHANGE_EVENTS_ONE_SUBJECT,
  CHANGE_FAMILY_LABELS,
  type ChangeEvent,
  type ChangeFamily,
  groupChangesByDay,
} from "@/data/changes";
import { Banner, Sheet, SheetHead, TopBar } from "@/system/Chrome";
import { Chip, ChipRow } from "@/system/Chip";
import { ICON_PROPS } from "@/system/icons";
import { LabelText, Lede, Prose } from "@/system/typography";
import classes from "@/system/system.module.css";
import type { Surface } from "@/surfaces/registry";

type ChangesState = "default" | "authority" | "person" | "gone" | "empty";

const FAMILIES: readonly ChangeFamily[] = [
  "authority",
  "destruction",
  "access",
];

/**
 * One row of the log.
 *
 * The time leads, because the first question anybody asks of an audit log is
 * when. The sentence carries the whole fact, so nothing here is a link that
 * has to resolve: a row whose subject is gone is the case this surface exists
 * to handle well, not an edge case it tolerates.
 */
function ChangeRow({ event }: { readonly event: ChangeEvent }) {
  return (
    <div className={classes.changeRow}>
      <span className={classes.changeWhen}>{event.time}</span>
      <div>
        <p className={classes.changeWhat}>
          <b>{event.actorLabel}</b> {event.what}
        </p>
        <p className={classes.changeMeta}>
          <span className={classes.changeSubject}>
            {event.subjectLabel}
            {event.subjectGone === true ? (
              <span className={classes.changeGone}>gone</span>
            ) : null}
          </span>
          <span>{event.kind}</span>
          <span>{event.device ?? "Device no longer known"}</span>
        </p>
        {event.retroactive === true ? (
          <p className={classes.changeRetroactive}>
            This granted her every photograph ever restricted to primos,
            including the ones from before she was in it.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function ChangeDays({ events }: { readonly events: readonly ChangeEvent[] }) {
  return (
    <>
      {groupChangesByDay(events).map(([day, dayEvents]) => {
        return (
          <div className={classes.changeDay} key={day}>
            <LabelText component="h3">{day}</LabelText>
            {dayEvents.map((event) => {
              return <ChangeRow event={event} key={event.id} />;
            })}
          </div>
        );
      })}
    </>
  );
}

function eventsFor(state: ChangesState): readonly ChangeEvent[] {
  switch (state) {
    case "authority":
      return CHANGE_EVENTS.filter((event) => {
        return event.family === "authority";
      });
    case "person":
      return CHANGE_EVENTS.filter((event) => {
        return event.actorMemberId === "mem-andres";
      });
    case "gone":
      return CHANGE_EVENTS_ONE_SUBJECT;
    case "empty":
      return [];
    default:
      return CHANGE_EVENTS;
  }
}

function sheetTitle(state: ChangesState): string {
  switch (state) {
    case "authority":
      return "Who can see what";
    case "person":
      return "Everything Papá has changed";
    case "gone":
      return "One photograph, all of it";
    case "empty":
      return "Nothing has been changed yet";
    default:
      return "Everything, newest first";
  }
}

function ChangesSurface({ state }: { readonly state: ChangesState }) {
  const events = eventsFor(state);
  const activeFamily: ChangeFamily | null =
    state === "authority" ? "authority" : null;

  return (
    <>
      <TopBar back="Back to my account" />
      <main className={classes.pageWide}>
        <Stack gap="lg">
          <Lede>What has been changed.</Lede>
          <Prose onPanel>
            Not everything that has happened. Comments, reactions and uploads
            are in the archive already, and a log that repeats them buries the
            one row that mattered. This is the other kind: who may see what, who
            may do what, and what was deleted. Those are the changes nothing
            else in the Shoebox records.
          </Prose>

          {state === "gone" || state === "person" ? (
            <div className={classes.filterStrip}>
              <span className={classes.filterStripCount}>{events.length}</span>
              <ChipRow>
                <Chip active onRemove={() => {}} removeLabel="Clear">
                  {state === "gone"
                    ? "14 September 2026, 06:47"
                    : "Changed by Papá"}
                </Chip>
              </ChipRow>
            </div>
          ) : (
            <ChipRow>
              <Chip active={activeFamily === null}>Everything</Chip>
              {FAMILIES.map((family) => {
                return (
                  <Chip active={activeFamily === family} key={family}>
                    {CHANGE_FAMILY_LABELS[family]}
                  </Chip>
                );
              })}
            </ChipRow>
          )}

          <Sheet wide label="What has been changed">
            <SheetHead title={sheetTitle(state)} />
            <Stack gap="md">
              {state === "empty" ? (
                <Prose>
                  A Shoebox that has just been set up. Nobody has been invited,
                  no group exists and nothing has been taken down, so there is
                  nothing here and that is the correct answer rather than an
                  error. Rows arrive on their own as the Shoebox is used, and
                  none of them is ever removed.
                </Prose>
              ) : (
                <>
                  <Prose>
                    {state === "gone"
                      ? "The photograph was deleted on 16 September. Every row still says what it was and who changed it, because the words were written down at the time rather than looked up now. Nothing here links anywhere: the file and the row it named are both genuinely gone."
                      : state === "person"
                        ? "One person's changes, in the order they made them. The same rows as the full log, filtered rather than recomputed."
                        : state === "authority"
                          ? "The rows the log exists for. Every one of these changed who may see something or who may do something, and none of them is visible anywhere else in the Shoebox."
                          : "Times are this Shoebox's own. The device is the one the change was made from, and goes quiet once that sign-in has aged out at thirty days."}
                  </Prose>
                  <ChangeDays events={events} />
                </>
              )}
            </Stack>
          </Sheet>

          {state === "gone" ? (
            <Banner icon={<IconEye {...ICON_PROPS} />}>
              <b>A deleted thing keeps its place here.</b> The log outlives what
              it describes, so these rows hold an id that no longer resolves and
              that is deliberate. Making the rows disappear with the photograph
              would empty the log exactly when somebody has a reason to read it.
            </Banner>
          ) : (
            <Banner icon={<IconLock {...ICON_PROPS} />}>
              <b>
                Only an admin sees this, and nothing is ever removed from it.
              </b>{" "}
              There is no retention rule and no way to delete a row, because the
              first question anybody asks of a log like this is about something
              old. At a thousand rows a year, ten years of it is a few
              megabytes.
            </Banner>
          )}
        </Stack>
      </main>
    </>
  );
}

export const changesSurface: Surface = {
  id: "changes",
  number: 18,
  title: "What has been changed",
  who: "admins",
  group: "admin",
  blurb:
    "The changes nothing else in the Shoebox records: who may see what, who may do what, and what was deleted. Deliberately not a feed of everything that happened, because the timeline already is one.",
  states: [
    {
      id: "default",
      label: "Everything",
      note: "Grouped by day like the archive itself, newest first. Each row is one sentence that needs no link to make sense, because half of what a log describes no longer exists.",
      render: () => {
        return <ChangesSurface state="default" />;
      },
    },
    {
      id: "authority",
      label: "Who can see what",
      note: "The reason the log exists. A group membership change retroactively grants every photograph ever restricted to that group, which is the most consequential invisible action in the product, so the row says so in words.",
      render: () => {
        return <ChangesSurface state="authority" />;
      },
    },
    {
      id: "person",
      label: "One person's changes",
      note: "Filtered to an actor. Reached from the Members table rather than typed, because the admin arrives at this question holding a name.",
      render: () => {
        return <ChangesSurface state="person" />;
      },
    },
    {
      id: "gone",
      label: "A photograph that is gone",
      note: "The case the schema was shaped around: the subject id dangles on purpose, the labels were denormalised at write time, and the rows still read correctly with nothing to join to.",
      render: () => {
        return <ChangesSurface state="gone" />;
      },
    },
    {
      id: "empty",
      label: "A new Shoebox",
      note: "Nothing has been changed yet. Empty is the correct answer here rather than a failure, and the copy says the rows arrive on their own.",
      render: () => {
        return <ChangesSurface state="empty" />;
      },
    },
  ],
};
