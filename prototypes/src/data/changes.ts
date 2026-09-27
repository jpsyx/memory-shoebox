/**
 * The authority-and-destruction log behind surface 18.
 *
 * This is `activity_events` and nothing else. The schema's own justification
 * for that table is that it records **only what the state tables cannot answer
 * later**, so the surface shows only that: comments, reactions and uploads are
 * left out because the timeline already shows all three, and a log that
 * repeats the timeline buries the one row that mattered.
 */

/**
 * The three families of `activity_events`, which are the filter on surface 18.
 *
 * They are not arbitrary groupings. Each answers a different question, and
 * `authority` is the one the log exists for: nothing else in the product
 * records that adding somebody to a group retroactively grants them every
 * photograph ever restricted to it.
 */
export type ChangeFamily = "authority" | "destruction" | "access";

/**
 * One entry in the log.
 *
 * Every field is a resolved string rather than an id, which mirrors the
 * schema: `actor_label` and `subject_label` are denormalised onto the row so
 * the log still reads correctly after the rows it describes are gone.
 */
export interface ChangeEvent {
  readonly id: string;
  readonly family: ChangeFamily;
  /** The `activity_events.kind`, carried so the mockup cannot drift from it. */
  readonly kind: string;
  readonly day: string;
  readonly time: string;
  readonly actorMemberId: string | null;
  /** Denormalised: the name as it was when this happened. */
  readonly actorLabel: string;
  /** The sentence, already resolved. Rendering it needs no query. */
  readonly what: string;
  readonly subjectLabel: string;
  /** Null once the session it names has fallen out at 30 days idle. */
  readonly device: string | null;
  /** The subject id is dangling: the row it named no longer exists. */
  readonly subjectGone?: boolean;
  /** The one kind that grants access to things uploaded long before it. */
  readonly retroactive?: boolean;
}

export const CHANGE_FAMILY_LABELS: Readonly<Record<ChangeFamily, string>> = {
  authority: "Who can see what",
  destruction: "What was deleted",
  access: "Getting in",
};

export const CHANGE_EVENTS: readonly ChangeEvent[] = [
  {
    id: "ev-01",
    family: "authority",
    kind: "group_membership_changed",
    day: "17 September 2026",
    time: "09:14",
    actorMemberId: "mem-andres",
    actorLabel: "Papá",
    what: "Added Prima Inés to primos",
    subjectLabel: "primos",
    device: "iPhone, Bilbao",
    retroactive: true,
  },
  {
    id: "ev-02",
    family: "authority",
    kind: "item_visibility_changed",
    day: "17 September 2026",
    time: "08:52",
    actorMemberId: "mem-lucia",
    actorLabel: "Mamá",
    what: "Changed who can see a photograph, from primos to everybody",
    subjectLabel: "14 September 2026, 06:41",
    device: "MacBook",
  },
  {
    id: "ev-03",
    family: "destruction",
    kind: "item_deleted",
    day: "16 September 2026",
    time: "19:30",
    actorMemberId: "mem-andres",
    actorLabel: "Papá",
    what: "Deleted a photograph, answering a request from Prima Inés",
    subjectLabel: "14 September 2026, 06:47",
    device: "iPhone, Bilbao",
    subjectGone: true,
  },
  {
    id: "ev-04",
    family: "authority",
    kind: "member_role_changed",
    day: "16 September 2026",
    time: "19:28",
    actorMemberId: "mem-andres",
    actorLabel: "Papá",
    what: "Changed Tía Marisol from viewer to uploader",
    subjectLabel: "Tía Marisol",
    device: "iPhone, Bilbao",
  },
  {
    id: "ev-05",
    family: "access",
    kind: "signed_in",
    day: "16 September 2026",
    time: "08:03",
    actorMemberId: "mem-rosa",
    actorLabel: "Abuela Rosa",
    what: "Signed in on a device that had not been seen before",
    subjectLabel: "iPad",
    device: "iPad",
  },
  {
    id: "ev-06",
    family: "destruction",
    kind: "comment_deleted",
    day: "15 September 2026",
    time: "22:41",
    actorMemberId: "mem-andres",
    actorLabel: "Papá",
    what: "Deleted a comment written by Tío Rafa",
    subjectLabel: "Tío Rafa, on 14 September",
    device: "MacBook",
    subjectGone: true,
  },
  {
    id: "ev-07",
    family: "authority",
    kind: "setting_changed",
    day: "14 September 2026",
    time: "21:10",
    actorMemberId: "mem-andres",
    actorLabel: "Papá",
    what: "Changed the Shoebox's name, from Casa Ruiz to My Shoebox",
    subjectLabel: "shoebox.name",
    device: "MacBook",
  },
  {
    id: "ev-08",
    family: "authority",
    kind: "member_invited",
    day: "14 September 2026",
    time: "20:44",
    actorMemberId: "mem-andres",
    actorLabel: "Papá",
    what: "Invited Abuelo Tomás, as a viewer",
    subjectLabel: "tomas@example.com",
    device: "MacBook",
  },
  {
    id: "ev-09",
    family: "access",
    kind: "sign_in_failed",
    day: "14 September 2026",
    time: "07:15",
    actorMemberId: null,
    actorLabel: "rafa@example.com",
    what: "Three wrong codes in a row, and then the code expired",
    subjectLabel: "rafa@example.com",
    device: null,
  },
  {
    id: "ev-10",
    family: "authority",
    kind: "group_created",
    day: "11 September 2026",
    time: "18:02",
    actorMemberId: "mem-andres",
    actorLabel: "Papá",
    what: "Created the group primos",
    subjectLabel: "primos",
    device: null,
  },
  {
    id: "ev-11",
    family: "access",
    kind: "device_revoked",
    day: "11 September 2026",
    time: "17:55",
    actorMemberId: "mem-andres",
    actorLabel: "Papá",
    what: "Signed a device out, remotely",
    subjectLabel: "Tío Rafa, Android phone",
    device: null,
  },
  {
    id: "ev-12",
    family: "destruction",
    kind: "milestone_deleted",
    day: "11 September 2026",
    time: "17:40",
    actorMemberId: "mem-marisol",
    actorLabel: "Tía Marisol",
    what: "Deleted a milestone. The photographs that were on it stayed",
    subjectLabel: "A week at the grandparents'",
    device: null,
    subjectGone: true,
  },
];

