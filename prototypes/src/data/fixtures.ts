/**
 * Written demonstration content for the mockups.
 *
 * None of this is real. The family, the notes, the counts and the addresses
 * are invented so each surface can be judged at something like true scale: a
 * pile of two thousand items, a Shoebox of nine people, a day holding 212
 * photographs. Counts are deliberately larger than the number of files in
 * `src/data/media.ts`, because how a count reads is part of what is being
 * designed.
 */

import {
  BURST_FRAMES,
  CLIP,
  MORNING,
  NEWBORN,
  UPRIGHT,
  pickVariedFrame,
  type MediaRef,
} from "@/data/media";

export type Role = "viewer" | "uploader" | "admin";
export type Visibility =
  | { readonly mode: "everyone" }
  | { readonly mode: "only"; readonly subjects: readonly string[] }
  | { readonly mode: "except"; readonly subjects: readonly string[] };

export interface Member {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: Role;
  readonly notify: boolean;
  readonly joined: string;
  readonly lastSeen: string;
  readonly status: "active" | "invited";
}

export interface Person {
  readonly id: string;
  readonly name: string;
  /** A tagged person may or may not hold an account. */
  readonly memberId?: string;
  readonly itemCount: number;
  readonly firstSeen?: string;
  readonly lastSeen?: string;
  readonly face: MediaRef | null;
}

export interface Group {
  readonly id: string;
  readonly name: string;
  readonly memberIds: readonly string[];
  /** How many visibility rules point at this group right now. */
  readonly usedByRules: number;
}

export interface Tag {
  readonly id: string;
  readonly name: string;
  readonly itemCount: number;
}

/**
 * The six ways of saying something without writing it.
 *
 * Facebook's set minus anger, which has no place in a family's archive and
 * would be the one reaction somebody regrets leaving on a photograph of their
 * mother. Sad stays, because a picture of somebody who has died earns it.
 */
export type ReactionKind = "like" | "love" | "care" | "haha" | "wow" | "sad";

export interface Reaction {
  readonly kind: ReactionKind;
  /** Who left it. One per person per thing, as everywhere else. */
  readonly by: string;
}

export interface ItemComment {
  readonly id: string;
  readonly author: string;
  readonly when: string;
  readonly body: string;
  /** Seconds into a video, for a comment pinned to a moment. */
  readonly atSeconds?: number;
  readonly reactions?: readonly Reaction[];
  /** Whichever one the person looking has left, if any. */
  readonly myReaction?: ReactionKind;
}

export interface Device {
  readonly id: string;
  readonly label: string;
  readonly place: string;
  readonly lastUsed: string;
  readonly daysIdle: number;
  readonly current: boolean;
  readonly memberId: string;
}

export interface RemovalRequest {
  readonly id: string;
  readonly item: MediaRef;
  readonly requestedBy: string;
  readonly reason?: string;
  readonly when: string;
  readonly state: "open" | "deleted" | "declined" | "withdrawn";
  readonly uploader: string;
  readonly declineReason?: string;
}

/**
 * A dated occasion.
 *
 * It is a span rather than a point, because plenty of occasions are: a
 * christening is an afternoon, a week at the grandparents' is a week, and a
 * college orientation is four days. A one-day milestone is simply one whose
 * span starts and ends on the same date, so nothing downstream has to carry
 * two shapes.
 */
export interface Milestone {
  readonly id: string;
  readonly name: string;
  /** Inclusive ISO dates. Equal for a one-day occasion. */
  readonly startsOn: string;
  readonly endsOn: string;
  readonly itemCount: number;
  readonly blurb: string;
}

export interface PileItem {
  readonly id: string;
  readonly media: MediaRef;
  readonly unseen: boolean;
  /** A collapsed burst carries its frames; a lone print carries none. */
  readonly burst?: readonly MediaRef[];
  readonly burstSpan?: string;
  readonly restrictedLabel?: string;
}

