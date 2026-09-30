// apps/server/scripts/archiveSeed/archivePlan.ts

/**
 * What the development seed writes, as data.
 *
 * Separating the plan from the writing is what makes it testable: every state
 * surfaces 2, 5, 6 and 7 have to reach is a property of this object, asserted
 * in `test/archivePlan.test.ts`, and a change that quietly loses one fails
 * there rather than in a side-by-side nobody runs.
 *
 * **Nothing here feeds a count the product reads.** The seed writes rows; every
 * figure on screen is still counted by the server from those rows with the
 * viewer's own predicate applied (`data-models.md` Decision 3).
 */

/** The group restricted items are shared with, which the viewer is not in. */
export const RESTRICTED_GROUP_NAME = "Just us two";

/** Who may see one planned item. */
export type PlannedVisibility = "everyone" | typeof RESTRICTED_GROUP_NAME;

/** One photograph or video the seed writes. */
export type PlannedItem = {
  /** Unique, and the stem of every storage key this item owns. */
  readonly key: string;
  /** The cartoon file backing it, without a directory or an extension. */
  readonly scene: string;
  readonly kind: "photo" | "video";
  readonly capturedOn: string;
  /** Minutes past midnight, which orders a day and spaces a burst. */
  readonly minuteOfDay: number;
  readonly visibility: PlannedVisibility;
  /** Set on every frame of one run. Undefined on a plain print. */
  readonly burstKey: string | undefined;
  readonly tags: readonly string[];
  readonly people: readonly string[];
  /** Whether the viewer already has an `item_views` row for it. */
  readonly seenByViewer: boolean;
};

/** One day the seed writes, whether or not anything landed on it. */
export type PlannedDay = { readonly capturedOn: string };

/** One occasion, spelled as the days it covers. */
export type PlannedMilestone = {
  readonly name: string;
  readonly days: readonly string[];
  /** The line under the occasion's name. Undefined on an occasion with none. */
  readonly blurb: string | undefined;
};

/** Everything the seed writes. */
export type ArchivePlan = {
  readonly days: readonly PlannedDay[];
  readonly items: readonly PlannedItem[];
  readonly milestones: readonly PlannedMilestone[];
  readonly people: readonly string[];
  readonly tags: readonly string[];
};

/** The eight generated scenes, cycled through so the pile is not one picture. */
const SCENES = [
  "arrival",
  "cot",
  "bath",
  "highChair",
  "pram",
  "firstSteps",
  "cake",
  "beach",
] as const;

/** Makes one ordinary print. */
function _print(options: {
  key: string;
  capturedOn: string;
  minuteOfDay: number;
  index: number;
  visibility?: PlannedVisibility;
  tags?: readonly string[];
  people?: readonly string[];
  seenByViewer?: boolean;
}): PlannedItem {
  return {
    key: options.key,
    scene: SCENES[options.index % SCENES.length] ?? "cot",
    kind: "photo",
    capturedOn: options.capturedOn,
    minuteOfDay: options.minuteOfDay,
    visibility: options.visibility ?? "everyone",
    burstKey: undefined,
    tags: options.tags ?? [],
    people: options.people ?? [],
    seenByViewer: options.seenByViewer ?? false,
  };
}

/** The fat day: over the 400-item page budget's edge, and partly seen. */
function _fatDay(): PlannedItem[] {
  return Array.from({ length: 340 }, (_unused, index) => {
    return _print({
      key: `fat-${String(index + 1).padStart(3, "0")}`,
      capturedOn: "2026-09-27",
      minuteOfDay: 8 * 60 + index,
      index,
      tags: index % 3 === 0 ? ["hospital"] : [],
      people: index % 4 === 0 ? ["Mateo"] : [],
      // Three hundred already seen, forty not, so the spine says "40 new".
      seenByViewer: index < 300,
    });
  });
}

/** The forty-five frame burst, plus three plain prints beside it. */
function _burstDay(): PlannedItem[] {
  const frames = Array.from({ length: 45 }, (_unused, index) => {
    const number = String(index + 1).padStart(3, "0");
    return {
      key: `burst-${number}`,
      // Each frame is its own generated file, `burst_001.jpg` through
      // `burst_045.jpg`, not forty-five references to one still. The whole
      // point of generating the run was that the frames differ.
      scene: `burst_${number}`,
      kind: "photo" as const,
      capturedOn: "2026-09-26",
      // 06:41 to 06:44, which is the run app.config.ts was tuned against.
      minuteOfDay: 6 * 60 + 41 + Math.floor(index / 15),
      visibility: "everyone" as const,
      burstKey: "the-candle",
      tags: ["cake"],
      people: ["Mateo"],
      seenByViewer: false,
    };
  });
  const beside = [0, 1, 2].map((index) => {
    return _print({
      key: `birthday-${index + 1}`,
      capturedOn: "2026-09-26",
      minuteOfDay: 10 * 60 + index * 7,
      index,
      tags: ["cake"],
      people: ["Mateo", "Abuela Rosa"],
    });
  });
  return [...frames, ...beside];
}

/**
 * The two degenerate bursts, both on one old day.
 *
 * One has a single visible frame, which the server must send as a plain print
 * with `burst: null`. The other has none, so nothing may be drawn and nothing
 * counted. Neither is reachable without restricting frames individually.
 */