/**
 * Everything that ever happened to one photograph, which is what the subject
 * filter answers. It ends with the deletion, and every row still names the
 * thing correctly, because the label was written down at the time.
 */
export const CHANGE_EVENTS_ONE_SUBJECT: readonly ChangeEvent[] = [
  {
    id: "ev-s3",
    family: "destruction",
    kind: "item_deleted",
    day: "16 September 2026",
    time: "19:30",
    actorMemberId: "mem-andres",
    actorLabel: "Papá",
    what: "Deleted it, answering a request from Prima Inés",
    subjectLabel: "14 September 2026, 06:47",
    device: "iPhone, Bilbao",
    subjectGone: true,
  },
  {
    id: "ev-s2",
    family: "authority",
    kind: "item_visibility_changed",
    day: "15 September 2026",
    time: "09:20",
    actorMemberId: "mem-andres",
    actorLabel: "Papá",
    what: "Narrowed who could see it, from everybody to primos",
    subjectLabel: "14 September 2026, 06:47",
    device: "iPhone, Bilbao",
    subjectGone: true,
  },
  {
    id: "ev-s1",
    family: "authority",
    kind: "item_visibility_changed",
    day: "14 September 2026",
    time: "06:52",
    actorMemberId: "mem-andres",
    actorLabel: "Papá",
    what: "Set who could see it, to everybody",
    subjectLabel: "14 September 2026, 06:47",
    device: "iPhone, Bilbao",
    subjectGone: true,
  },
];

/** The log grouped into the days it happened on, newest day first. */
export function groupChangesByDay(
  events: readonly ChangeEvent[],
): ReadonlyArray<readonly [string, readonly ChangeEvent[]]> {
  const days: string[] = [];
  const byDay = new Map<string, ChangeEvent[]>();

  for (const event of events) {
    const existing = byDay.get(event.day);
    if (existing === undefined) {
      days.push(event.day);
      byDay.set(event.day, [event]);
    } else {
      existing.push(event);
    }
  }

  return days.map((day) => {
    return [day, byDay.get(day) ?? []] as const;
  });
}