export interface ArchiveDay {
  readonly id: string;
  /** ISO, so a day can be matched against a milestone's span. */
  readonly date: string;
  readonly dayNumber: string;
  readonly month: string;
  readonly year: string;
  readonly itemCount: number;
  readonly unseenCount: number;
  readonly items: readonly PileItem[];
}

/* ------------------------------------------------------------- the people */

/**
 * What this deployment calls itself. One instance of Memory Shoebox is a
 * Shoebox, and the admin names theirs: members see that name and almost never
 * see the software's own.
 */
export const SHOEBOX_NAME = "My Shoebox";

export const MEMBERS: readonly Member[] = [
  {
    id: "mem-andres",
    name: "Papá",
    email: "andres@example.com",
    role: "admin",
    notify: true,
    joined: "March 2024",
    lastSeen: "Today",
    status: "active",
  },
  {
    id: "mem-lucia",
    name: "Mamá",
    email: "lucia@example.com",
    role: "uploader",
    notify: true,
    joined: "March 2024",
    lastSeen: "Today",
    status: "active",
  },
  {
    id: "mem-rosa",
    name: "Abuela Rosa",
    email: "rosa@example.com",
    role: "viewer",
    notify: true,
    joined: "March 2024",
    lastSeen: "Yesterday",
    status: "active",
  },
  {
    id: "mem-ben",
    name: "Lolo Ben",
    email: "ben@example.com",
    role: "viewer",
    notify: true,
    joined: "March 2024",
    lastSeen: "2 days ago",
    status: "active",
  },
  {
    id: "mem-marisol",
    name: "Tía Marisol",
    email: "marisol@example.com",
    role: "uploader",
    notify: false,
    joined: "April 2024",
    lastSeen: "Today",
    status: "active",
  },
  {
    id: "mem-rafa",
    name: "Tío Rafa",
    email: "rafa@example.com",
    role: "viewer",
    notify: true,
    joined: "April 2024",
    lastSeen: "11 days ago",
    status: "active",
  },
  {
    id: "mem-ines",
    name: "Prima Inés",
    email: "ines@example.com",
    role: "viewer",
    notify: false,
    joined: "January 2025",
    lastSeen: "4 days ago",
    status: "active",
  },
  {
    id: "mem-paz",
    name: "Nina Paz",
    email: "paz@example.com",
    role: "viewer",
    notify: true,
    joined: "January 2025",
    lastSeen: "Today",
    status: "active",
  },
  {
    id: "mem-tomas",
    name: "Abuelo Tomás",
    email: "tomas@example.com",
    role: "viewer",
    notify: true,
    joined: "Invited 3 days ago",
    lastSeen: "Never",
    status: "invited",
  },
];

/** Whoever is looking, for the surfaces that change with the role. */
const FIRST_MEMBER = MEMBERS[0];
if (!FIRST_MEMBER) {
  throw new Error("The demonstration Shoebox has no members.");
}
export const CURRENT_MEMBER: Member = FIRST_MEMBER;

export function memberById(id: string): Member | undefined {
  return MEMBERS.find((member) => {
    return member.id === id;
  });
}

export const GROUPS: readonly Group[] = [
  {
    id: "grp-grandparents",
    name: "The grandparents",
    memberIds: ["mem-rosa", "mem-ben", "mem-tomas"],
    usedByRules: 14,
  },
  {
    id: "grp-cousins",
    name: "Cousins",
    memberIds: ["mem-ines", "mem-rafa"],
    usedByRules: 3,
  },
  {
    id: "grp-just-us",
    name: "Just us two",
    memberIds: ["mem-andres", "mem-lucia"],
    usedByRules: 61,
  },
  {
    id: "grp-godparents",
    name: "Godparents",
    memberIds: ["mem-paz", "mem-marisol"],
    usedByRules: 0,
  },
];

