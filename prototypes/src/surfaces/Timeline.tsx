import { Button, NativeSelect } from "@mantine/core";
import { IconChevronDown } from "@tabler/icons-react";
import {
  ARCHIVE_DAYS,
  ARCHIVE_FIRST_DAY,
  ARCHIVE_TOTAL,
  MILESTONE_ONLY_DAY,
  MILESTONES,
  type ArchiveDay,
  type Milestone,
} from "@/data/fixtures";
import { milestoneDayPosition, milestonesForDay } from "@/data/milestones";
import { Chip } from "@/system/Chip";
import { FilterStrip } from "@/system/FilterStrip";
import { ICON_PROPS } from "@/system/icons";
import {
  Archive,
  BurstStack,
  DayRow,
  DaySpine,
  MilestoneBand,
  MilestoneContinues,
  Pile,
  Print,
} from "@/system/Pile";
import { ProductBar } from "@/system/ProductBar";
import { LabelText, Prose } from "@/system/typography";
import classes from "@/system/system.module.css";
import type { Surface } from "@/surfaces/registry";

type TimelineVariant =
  | "pile"
  | "burst"
  | "milestone"
  | "milestone-span"
  | "milestone-empty"
  | "single"
  | "filtered"
  | "end";

/** The jump rail. One control that moves the whole field. */
function JumpRail({ days }: { readonly days: readonly ArchiveDay[] }) {
  return (
    <div className={classes.rail}>
      <NativeSelect
        label={<LabelText component="span">Jump to</LabelText>}
        rightSection={<IconChevronDown {...ICON_PROPS} />}
        data={days.map((day) => {
          return {
            value: day.id,
            label: `${day.dayNumber} ${day.month.slice(0, 3)} · ${day.itemCount}`,
          };
        })}
      />
    </div>
  );
}

function Day({
  day,
  openBurst = false,
  milestones = [],
  alreadyOpened = [],
}: {
  readonly day: ArchiveDay;
  readonly openBurst?: boolean;
  /** The occasions whose span covers this day. */
  readonly milestones?: readonly Milestone[];
  /** Occasions already opened by a day further up the feed. */
  readonly alreadyOpened?: readonly string[];
}) {
  return (
    <DayRow>
      <DaySpine day={day} milestones={milestones} />
      <Pile>
        {milestones.map((milestone) => {
          const position = milestoneDayPosition(milestone, day.date);
          return alreadyOpened.includes(milestone.id) ? (
            <MilestoneContinues
              key={milestone.id}
              milestone={milestone}
              dayPosition={position}
            />
          ) : (
            <MilestoneBand
              key={milestone.id}
              milestone={milestone}
              dayPosition={position}
            />
          );
        })}
        {day.items.length === 0 ? (
          <div className={classes.milestoneEmptyPile}>
            <Prose onPanel>
              Nothing is attached to this one yet, and the day is here anyway.
            </Prose>
            <Button variant="panel" size="sm">
              Find photographs for it
            </Button>
          </div>
        ) : null}
        {day.items.map((item, index) => {
          return item.burst === undefined ? (
            <Print
              key={item.id}
              media={item.media}
              seed={index}
              unseen={item.unseen}
              restrictedLabel={item.restrictedLabel}
              eager={index < 4}
            />
          ) : (
            <BurstStack
              key={item.id}
              cover={item.media}
              frames={item.burst}
              span={item.burstSpan ?? `${item.burst.length} frames`}
              seed={index}
              startOpen={openBurst}
            />
          );
        })}
      </Pile>
    </DayRow>
  );
}

