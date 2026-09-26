import { Button } from "@mantine/core";
import { IconCheck, IconLock, IconTag } from "@tabler/icons-react";
import { clsx } from "clsx";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import type { ArchiveDay, Milestone, PileItem } from "@/data/fixtures";
import {
  describeMilestoneDates,
  milestoneDayCount,
  milestoneDayPosition,
} from "@/data/milestones";
import type { MediaRef } from "@/data/media";
import { ICON_PROPS_SMALL } from "@/system/icons";
import { LabelText } from "@/system/typography";
import classes from "@/system/system.module.css";

/**
 * A cheap deterministic hash. Enough scatter to look unsorted, stable across
 * reloads so the wall does not jitter every time somebody visits.
 */
function seededUnit(index: number): number {
  const value = Math.sin(index * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

/**
 * The tilt, offset and stacking order of one print, seeded from its position
 * in the pile. Computed rather than authored, which is why it is an inline
 * style: there is one value per print and it is derived, not chosen.
 */
export function scatterStyle(seed: number): CSSProperties {
  const rotation = seededUnit(seed);
  const across = seededUnit(seed + 101);
  const down = seededUnit(seed + 211);
  return {
    "--r": `${(rotation * 5 - 2.5).toFixed(2)}deg`,
    "--dx": `${(across * 10 - 5).toFixed(1)}px`,
    "--dy": `${(down * 10 - 5).toFixed(1)}px`,
    "--z": String(1 + Math.floor(rotation * 6)),
  } as CSSProperties;
}

/**
 * A print: a photograph stuck flat on the panel with 5px of paper around it
 * and a contact shadow. No card shell, no radius, no decorative shadow, and
 * never cropped to a square.
 */
export function Print({
  media,
  seed,
  unseen = false,
  restrictedLabel,
  selected,
  onClick,
  eager = false,
  labelCount,
}: {
  readonly media: MediaRef;
  readonly seed: number;
  readonly unseen?: boolean;
  readonly restrictedLabel?: string;
  readonly selected?: boolean;
  readonly onClick?: () => void;
  readonly eager?: boolean;
  /** How many tags, people or milestones have just been put on this one. */
  readonly labelCount?: number;
}): ReactNode {
  return (
    <button
      type="button"
      className={clsx(
        classes.print,
        selected !== undefined && classes.printSelectable,
        selected === true && classes.printSelected,
      )}
      style={scatterStyle(seed)}
      onClick={onClick}
      aria-pressed={selected}
    >
      <img
        src={media.thumb}
        alt={media.alt}
        width={media.width}
        height={media.height}
        loading={eager ? "eager" : "lazy"}
      />
      {media.kind === "video" && media.runtime !== undefined ? (
        <span className={classes.printRuntime}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 5.5v13l11-6.5z" />
          </svg>
          {media.runtime}
        </span>
      ) : null}
      {restrictedLabel === undefined ? null : (
        <span className={classes.printRestricted}>
          <IconLock {...ICON_PROPS_SMALL} />
          {restrictedLabel}
        </span>
      )}
      {unseen ? (
        <span className={classes.printUnseen}>
          <span className="visually-hidden">Not seen yet</span>
        </span>
      ) : null}
      {selected === true ? (
        <span className={classes.printTick} aria-hidden="true">
          <IconCheck size="1.15rem" stroke={2.5} />
        </span>
      ) : null}
      {labelCount === undefined || labelCount === 0 ? null : (
        <span className={classes.printLabels}>
          <IconTag size="0.85rem" stroke={2} />
          {labelCount}
        </span>
      )}
    </button>
  );
}

/**
 * The stack. The load-bearing idea: forty-five near-identical frames of one
 * moment are one object in the pile until somebody asks for them, so a birth
 * does not bury the rest of the day.
 */
export function BurstStack({
  cover,
  frames,
  span,
  seed,
  startOpen = false,
}: {
  readonly cover: MediaRef;
  readonly frames: readonly MediaRef[];
  readonly span: string;
  readonly seed: number;
  readonly startOpen?: boolean;
}): ReactNode {
  const [isOpen, setIsOpen] = useState(startOpen);
  const stackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsOpen(startOpen);
  }, [startOpen]);

  return (
    <div
      ref={stackRef}
      className={clsx(classes.stack, isOpen && classes.stackOpen)}
      onKeyDown={(event) => {
        if (event.key === "Escape" && isOpen) {
          setIsOpen(false);
        }
      }}
    >
      {isOpen ? (
        <div className={classes.fan}>
          <div className={classes.fanHead}>
            <b className={classes.fanHeadLabel}>{span}</b>
            <Button
              variant="panel"
              size="sm"
              onClick={() => {
                return setIsOpen(false);
              }}
            >
              Collapse
            </Button>
          </div>
          {frames.map((frame, index) => {
            return (
              <Print key={frame.id} media={frame} seed={seed + index + 1} />
            );
          })}
        </div>
      ) : (
        <>
          <Print
            media={cover}
            seed={seed}
            onClick={() => {
              return setIsOpen(true);
            }}
          />
          <span className={classes.stackCount}>
            {frames.length} <small>frames</small>
          </span>
        </>
      )}
    </div>
  );
}