/** A person may be a member, or may simply be somebody worth tracking. */
export const PEOPLE: readonly Person[] = [
  {
    id: "per-mateo",
    name: "Mateo",
    itemCount: 1834,
    firstSeen: "14 September 2026",
    lastSeen: "Today",
    face: burstFrameAt(7),
  },
  {
    id: "per-lucia",
    name: "Mamá",
    memberId: "mem-lucia",
    itemCount: 612,
    firstSeen: "March 2024",
    lastSeen: "Today",
    face: NEWBORN,
  },
  {
    id: "per-andres",
    name: "Papá",
    memberId: "mem-andres",
    itemCount: 488,
    firstSeen: "March 2024",
    lastSeen: "Today",
    face: MORNING,
  },
  {
    id: "per-rosa",
    name: "Abuela Rosa",
    memberId: "mem-rosa",
    itemCount: 207,
    firstSeen: "April 2024",
    lastSeen: "2 days ago",
    face: UPRIGHT,
  },
  {
    id: "per-ben",
    name: "Lolo Ben",
    memberId: "mem-ben",
    itemCount: 96,
    firstSeen: "June 2024",
    lastSeen: "11 days ago",
    face: pickVariedFrame(3),
  },
  {
    id: "per-marisol",
    name: "Tía Marisol",
    memberId: "mem-marisol",
    itemCount: 74,
    firstSeen: "August 2024",
    lastSeen: "Yesterday",
    face: pickVariedFrame(5),
  },
  {
    id: "per-ines",
    name: "Prima Inés",
    memberId: "mem-ines",
    itemCount: 41,
    firstSeen: "January 2025",
    lastSeen: "4 days ago",
    face: pickVariedFrame(8),
  },
  {
    id: "per-elena",
    name: "Bisabuela Elena",
    itemCount: 23,
    firstSeen: "July 2024",
    lastSeen: "August 2026",
    face: pickVariedFrame(10),
  },
  {
    id: "per-tomas",
    name: "Abuelo Tomás",
    memberId: "mem-tomas",
    itemCount: 12,
    firstSeen: "May 2025",
    lastSeen: "March 2026",
    face: pickVariedFrame(12),
  },
  {
    id: "per-sofia",
    name: "Sofía",
    itemCount: 0,
    face: null,
  },
];

export const TAGS: readonly Tag[] = [
  { id: "tag-hospital", name: "hospital", itemCount: 412 },
  { id: "tag-mateo", name: "mateo", itemCount: 1834 },
  { id: "tag-sleeping", name: "sleeping", itemCount: 288 },
  { id: "tag-garden", name: "garden", itemCount: 196 },
  { id: "tag-kitchen", name: "kitchen", itemCount: 154 },
  { id: "tag-beach", name: "beach", itemCount: 141 },
  { id: "tag-cake", name: "cake", itemCount: 88 },
  { id: "tag-christmas", name: "christmas", itemCount: 77 },
  { id: "tag-first-steps", name: "first steps", itemCount: 34 },
  { id: "tag-bath", name: "bath", itemCount: 29 },
];

export const MILESTONES: readonly Milestone[] = [
  {
    id: "mil-born",
    name: "Mateo is born",
    startsOn: "2026-09-14",
    endsOn: "2026-09-14",
    itemCount: 212,
    blurb: "6:41 in the morning, three weeks early and in a hurry.",
  },
  {
    id: "mil-home",
    name: "Home from the hospital",
    startsOn: "2026-09-17",
    endsOn: "2026-09-17",
    itemCount: 46,
    blurb: "The car seat took four of us and twenty minutes.",
  },
  {
    id: "mil-visit",
    name: "The week Abuela stayed",
    startsOn: "2026-09-09",
    endsOn: "2026-09-13",
    itemCount: 318,
    blurb: "Five days, one suitcase, and an opinion about the pram.",
  },
  {
    id: "mil-elena",
    name: "Bisabuela Elena turns eighty",
    startsOn: "2026-08-02",
    endsOn: "2026-08-02",
    itemCount: 0,
    blurb: "Nothing attached yet. Marisol has the photographs on her phone.",
  },
];

