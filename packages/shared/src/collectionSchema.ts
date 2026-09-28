import { z } from "zod";

/**
 * The collection envelope and the cursor it carries.
 *
 * From `tech-specs/apis/conventions.md` § Envelope and § Pagination. Roughly
 * forty routes across the eight slices return a collection, and every one of
 * them returns the same two keys. Hand-rolling that shape forty times is how
 * three of them end up spelling it `items` / `next` / `hasMore`, so it is
 * built here from a resource key and an item schema instead.
 *
 * Its own module rather than a corner of `dtos.ts`, because this package is
 * laid out one module per section of `conventions.md`: `errors.ts` is
 * § Errors, `limits.ts` is § String lengths, `settings.ts` is
 * § `SETTING_DEFINITIONS`, and `dtos.ts` is § The frozen DTOs. An envelope is
 * not a frozen DTO; it is the thing a frozen DTO travels in.
 */

/**
 * One pagination cursor, as the server minted it.
 *
 * **Opaque to the client** (`conventions.md` § Pagination): what it encodes is
 * a per-route decision (the timeline encodes `captured_on`, everything else
 * encodes the uuidv7 `id`), so nothing here may constrain its shape beyond
 * being a non-empty string. A client that parses one has coupled itself to a
 * server detail the document reserves the right to change.
 *
 * Non-empty because the end of a collection is spelled `nextCursor: null`, not
 * `""`, and a route that returns the empty string has a bug the client cannot
 * see.
 */
export const cursorSchema = z.string().min(1);

/**
 * The shape `collectionSchema` builds: the resource key holding the page, and
 * the cursor for the next one.
 *
 * Written as a type rather than left to inference because a computed property
 * key widens to `string` in an object literal, which would lose the very thing
 * the caller passed in.
 */
export type CollectionShape<
  Key extends string,
  ItemSchema extends z.ZodType,
> = { [K in Key]: z.ZodArray<ItemSchema> } & {
  nextCursor: z.ZodNullable<typeof cursorSchema>;
};

/**
 * Builds the envelope every collection response uses:
 * `{ "<resourceKey>": T[], "nextCursor": string | null }`.
 *
 * `resourceKey` is the plural resource name (`days`, `members`, `comments`),
 * and the envelope is mandatory: `conventions.md` § Envelope forbids a bare
 * top-level array outright, because a wrapped collection can grow a key and a
 * bare array cannot.
 *
 * **`nextCursor` is nullable, not optional.** The document writes
 * `"nextCursor": string | null` and says "`nextCursor: null` means the end",
 * so the key is always present and `null` is the end of the collection. An
 * optional key would make a route that forgot to set it indistinguishable
 * from one that reached the end.
 *
 * @param options.resourceKey The plural resource name the page sits under.
 * @param options.itemSchema The schema every element of that page satisfies.
 *
 * @example
 *   const membersResponseSchema = collectionSchema({
 *     resourceKey: "members",
 *     itemSchema: memberRefSchema,
 *   });
 */
export function collectionSchema<
  const Key extends string,
  ItemSchema extends z.ZodType,
>(options: {
  resourceKey: Key;
  itemSchema: ItemSchema;
}): z.ZodObject<CollectionShape<Key, ItemSchema>> {
  // A computed property key widens to `string` in an object literal, so
  // TypeScript cannot see that this one is `Key`. That is the whole of what
  // the cast asserts: `nextCursor` and the item schema are still checked.
  return z.object({
    [options.resourceKey]: z.array(options.itemSchema),
    nextCursor: cursorSchema.nullable(),
  }) as z.ZodObject<CollectionShape<Key, ItemSchema>>;
}
