import { z } from "zod";
import { collectionSchema } from "./collectionSchema.ts";
import {
  calendarDateSchema,
  mediaSourceSchema,
  personRefSchema,
  tagRefSchema,
} from "./dtos.ts";

/**
 * The two vocabularies the filter surface and the people directory draw
 * from: `tech-specs/apis/timeline.md`.
 *
 * A tag or a person exists independently of any one day's selection, which is
 * what separates these from `timeline.ts`: the tag vocabulary backs the
 * filter surface's type-ahead and `GET /api/tags`, and the people directory
 * backs surface 7 and `GET /api/people`. Neither route takes
 * `timelineFilterQuerySchema`.
 */

/** The tag vocabulary's query string. */
export const tagsRequestSchema = z.object({
  /** Substring match on the normalised name, for the type-ahead. */
  q: z.string().optional(),
});

/** The tag vocabulary's query string. */
export type TagsRequest = z.infer<typeof tagsRequestSchema>;

/** One tag and what it is worth to this viewer. */
export const tagCountSchema = z.object({
  tag: tagRefSchema,
  /** Per viewer. A tag whose every item is restricted reads 0 and stays. */
  itemCount: z.number().int().nonnegative(),
});

/** One tag and what it is worth to this viewer. */
export type TagCount = z.infer<typeof tagCountSchema>;

/**
 * The tag vocabulary, unpaginated.
 *
 * The aggregate scans `item_tags` whole whichever page is asked for, so
 * cursoring saves serialisation and nothing else, while a partial vocabulary
 * makes a type-ahead lie.
 */
export const tagsResponseSchema = collectionSchema({
  resourceKey: "tags",
  itemSchema: tagCountSchema,
});

/** The tag vocabulary. */
export type TagsResponse = z.infer<typeof tagsResponseSchema>;

/** The people directory's query string. */
export const peopleRequestSchema = z.object({
  /** Narrows the directory by name. Surface 7's `narrowed` state. */
  q: z.string().optional(),
});

/** The people directory's query string. */
export type PeopleRequest = z.infer<typeof peopleRequestSchema>;

/**
 * One person in the directory.
 *
 * It wraps `PersonRef`, which carries no `memberId`, and adds nothing that
 * could stand in for one: members and non-members are drawn identically,
 * because holding an account is a permission fact and this is a family.
 */
export const directoryPersonSchema = z.object({
  person: personRefSchema,
  /** Per viewer. */
  itemCount: z.number().int().nonnegative(),
  /** Null when `itemCount` is 0. */
  firstCapturedOn: calendarDateSchema.nullable(),
  /** Null when `itemCount` is 0. */
  lastCapturedOn: calendarDateSchema.nullable(),
  /**
   * One source, not a `MediaRef`: the card draws a decorative thumbnail with
   * an empty alt and never opens it, so the display URL, the video sources
   * and the generated alt text would all be minted unread. Null draws the
   * ghost frame.
   */
  face: mediaSourceSchema.nullable(),
});

/** One person in the directory. */
export type DirectoryPerson = z.infer<typeof directoryPersonSchema>;

/**
 * The people directory.
 *
 * `peopleCount` is **not** per viewer, which is one of `conventions.md`'s
 * three documented exceptions: a person's existence is not visibility-scoped,
 * only their photographs are, and surface 7's "6 of 10 people" depends on a
 * directory that does not change shape per reader.
 */
export const peopleResponseSchema = collectionSchema({
  resourceKey: "people",
  itemSchema: directoryPersonSchema,
}).extend({
  peopleCount: z.number().int().nonnegative(),
});

/** The people directory. */
export type PeopleResponse = z.infer<typeof peopleResponseSchema>;