function TimelineSurface({ variant }: { readonly variant: TimelineVariant }) {
  const days =
    variant === "single"
      ? ARCHIVE_DAYS.slice(3)
      : variant === "milestone"
        ? ARCHIVE_DAYS.slice(0, 2)
        : variant === "milestone-span"
          ? ARCHIVE_DAYS.slice(1, 4)
          : variant === "milestone-empty"
            ? [...ARCHIVE_DAYS.slice(4), MILESTONE_ONLY_DAY]
            : variant === "filtered"
              ? ARCHIVE_DAYS.slice(1, 3)
              : variant === "end"
                ? ARCHIVE_DAYS.slice(3)
                : ARCHIVE_DAYS.slice(1, 4);

  return (
    <>
      <ProductBar />
      {variant === "filtered" ? (
        <FilterStrip
          count={318}
          onClear={() => {
            return undefined;
          }}
        >
          <Chip
            onPanel
            onRemove={() => {
              return undefined;
            }}
            removeLabel="Stop filtering by Mateo"
          >
            Mateo
          </Chip>
          <Chip
            onPanel
            onRemove={() => {
              return undefined;
            }}
            removeLabel="Stop filtering by hospital"
          >
            hospital
          </Chip>
          <Chip
            onPanel
            onRemove={() => {
              return undefined;
            }}
            removeLabel="Clear the date range"
          >
            Sep 2026
          </Chip>
        </FilterStrip>
      ) : null}

      <Archive>
        <JumpRail days={days} />
        <div aria-hidden="true" />

        {days.map((day, index) => {
          const covering = milestonesForDay(MILESTONES, day.date);
          const opened = days.slice(0, index).flatMap((earlier) => {
            return milestonesForDay(MILESTONES, earlier.date).map(
              (milestone) => {
                return milestone.id;
              },
            );
          });
          return (
            <Day
              key={day.id}
              day={day}
              milestones={covering}
              alreadyOpened={opened}
              openBurst={
                variant === "burst" &&
                day.items.some((item) => {
                  return item.burst !== undefined;
                })
              }
            />
          );
        })}

        {variant === "end" ? (
          <div className={classes.archiveEnd}>
            <LabelText>The beginning</LabelText>
            <p className={classes.milestoneName}>That is all of it.</p>
            <div className={classes.archiveEndRow}>
              <span>{ARCHIVE_FIRST_DAY}, the first day anything went up.</span>
              <span>
                {ARCHIVE_TOTAL.toLocaleString("en-GB")} photos and videos
              </span>
              <span>948 days</span>
            </div>
            <Prose onPanel>
              Nothing is archived away and nothing expires. Scrolling to here
              means you have seen the whole thing.
            </Prose>
          </div>
        ) : null}
      </Archive>
    </>
  );
}

export const timelineSurface: Surface = {
  id: "timeline",
  number: 2,
  title: "The timeline",
  who: "every member",
  group: "member",
  blurb:
    "The pile by day, under a date spine that never scrolls away. No albums and no manual grouping, because both are curation.",
  states: [
    {
      id: "pile",
      label: "The pile",
      note: "Three days, a sticky spine, one burst collapsed into a stack, and one item restricted so only its uploader and the admins see it.",
      render: () => {
        return <TimelineSurface variant="pile" />;
      },
    },
    {
      id: "burst",
      label: "A burst fanned",
      note: "Forty-five near-identical frames opened in place on a sunk ground, tilted and overlapping, never a uniform grid of squares.",
      render: () => {
        return <TimelineSurface variant="burst" />;
      },
    },
    {
      id: "milestone",
      label: "A milestone inline",
      note: "An occasion at its own date, carried by structural rules and figure type. There is no milestone view to navigate to.",
      render: () => {
        return <TimelineSurface variant="milestone" />;
      },
    },
    {
      id: "milestone-span",
      label: "A milestone over several days",
      note: "A milestone is a span, not a point. The full band opens it on the first of its days you meet; every later day carries the quiet continuation strip, so five days of a visit read as one visit.",
      render: () => {
        return <TimelineSurface variant="milestone-span" />;
      },
    },
    {
      id: "milestone-empty",
      label: "A milestone with nothing in it",
      note: "Made from nothing and still standing at its own date. A family knows the day happened whether or not anybody got a picture of it.",
      render: () => {
        return <TimelineSurface variant="milestone-empty" />;
      },
    },
    {
      id: "single",
      label: "A day with one item",
      note: "The spine still carries the day. One print in a nine-column pile has to read as deliberate rather than broken.",
      render: () => {
        return <TimelineSurface variant="single" />;
      },
    },
    {
      id: "filtered",
      label: "Filtered",
      note: "What the pile is showing, in a strip you cannot miss. A filter left on by accident is this surface's worst failure.",
      render: () => {
        return <TimelineSurface variant="filtered" />;
      },
    },
    {
      id: "end",
      label: "The end of the archive",
      note: "There is an end, and reaching the end of a family's whole history is worth marking rather than just stopping.",
      render: () => {
        return <TimelineSurface variant="end" />;
      },
    },
  ],
};
