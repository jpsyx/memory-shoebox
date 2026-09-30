/**
 * Every cap the contract puts on a request, in one place.
 *
 * String lengths are most of them, and come from
 * `tech-specs/apis/conventions.md` § String lengths; the rest are counts and
 * other request-shape caps that live alongside them for the same reason.
 *
 * One number per field, shared by every route slice that touches it: slices
 * left to pick their own drift apart on the fields they overlap on. None of
 * these is a database `CHECK`: they are product judgements and should change
 * without a migration.
 */
export const LIMITS = {
  /**
   * Every free-text field a person types shares one number. A second number
   * is a second thing to get wrong, and the real limit on a removal reason is
   * social rather than technical.
   */
  freeTextMaxLength: 4000,
  /**
   * `members.display_name` only. `people.display_name` is uncapped by design
   * (`conventions.md` § String lengths names the member column and no other),
   * so the name says which one rather than inviting a route to apply it to a
   * tagged person's name.
   *
   * Enough for "Abuela Rosa", short enough that a comment chip cannot be used
   * as a billboard.
   */
  memberDisplayNameMaxLength: 80,
  /** A label, not a sentence. */
  tagNameMaxLength: 100,
  /** A label, not a sentence. */
  groupNameMaxLength: 100,
  /** "A week at the grandparents'", and rather more. */
  milestoneNameMaxLength: 200,
  /** Prose for a screen reader. The generated string is far shorter. */
  altTextMaxLength: 2000,
  /** Generous enough that nobody meets it by accident. */
  itemMaxTags: 50,
  /** Low enough that a bulk action cannot turn one photograph into an index. */
  itemMaxPeople: 30,
  /**
   * Days per timeline page when the client asks for none.
   *
   * `timeline.md`: "Days, not items. Default 10, capped at 30." It is here
   * rather than in `app.config.ts` because the request schema validates it,
   * so both halves of the app need the same number.
   */
  timelineDefaultDays: 10,
  /**
   * Why thirty: the page has two ceilings and this is the weaker one.
   * `appConfig.timeline.pageItemBudget` stops a page at 400 visible items and
   * usually bites first, so thirty days only ever binds on a sparse stretch
   * of the archive. Thirty is about a month of quiet days in one response,
   * which is as far as anybody scrolls before jumping, and the jump rail
   * exists for going further. Over it is a `400` rather than a silent clamp,
   * so a client asking for a hundred learns that it cannot have one.
   */
  timelineMaxDays: 30,
  /**
   * Ids one `POST /api/items/seen` may carry, per array.
   *
   * A page draws at most a few hundred prints, and a collapsed burst is one
   * id rather than forty-five, so a client that reaches this is sending
   * something other than what is on screen.
   */
  seenMaxIds: 500,
  /**
   * Frames one page of `GET /api/bursts/:burstId/frames` may carry.
   *
   * The default and the cap are the same number, because at realistic burst
   * sizes one page carries the whole burst and `nextCursor` comes back null
   * (`items.md` § `GET /api/bursts/:burstId/frames`). Null by the usual case
   * and not by construction: a burst longer than this pages properly, on an
   * opaque cursor over `(burst_index, id)`, rather than being truncated and
   * reported complete.
   */
  burstFramesMaxFrames: 200,
  /**
   * Ids one `POST /api/items/visibility` may carry.
   *
   * A whole day is 212 in the fixtures and a whole upload 264, so the cap is
   * generous and still bounds one transaction on a database with one writer.
   */
  visibilityBatchMaxItems: 1000,
} as const;
