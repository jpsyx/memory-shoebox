import {
  memberCollectionResponseSchema,
  type MemberCollectionResponse,
} from "@memory-shoebox/shared";
import {
  queryOptions,
  useQuery,
  type UseQueryResult,
} from "@tanstack/react-query";
import { apiFetch } from "@/api/clientHelpers/clientHelpers";
import { meQueryOptions } from "@/api/me/me";
import {
  capturePrivateAuthority,
  isPrivateAuthorityCurrent,
} from "@/api/me/privateQueryHelpers";

/** A clean collection address with no filters from the originating archive. */
export function makeMemberCollectionHrefFromMemberId(memberId: string): string {
  return `/?member=${encodeURIComponent(memberId)}`;
}

/** Current account identity only, scoped to the reader's private lifetime. */
export function makeMemberCollectionQueryOptionsFromIds(
  options: Readonly<{
    memberId: string | undefined;
    readerId: string | undefined;
  }>,
): ReturnType<
  typeof queryOptions<
    MemberCollectionResponse,
    Error,
    MemberCollectionResponse,
    Array<string | undefined>
  >
> {
  return queryOptions({
    queryKey: ["member-collections", options.readerId, options.memberId],
    enabled: options.memberId !== undefined && options.readerId !== undefined,
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async ({ signal, client }) => {
      const ticket = capturePrivateAuthority(client);
      const response = await apiFetch({
        path: `/member-collections/${encodeURIComponent(options.memberId!)}`,
        schema: memberCollectionResponseSchema,
        init: { signal },
      });
      signal.throwIfAborted();
      if (!isPrivateAuthorityCurrent(client, ticket)) {
        throw new DOMException("Collection read retired", "AbortError");
      }
      return response;
    },
  });
}

/** Shares the narrow current identity between the header and its filter. */
export function useMemberCollection(
  memberId: string | undefined,
): UseQueryResult<MemberCollectionResponse, Error> {
  const account = useQuery(meQueryOptions);
  return useQuery(
    makeMemberCollectionQueryOptionsFromIds({
      memberId,
      readerId: account.data?.me.member.memberId,
    }),
  );
}