/**
 * A milestone somebody has just made from nothing, before choosing what goes
 * in it. Its span is the only thing it has, which is what the picker that
 * comes next uses to work out what to offer.
 */
export const NEW_MILESTONE: Milestone = {
  id: "mil-first-week",
  name: "Mateo's first week at home",
  startsOn: "2026-09-17",
  endsOn: "2026-09-21",
  itemCount: 0,
  blurb: "Nothing attached to it yet.",
};

export function milestoneById(id: string): Milestone | undefined {
  return MILESTONES.find((milestone) => {
    return milestone.id === id;
  });
}

/* --------------------------------------------------------------- comments */

export const PHOTO_COMMENTS: readonly ItemComment[] = [
  {
    id: "comment-1",
    author: "Abuela Rosa",
    when: "6:52 am",
    body: "Ay, mi amor. I have been awake since four waiting for this. He has your father's chin, I am telling you now so you cannot argue later.",
    reactions: [
      { kind: "love", by: "Mamá" },
      { kind: "love", by: "Tía Marisol" },
      { kind: "haha", by: "Papá" },
      { kind: "like", by: "Prima Inés" },
    ],
    myReaction: "haha",
  },
  {
    id: "comment-2",
    author: "Tía Marisol",
    when: "7:10 am",
    body: "I have been through all of these twice. The one where he is yawning is the one. Send it to me full size.",
    reactions: [{ kind: "like", by: "Papá" }],
  },
  {
    id: "comment-3",
    author: "Lolo Ben",
    when: "8:34 am",
    body: "Welcome, little one. Took me twenty minutes to work out how to write this. Worth it.",
    reactions: [
      { kind: "care", by: "Mamá" },
      { kind: "love", by: "Abuela Rosa" },
      { kind: "love", by: "Papá" },
      { kind: "love", by: "Nina Paz" },
      { kind: "like", by: "Tío Rafa" },
      { kind: "wow", by: "Prima Inés" },
    ],
  },
];

export const VIDEO_COMMENTS: readonly ItemComment[] = [
  {
    id: "vcomment-1",
    author: "Abuela Rosa",
    when: "9:04 pm",
    atSeconds: 6,
    body: "There! That little sigh right there. Play it again, I have watched it eleven times.",
    reactions: [
      { kind: "love", by: "Mamá" },
      { kind: "haha", by: "Tía Marisol" },
    ],
  },
  {
    id: "vcomment-2",
    author: "Tía Marisol",
    when: "9:22 pm",
    atSeconds: 14,
    body: "He does the exact same hand thing you did as a baby. Same hand, same face.",
    reactions: [{ kind: "love", by: "Papá" }],
  },
  {
    id: "vcomment-3",
    author: "Lolo Ben",
    when: "9:40 pm",
    body: "No notes. Perfect. Send more whenever you have a minute, no rush.",
  },
];

/**
 * What the photograph and the video themselves carry. The media is reacted to
 * the same way a comment is, because for most of the people here a reaction
 * is the whole of what they will ever leave: it is one tap, and writing a
 * sentence is not.
 */
export const PHOTO_REACTIONS: readonly Reaction[] = [
  { kind: "love", by: "Abuela Rosa" },
  { kind: "love", by: "Tía Marisol" },
  { kind: "love", by: "Nina Paz" },
  { kind: "love", by: "Lolo Ben" },
  { kind: "care", by: "Tío Rafa" },
  { kind: "care", by: "Prima Inés" },
  { kind: "like", by: "Mamá" },
  { kind: "wow", by: "Abuelo Tomás" },
];

export const VIDEO_REACTIONS: readonly Reaction[] = [
  { kind: "love", by: "Abuela Rosa" },
  { kind: "haha", by: "Tía Marisol" },
  { kind: "haha", by: "Prima Inés" },
  { kind: "like", by: "Lolo Ben" },
];

