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
import type {
  ItemSummary,
  MediaRef,
  MilestoneRef,
} from "@memory-shoebox/shared";
import {
  dayNumberLabel,
  milestoneDatesLabel,
  monthLabel,
  runtimeLabel,
  visibilityLabel,
} from "@/system/labels";
import { ICON_PROPS_SMALL } from "@/system/icons";
import { LabelText } from "@/system/typography";
import classes from "@/system/system.module.css";

/*
 * `TimelineDay` and its two milestone shapes are specified in full in
 * `docs/prds/2026-09-27-memory-shoebox/tech-specs/apis/timeline.md`
 * § Shared types, and step 4a freezes them into `@memory-shoebox/shared` as
 * `timelineResponseSchema`'s members. They are declared here because the pile
 * is built before the route that serves it. **Step 5b deletes these three
 * declarations and imports them instead.** Until then, this is the only copy,
 * and it is a transcription of a normative document rather than a design.
 */

/** One occasion opening on this day. One at most, resolved by the server. */
export type DayMilestoneBand = {
  readonly milestone: MilestoneRef;
  /** 1-based position of this day within the span. */
  readonly dayPosition: number;
  /** Total days in the span, both ends counted. 1 for a one-day occasion. */
  readonly dayCount: number;
  /** The whole occasion's per-viewer total, for the band's "212 items". */
  readonly itemCount: number;
};

/** Every other occasion covering this day, as a continuation strip. */
export type DayMilestoneStrip = {
  readonly milestone: MilestoneRef;
  readonly dayPosition: number;
  readonly dayCount: number;
};

export type TimelineDay = {
  /** `YYYY-MM-DD`, local to the Shoebox timezone. The grouping key. */
  readonly capturedOn: string;
  /** Every visible item on the day, burst frames counted individually. */
  readonly itemCount: number;
  /** Visible items with no view record for this viewer. Drives "31 new". */
  readonly unseenCount: number;
  readonly milestoneBand: DayMilestoneBand | null;
  readonly milestoneStrips: readonly DayMilestoneStrip[];
  /** One entry per print the pile draws. Empty on a milestone-only day. */
  readonly items: readonly ItemSummary[];
};

/**
 * A cheap deterministic hash. Enough scatter to look unsorted, stable across
 * reloads so the wall does not jitter every time somebody visits.
 */
