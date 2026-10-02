import type {
  QueryFunction,
  QueryFunctionContext,
  QueryKey,
  skipToken,
} from "@tanstack/react-query";

/**
 * Calls a query's `queryFn` with an empty context, which none of ours read.
 *
 * `queryFn` is typed as optional and as possibly `skipToken`; neither is true
 * of the queries these tests call, so both are cast away.
 *
 * @param options The result of a `queryOptions` call.
 * @returns What the query function resolves to, parsed as the app would.
 */
export function callQueryFn<Data, Key extends QueryKey>(
  options: Readonly<{ queryFn?: QueryFunction<Data, Key> | typeof skipToken }>,
): Promise<Data> {
  const queryFn = options.queryFn as Exclude<
    typeof options.queryFn,
    typeof skipToken | undefined
  >;
  return Promise.resolve(queryFn({} as QueryFunctionContext<Key>));
}