/* ---------------------------------------------------------------- devices */

export const MY_DEVICES: readonly Device[] = [
  {
    id: "dev-1",
    label: "iPhone, Safari",
    place: "Madrid",
    lastUsed: "In use now",
    daysIdle: 0,
    current: true,
    memberId: "mem-andres",
  },
  {
    id: "dev-2",
    label: "MacBook Air, Chrome",
    place: "Madrid",
    lastUsed: "3 days ago",
    daysIdle: 3,
    current: false,
    memberId: "mem-andres",
  },
  {
    id: "dev-3",
    label: "iPad in the kitchen, Safari",
    place: "Madrid",
    lastUsed: "26 days ago",
    daysIdle: 26,
    current: false,
    memberId: "mem-andres",
  },
];

export const ALL_DEVICES: readonly Device[] = [
  ...MY_DEVICES,
  {
    id: "dev-4",
    label: "iPhone, Safari",
    place: "Seville",
    lastUsed: "Yesterday",
    daysIdle: 1,
    current: false,
    memberId: "mem-rosa",
  },
  {
    id: "dev-5",
    label: "Windows PC, Edge",
    place: "Seville",
    lastUsed: "19 days ago",
    daysIdle: 19,
    current: false,
    memberId: "mem-ben",
  },
];

/* -------------------------------------------------------- removal requests */

export const REMOVAL_REQUESTS: readonly RemovalRequest[] = [
  {
    id: "rem-1",
    item: pickVariedFrame(4),
    requestedBy: "Prima Inés",
    reason: "I am mid-sentence and it is not a good one. Sorry to be a bother.",
    when: "2 days ago",
    state: "open",
    uploader: "Tía Marisol",
  },
  {
    id: "rem-2",
    item: pickVariedFrame(9),
    requestedBy: "Tío Rafa",
    when: "6 days ago",
    state: "open",
    uploader: "Papá",
  },
  {
    id: "rem-3",
    item: pickVariedFrame(13),
    requestedBy: "Abuela Rosa",
    reason: "Wrong side of me and you know it.",
    when: "3 weeks ago",
    state: "deleted",
    uploader: "Mamá",
  },
  {
    id: "rem-5",
    item: pickVariedFrame(6),
    requestedBy: "Tía Marisol",
    reason: "Ignore me, I found a better one of the same moment.",
    when: "2 weeks ago",
    state: "withdrawn",
    uploader: "Mamá",
  },
  {
    id: "rem-4",
    item: pickVariedFrame(2),
    requestedBy: "Prima Inés",
    reason: "I look half asleep.",
    when: "5 weeks ago",
    state: "declined",
    uploader: "Papá",
    declineReason:
      "It is the only one with all four of you in it. Keeping it, but it is off the front of the day now.",
  },
];

/* ------------------------------------------------------------- the archive */

/** One frame of the burst by its human number, without an index assertion. */
function burstFrameAt(frameNumber: number): MediaRef {
  const frame = BURST_FRAMES[frameNumber - 1];
  if (!frame) {
    throw new Error(`The burst has no frame ${frameNumber}.`);
  }
  return frame;
}

/** A pile of the given length, walking the varied frames for real shapes. */
function createPileItems(
  dayId: string,
  count: number,
  unseenEvery: number,
): readonly PileItem[] {
  return Array.from({ length: count }, (_unused, index) => {
    return {
      id: `${dayId}-item-${index}`,
      media: pickVariedFrame(index + dayId.length),
      unseen: unseenEvery > 0 && index % unseenEvery === 0,
    };
  });
}