/** The multi-column pile. Columns pack flush, crop nothing, leave no holes. */
export function Pile({
  children,
}: {
  readonly children: ReactNode;
}): ReactNode {
  return <div className={classes.pile}>{children}</div>;
}

/** Renders one day's items, collapsing any burst into a single stack. */
export function PileItems({
  items,
  seedBase = 0,
}: {
  readonly items: readonly PileItem[];
  readonly seedBase?: number;
}): ReactNode {
  return (
    <>
      {items.map((item, index) => {
        return item.burst === undefined ? (
          <Print
            key={item.id}
            media={item.media}
            seed={seedBase + index}
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
            seed={seedBase + index}
          />
        );
      })}
    </>
  );
}

/**
 * The date spine: the fixed legend that a drifting field runs under. Sticky
 * on desktop, an opaque in-flow baseline row below 44rem, and never a
 * floating translucent header.
 */
export function DaySpine({
  day,
  countLabel,
  milestones = [],
}: {
  readonly day: ArchiveDay;
  readonly countLabel?: string;
  readonly milestones?: readonly Milestone[];
}): ReactNode {
  const unit = countLabel ?? (day.itemCount === 1 ? "photo" : "photos");
  return (
    <div className={classes.spine}>
      <p className={classes.spineFigure}>{day.dayNumber}</p>
      <LabelText className={classes.spineMonth}>{day.month}</LabelText>
      <p className={classes.spineCount}>
        {day.itemCount.toLocaleString("en-GB")}{" "}
        <span className={classes.spineCountLabel}>{unit}</span>
      </p>
      {day.unseenCount > 0 ? (
        <p className={classes.unseen}>{day.unseenCount} new</p>
      ) : null}
      {milestones.map((milestone) => {
        const position = milestoneDayPosition(milestone, day.date);
        const total = milestoneDayCount(milestone);
        return (
          <div className={classes.spineMilestone} key={milestone.id}>
            <LabelText>
              {total === 1
                ? "Milestone"
                : `Milestone · day ${position} of ${total}`}
            </LabelText>
            <p className={classes.spineMilestoneName}>{milestone.name}</p>
          </div>
        );
      })}
    </div>
  );
}

/**
 * A milestone sitting inline in the timeline. It reads as an occasion through
 * structural rules and figure type: there is no separate milestone view to
 * navigate to, and no card to put it in.
 *
 * A milestone is a span, so it appears twice over: the full band opens it on
 * the first of its days you meet, and every later day of the same occasion
 * carries the quiet continuation strip instead. Five days of a visit have to
 * read as one visit, not as five separate occasions that happen to share a
 * name.
 */
export function MilestoneBand({
  milestone,
  dayPosition,
}: {
  readonly milestone: Milestone;
  /** Which day of the span this is standing on, if it is in a timeline. */
  readonly dayPosition?: number;
}): ReactNode {
  const dayCount = milestoneDayCount(milestone);

  return (
    <div className={classes.milestoneBand}>
      <LabelText className={classes.spineMonth}>Milestone</LabelText>
      <p className={classes.milestoneName}>{milestone.name}</p>
      <p className={classes.milestoneMeta}>
        <span>{describeMilestoneDates(milestone)}</span>
        {dayCount === 1 ? null : <span>{dayCount} days</span>}
        <span>
          {milestone.itemCount} {milestone.itemCount === 1 ? "item" : "items"}
        </span>
        <span>{milestone.blurb}</span>
      </p>
      {dayPosition === undefined || dayCount === 1 ? null : (
        <p className={classes.milestoneMeta}>
          <span>
            This day is day {dayPosition} of the {dayCount}.
          </span>
        </p>
      )}
    </div>
  );
}

/** The same occasion, on a later day of its own span. */
export function MilestoneContinues({
  milestone,
  dayPosition,
}: {
  readonly milestone: Milestone;
  readonly dayPosition: number;
}): ReactNode {
  return (
    <div className={classes.milestoneContinues}>
      <span className={classes.milestoneContinuesDay}>
        Milestone · day {dayPosition} of {milestoneDayCount(milestone)}
      </span>
      <span className={classes.milestoneContinuesName}>{milestone.name}</span>
    </div>
  );
}

/** The pile's own footprint, drawn rather than described in a sentence. */
export function Ghosts(): ReactNode {
  return (
    <div className={classes.ghosts} aria-hidden="true">
      <span className={clsx(classes.ghost, classes.ghostWide)} />
      <span className={classes.ghost} />
      <span className={clsx(classes.ghost, classes.ghostTall)} />
      <span className={classes.ghost} />
      <span className={clsx(classes.ghost, classes.ghostWide)} />
      <span className={classes.ghost} />
    </div>
  );
}

/**
 * The two-column archive frame: the spine, then the field it holds still.
 *
 * It is the page's landmark on the timeline and a plain section wherever the
 * pile appears under something else, such as a set of results.
 */
export function Archive({
  children,
  component: Component = "main",
}: {
  readonly children: ReactNode;
  readonly component?: "main" | "section";
}): ReactNode {
  return <Component className={classes.archive}>{children}</Component>;
}

/** One grid row of the archive: `display: contents`, so the spine can stick. */
export function DayRow({
  children,
}: {
  readonly children: ReactNode;
}): ReactNode {
  return <section className={classes.day}>{children}</section>;
}