function _seededUnit(index: number): number {
  const value = Math.sin(index * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

/**
 * The tilt, offset and stacking order of one print, seeded from its position
 * in the pile. Computed rather than authored, which is why it is an inline
 * style: there is one value per print and it is derived, not chosen.
 */
export function scatterStyle(seed: number): CSSProperties {
  const rotation = _seededUnit(seed);
  const across = _seededUnit(seed + 101);
  const down = _seededUnit(seed + 211);
  return {
    "--r": `${(rotation * 5 - 2.5).toFixed(2)}deg`,
    "--dx": `${(across * 10 - 5).toFixed(1)}px`,
    "--dy": `${(down * 10 - 5).toFixed(1)}px`,
    "--z": String(1 + Math.floor(rotation * 6)),
  } as CSSProperties;
}

type PrintProps = {
  readonly media: MediaRef;
  readonly seed: number;
  readonly unseen?: boolean;
  /** The words on the lock chip, when the item is not visible to everyone. */
  readonly restrictedLabel?: string;
  readonly selected?: boolean;
  readonly onClick?: () => void;
  readonly eager?: boolean;
  /** How many tags, people or milestones have just been put on this one. */
  readonly labelCount?: number;
};

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
}: PrintProps): ReactNode {
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
        src={media.thumb.url}
        alt={media.altText}
        width={media.thumb.width}
        height={media.thumb.height}
        loading={eager ? "eager" : "lazy"}
      />
      {media.durationMs === null ? null : (
        <span className={classes.printRuntime}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 5.5v13l11-6.5z" />
          </svg>
          {runtimeLabel(media.durationMs)}
        </span>
      )}
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

type BurstStackProps = {
  readonly cover: ItemSummary;
  /** Absent until the burst has been opened and its frames fetched. */
  readonly frames?: readonly ItemSummary[];
  /** How many frames this viewer can see. Never a stored count. */
  readonly frameCount: number;
  readonly span: string;
  readonly seed: number;
  /** Called when the collapsed stack is pressed. A later step fetches them. */
  readonly onOpen?: () => void;
  readonly startOpen?: boolean;
};

/**
 * The stack. The load-bearing idea: forty-five near-identical frames of one
 * moment are one object in the pile until somebody asks for them, so a birth
 * does not bury the rest of the day.
 */
export function BurstStack({
  cover,
  frames,
  frameCount,
  span,
  seed,
  onOpen,
  startOpen = false,
}: BurstStackProps): ReactNode {
  const [isOpen, setIsOpen] = useState(startOpen);

  /*
   * An open fan with nothing in it is not a state this component has. The
   * frames arrive separately, from the burst's own route, so pressing the
   * stack asks for them and the fan opens when they land. Keeping the two
   * conditions together here is what stops a caller passing `startOpen` with
   * no frames and drawing a header over an empty run.
   */
  const isFanned = isOpen && frames !== undefined;
  const stackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsOpen(startOpen);
  }, [startOpen]);

  return (
    <div
      ref={stackRef}
      className={clsx(classes.stack, isFanned && classes.stackOpen)}
      onKeyDown={(event) => {
        if (event.key === "Escape" && isFanned) {
          setIsOpen(false);
        }
      }}
    >
      {isFanned ? (
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
          {(frames ?? []).map((frame, index) => {
            return (
              <Print
                key={frame.itemId}
                media={frame.media}
                seed={seed + index + 1}
              />
            );
          })}
        </div>
      ) : (
        <>
          <Print
            media={cover.media}
            seed={seed}
            onClick={() => {
              setIsOpen(true);
              onOpen?.();
            }}
          />
          <span className={classes.stackCount}>
            {frameCount} <small>frames</small>
          </span>
        </>
      )}
    </div>
  );
}

type PileProps = {
  readonly children: ReactNode;
};

/** The multi-column pile. Columns pack flush, crop nothing, leave no holes. */
export function Pile({ children }: PileProps): ReactNode {
  return <div className={classes.pile}>{children}</div>;
}

type PileItemsProps = {
  readonly items: readonly ItemSummary[];
  readonly seedBase?: number;
  /** Frames for a burst that has been opened, keyed by burst id. */
  readonly framesByBurstId?: ReadonlyMap<string, readonly ItemSummary[]>;
  readonly onOpenBurst?: (burstId: string) => void;
  readonly onOpenItem?: (itemId: string) => void;
};

/** Renders one day's items, collapsing any burst into a single stack. */
export function PileItems({
  items,
  seedBase = 0,
  framesByBurstId,
  onOpenBurst,
  onOpenItem,
}: PileItemsProps): ReactNode {
  return (
    <>
      {items.map((item, index) => {
        /* Bound before the branch so the callback below keeps the narrowing. */
        const burst = item.burst;
        return burst === null ? (
          <Print
            key={item.itemId}
            media={item.media}
            seed={seedBase + index}
            unseen={item.isUnseen}
            restrictedLabel={
              item.visibility.mode === "everyone"
                ? undefined
                : visibilityLabel(item.visibility)
            }
            eager={index < 4}
            onClick={() => {
              return onOpenItem?.(item.itemId);
            }}
          />
        ) : (
          <BurstStack
            key={item.itemId}
            cover={item}
            frames={framesByBurstId?.get(burst.burstId)}
            frameCount={burst.visibleFrameCount}
            span={`${burst.visibleFrameCount} frames`}
            seed={seedBase + index}
            onOpen={() => {
              return onOpenBurst?.(burst.burstId);
            }}
          />
        );
      })}
    </>
  );
}