const SEPTEMBER_14: ArchiveDay = {
  id: "day-2026-09-14",
  date: "2026-09-14",
  dayNumber: "14",
  month: "September",
  year: "2026",
  itemCount: 212,
  unseenCount: 31,
  items: [
    { id: "d14-lead", media: NEWBORN, unseen: true },
    {
      id: "d14-burst",
      media: burstFrameAt(7),
      unseen: false,
      burst: BURST_FRAMES,
      burstSpan: "45 frames, 06:41 to 06:44",
    },
    { id: "d14-clip", media: CLIP, unseen: true },
    { id: "d14-morning", media: MORNING, unseen: false },
    {
      id: "d14-upright",
      media: UPRIGHT,
      unseen: false,
      restrictedLabel: "Just us two",
    },
    ...createPileItems("d14", 15, 4),
  ],
};

/** A second milestone, three days later, so two can be seen at once. */
const SEPTEMBER_17: ArchiveDay = {
  id: "day-2026-09-17",
  date: "2026-09-17",
  dayNumber: "17",
  month: "September",
  year: "2026",
  itemCount: 46,
  unseenCount: 12,
  items: createPileItems("d17", 9, 3),
};

const SEPTEMBER_13: ArchiveDay = {
  id: "day-2026-09-13",
  date: "2026-09-13",
  dayNumber: "13",
  month: "September",
  year: "2026",
  itemCount: 168,
  unseenCount: 0,
  items: createPileItems("d13", 14, 0),
};

const SEPTEMBER_11: ArchiveDay = {
  id: "day-2026-09-11",
  date: "2026-09-11",
  dayNumber: "11",
  month: "September",
  year: "2026",
  itemCount: 94,
  unseenCount: 6,
  items: createPileItems("d11", 11, 5),
};

/** A day that holds exactly one thing, which has to read as deliberate. */
const SEPTEMBER_02: ArchiveDay = {
  id: "day-2026-09-02",
  date: "2026-09-02",
  dayNumber: "2",
  month: "September",
  year: "2026",
  itemCount: 1,
  unseenCount: 0,
  items: [{ id: "d02-only", media: pickVariedFrame(7), unseen: false }],
};

/**
 * A day that holds a milestone and no photographs. A family knows the day
 * happened whether or not anybody got a picture of it, so the occasion still
 * stands in the timeline at its own date.
 */
export const MILESTONE_ONLY_DAY: ArchiveDay = {
  id: "day-2026-08-02",
  date: "2026-08-02",
  dayNumber: "2",
  month: "August",
  year: "2026",
  itemCount: 0,
  unseenCount: 0,
  items: [],
};

export const ARCHIVE_DAYS: readonly ArchiveDay[] = [
  SEPTEMBER_17,
  SEPTEMBER_14,
  SEPTEMBER_13,
  SEPTEMBER_11,
  SEPTEMBER_02,
];

export const ARCHIVE_TOTAL = 2147;
export const ARCHIVE_FIRST_DAY = "11 March 2024";

/* ------------------------------------------------------------------ upload */

/**
 * A batch of media, grouped the way the archive groups everything: by the day
 * it was captured on.
 *
 * One upload is not one day. A phone that has not been emptied since the
 * hospital holds three weeks of it, and the capture dates come off the files
 * rather than from whoever is doing the uploading. One upload is not one
 * milestone either: this batch covers two, and a day in the middle that is
 * simply a Tuesday.
 */
export interface UploadDay {
  readonly id: string;
  /** ISO, so a day can be matched against a milestone's span. */
  readonly date: string;
  readonly dayNumber: string;
  readonly month: string;
  readonly year: string;
  /** Everything captured that day, of which `items` is the visible sample. */
  readonly totalCount: number;
  readonly items: readonly MediaRef[];
  /** Set once somebody puts the day, or part of it, under a milestone. */
  readonly milestoneId?: string;
}

function createUploadItems(
  dayId: string,
  count: number,
  offset: number,
): readonly MediaRef[] {
  return Array.from({ length: count }, (_unused, index) => {
    const frame = pickVariedFrame(index + offset);
    return { ...frame, id: `${dayId}-${index}` };
  });
}