function _degenerateBursts(): PlannedItem[] {
  const nearlyGone = Array.from({ length: 4 }, (_unused, index) => {
    return {
      key: `lonely-${index + 1}`,
      scene: "pram",
      kind: "photo" as const,
      capturedOn: "2026-08-02",
      minuteOfDay: 9 * 60 + index,
      visibility: (index === 0
        ? "everyone"
        : RESTRICTED_GROUP_NAME) as PlannedVisibility,
      burstKey: "nearly-gone",
      tags: [],
      people: [],
      seenByViewer: false,
    };
  });
  const allGone = Array.from({ length: 3 }, (_unused, index) => {
    return {
      key: `hidden-${index + 1}`,
      scene: "bath",
      kind: "photo" as const,
      capturedOn: "2026-08-02",
      minuteOfDay: 11 * 60 + index,
      visibility: RESTRICTED_GROUP_NAME as PlannedVisibility,
      burstKey: "all-gone",
      tags: ["the garden"],
      people: [],
      seenByViewer: false,
    };
  });
  return [...nearlyGone, ...allGone];
}

/** Everything the seed writes. Read once, never mutated. */
export const ARCHIVE_PLAN: ArchivePlan = {
  days: [
    { capturedOn: "2026-09-27" },
    { capturedOn: "2026-09-26" },
    { capturedOn: "2026-09-25" },
    { capturedOn: "2026-09-24" },
    { capturedOn: "2026-09-23" },
    { capturedOn: "2026-09-22" },
    { capturedOn: "2026-09-21" },
    { capturedOn: "2026-09-15" },
    { capturedOn: "2026-09-10" },
    { capturedOn: "2026-08-02" },
    { capturedOn: "2026-07-04" },
  ],
  items: [
    ..._fatDay(),
    ..._burstDay(),
    // The 25th sits inside two occasions, so the narrower takes the band.
    ...[0, 1, 2, 3, 4, 5].map((index) => {
      return _print({
        key: `home-${index + 1}`,
        capturedOn: "2026-09-25",
        minuteOfDay: 15 * 60 + index * 4,
        index,
        people: ["Mateo", "Papá"],
      });
    }),
    ...[0, 1, 2, 3].map((index) => {
      return _print({
        key: `visit-a-${index + 1}`,
        capturedOn: "2026-09-24",
        minuteOfDay: 12 * 60 + index * 9,
        index,
        people: ["Abuela Rosa"],
      });
    }),
    // A day with exactly one item, which the spine still has to carry.
    _print({
      key: "alone-1",
      capturedOn: "2026-09-23",
      minuteOfDay: 600,
      index: 4,
    }),
    // 2026-09-22 is deliberately absent from `items`: it exists only because
    // an occasion spans it, which is the `milestone-empty` state inside a span.
    ...[0, 1, 2, 3, 4].map((index) => {
      return _print({
        key: `visit-b-${index + 1}`,
        capturedOn: "2026-09-21",
        minuteOfDay: 9 * 60 + index * 11,
        index,
        people: ["Abuela Rosa", "Papá"],
      });
    }),
    // 2026-09-15 holds the occasion nobody photographed.
    ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((index) => {
      return _print({
        key: `beach-${index + 1}`,
        capturedOn: "2026-09-10",
        minuteOfDay: 14 * 60 + index * 3,
        index,
        visibility: index % 4 === 0 ? RESTRICTED_GROUP_NAME : "everyone",
        tags: ["beach"],
        people: ["Abuela Rosa"],
      });
    }),
    ..._degenerateBursts(),
    ...[0, 1, 2].map((index) => {
      return _print({
        key: `summer-${index + 1}`,
        capturedOn: "2026-07-04",
        minuteOfDay: 16 * 60 + index * 6,
        index,
        tags: ["first steps"],
        people: ["Mateo"],
      });
    }),
    {
      key: "summer-video",
      scene: "first-steps",
      kind: "video",
      capturedOn: "2026-07-04",
      minuteOfDay: 17 * 60,
      visibility: "everyone",
      burstKey: undefined,
      tags: ["first steps"],
      people: ["Mateo"],
      seenByViewer: false,
    },
  ],
  milestones: [
    { name: "The first birthday", days: ["2026-09-26"], blurb: "One candle." },
    { name: "Coming home", days: ["2026-09-25"], blurb: undefined },
    {
      name: "Abuela's visit",
      days: [
        "2026-09-21",
        "2026-09-22",
        "2026-09-23",
        "2026-09-24",
        "2026-09-25",
      ],
      blurb: "Five days, one visit.",
    },
    {
      name: "The day nobody got a picture",
      days: ["2026-09-15"],
      blurb: "A family knows the day happened.",
    },
  ],
  people: ["Mateo", "Abuela Rosa", "Papá", "Sofía"],
  tags: ["hospital", "cake", "beach", "first steps", "the garden"],
};

/** Every planned item captured on one day, in capture order. */
export function getItemsOnDay(options: {
  plan: ArchivePlan;
  capturedOn: string;
}): PlannedItem[] {
  return options.plan.items
    .filter((item) => {
      return item.capturedOn === options.capturedOn;
    })
    .toSorted((left, right) => {
      return left.minuteOfDay - right.minuteOfDay;
    });
}
