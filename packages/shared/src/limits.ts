/**
 * Every length cap in the contract, in one place.
 *
 * One number per field, shared by every route slice that touches it: slices
 * left to pick their own drift apart on the fields they overlap on. None of
 * these is a database `CHECK`: they are product judgements and should change
 * without a migration.
 *
 * From `tech-specs/apis/conventions.md` § String lengths.
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
} as const;