export const UPLOAD_DAYS: readonly UploadDay[] = [
  {
    id: "up-day-17",
    date: "2026-09-17",
    dayNumber: "17",
    month: "September",
    year: "2026",
    totalCount: 46,
    items: createUploadItems("up-day-17", 8, 2),
    milestoneId: "mil-home",
  },
  {
    id: "up-day-15",
    date: "2026-09-15",
    dayNumber: "15",
    month: "September",
    year: "2026",
    totalCount: 6,
    items: createUploadItems("up-day-15", 6, 11),
  },
  {
    id: "up-day-14",
    date: "2026-09-14",
    dayNumber: "14",
    month: "September",
    year: "2026",
    totalCount: 212,
    items: [
      { ...NEWBORN, id: "up-day-14-lead" },
      { ...MORNING, id: "up-day-14-morning" },
      { ...CLIP, id: "up-day-14-clip" },
      { ...UPRIGHT, id: "up-day-14-upright" },
      ...createUploadItems("up-day-14", 6, 5),
    ],
    milestoneId: "mil-born",
  },
];

/** What the whole batch adds up to, which is the figure the surface leads on. */
export const UPLOAD_TOTAL = UPLOAD_DAYS.reduce((sum, day) => {
  return sum + day.totalCount;
}, 0);

export interface UploadFile {
  readonly id: string;
  readonly name: string;
  readonly size: string;
  readonly media: MediaRef | null;
  readonly state: "waiting" | "sending" | "done" | "failed" | "refused";
  readonly percent: number;
  readonly problem?: string;
}

/**
 * A batch that has finished with two casualties. Separate from the in-flight
 * list because a batch that half-worked must never read as one still running.
 */
export const UPLOAD_FILES_SETTLED: readonly UploadFile[] = [
  {
    id: "settled-1",
    name: "IMG_4620.HEIC",
    size: "4.1 MB",
    media: NEWBORN,
    state: "done",
    percent: 100,
  },
  {
    id: "settled-2",
    name: "IMG_4681.HEIC",
    size: "3.8 MB",
    media: MORNING,
    state: "done",
    percent: 100,
  },
  {
    id: "settled-3",
    name: "IMG_9247.MOV",
    size: "184 MB",
    media: CLIP,
    state: "done",
    percent: 100,
  },
  {
    id: "settled-4",
    name: "IMG_4702.HEIC",
    size: "3.9 MB",
    media: pickVariedFrame(1),
    state: "failed",
    percent: 0,
    problem: "The connection dropped partway through.",
  },
  {
    id: "settled-5",
    name: "scan-of-the-card.pdf",
    size: "220 KB",
    media: null,
    state: "refused",
    percent: 0,
    problem: "PDFs are not photographs or videos, so this one stays out.",
  },
];

export const UPLOAD_FILES: readonly UploadFile[] = [
  {
    id: "up-1",
    name: "IMG_4620.HEIC",
    size: "4.1 MB",
    media: NEWBORN,
    state: "done",
    percent: 100,
  },
  {
    id: "up-2",
    name: "IMG_4681.HEIC",
    size: "3.8 MB",
    media: MORNING,
    state: "done",
    percent: 100,
  },
  {
    id: "up-3",
    name: "IMG_9247.MOV",
    size: "184 MB",
    media: CLIP,
    state: "sending",
    percent: 62,
  },
  {
    id: "up-4",
    name: "IMG_4688.HEIC",
    size: "4.4 MB",
    media: UPRIGHT,
    state: "waiting",
    percent: 0,
  },
  {
    id: "up-5",
    name: "IMG_4702.HEIC",
    size: "3.9 MB",
    media: pickVariedFrame(1),
    state: "failed",
    percent: 0,
    problem: "The connection dropped partway through.",
  },
  {
    id: "up-6",
    name: "scan-of-the-card.pdf",
    size: "220 KB",
    media: null,
    state: "refused",
    percent: 0,
    problem: "PDFs are not photographs or videos, so this one stays out.",
  },
];
