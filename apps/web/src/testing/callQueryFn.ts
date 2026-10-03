import type {
  QueryFunction,
  QueryFunctionContext,
  QueryKey,
  skipToken,
} from "@tanstack/react-query";

/**
 * Calls a query's `queryFn` with an empty context, which none of ours read:
 * the context is cast from `{}` rather than built, since a real one needs a
 * client and a signal that no query function here looks at.
 *
 * @param options The result of a `queryOptions` call.
 * @returns What the query function resolves to, parsed as the app would.
 */
export function callQueryFn<Data, Key extends QueryKey>(
  options: Readonly<{ queryFn?: QueryFunction<Data, Key> | typeof skipToken }>,
): Promise<Data> {
  const { queryFn } = options;
  if (typeof queryFn !== "function") {
    throw new Error("This query has no query function to call.");
  }
  return Promise.resolve(queryFn({} as QueryFunctionContext<Key>));
}
