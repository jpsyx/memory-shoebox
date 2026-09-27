/**
 * Every length cap in the contract, in one place.
 *
 * Three route slices each proposed their own numbers for overlapping fields
 * before this existed. None of these is a database `CHECK`: they are product
 * judgements and should change without a migration.
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
  /** Enough for "Abuela Rosa", short enough that a chip is not a billboard. */
  displayNameMaxLength: 80,
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