type DaySpineProps = {
  readonly day: TimelineDay;
  /** The unit word beside the count. "photos" unless a filter says otherwise. */
  readonly countLabel?: string;
};

/**
 * The date spine: the fixed legend that a drifting field runs under. Sticky
 * on desktop, an opaque in-flow baseline row below 44rem, and never a
 * floating translucent header.
 */
export function DaySpine({ day, countLabel }: DaySpineProps): ReactNode {
  const unit = countLabel ?? (day.itemCount === 1 ? "photo" : "photos");
  return (
    <div className={classes.spine}>
      <p className={classes.spineFigure}>{dayNumberLabel(day.capturedOn)}</p>
      <LabelText className={classes.spineMonth}>
        {monthLabel(day.capturedOn)}
      </LabelText>
      <p className={classes.spineCount}>
        {day.itemCount.toLocaleString("en-GB")}{" "}
        <span className={classes.spineCountLabel}>{unit}</span>
      </p>
      {day.unseenCount > 0 ? (
        <p className={classes.unseen}>{day.unseenCount} new</p>
      ) : null}
      {[
        ...(day.milestoneBand === null ? [] : [day.milestoneBand]),
        ...day.milestoneStrips,
      ].map((entry) => {
        return (
          <div
            className={classes.spineMilestone}
            key={entry.milestone.milestoneId}
          >
            <LabelText>
              {entry.dayCount === 1
                ? "Milestone"
                : `Milestone · day ${entry.dayPosition} of ${entry.dayCount}`}
            </LabelText>
            <p className={classes.spineMilestoneName}>{entry.milestone.name}</p>
          </div>
        );
      })}
    </div>
  );
}

type MilestoneBandProps = {
  readonly band: DayMilestoneBand;
};

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
export function MilestoneBand({ band }: MilestoneBandProps): ReactNode {
  return (
    <div className={classes.milestoneBand}>
      <LabelText className={classes.spineMonth}>Milestone</LabelText>
      <p className={classes.milestoneName}>{band.milestone.name}</p>
      <p className={classes.milestoneMeta}>
        <span>{milestoneDatesLabel(band.milestone)}</span>
        {band.dayCount === 1 ? null : <span>{band.dayCount} days</span>}
        <span>
          {band.itemCount} {band.itemCount === 1 ? "item" : "items"}
        </span>
        {band.milestone.blurb === null ? null : (
          <span>{band.milestone.blurb}</span>
        )}
      </p>
      {band.dayCount === 1 ? null : (
        <p className={classes.milestoneMeta}>
          <span>
            This day is day {band.dayPosition} of the {band.dayCount}.
          </span>
        </p>
      )}
    </div>
  );
}

type MilestoneContinuesProps = {
  readonly strip: DayMilestoneStrip;
};

/** The same occasion, on a later day of its own span. */
export function MilestoneContinues({
  strip,
}: MilestoneContinuesProps): ReactNode {
  return (
    <div className={classes.milestoneContinues}>
      <span className={classes.milestoneContinuesDay}>
        Milestone · day {strip.dayPosition} of {strip.dayCount}
      </span>
      <span className={classes.milestoneContinuesName}>
        {strip.milestone.name}
      </span>
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

type ArchiveProps = {
  readonly children: ReactNode;
  readonly component?: "main" | "section";
};

/**
 * The two-column archive frame: the spine, then the field it holds still.
 *
 * It is the page's landmark on the timeline and a plain section wherever the
 * pile appears under something else, such as a set of results.
 */
export function Archive({
  children,
  component: Component = "main",
}: ArchiveProps): ReactNode {
  return <Component className={classes.archive}>{children}</Component>;
}

type DayRowProps = {
  readonly children: ReactNode;
};

/** One grid row of the archive: `display: contents`, so the spine can stick. */
export function DayRow({ children }: DayRowProps): ReactNode {
  return <section className={classes.day}>{children}</section>;
}
