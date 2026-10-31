import {
  meResponseSchema,
  readMemberAvatarResponseSchema,
  reserveAvatarResponseSchema,
  type AvatarCrop,
  type MemberRef,
  type MeResponse,
} from "@memory-shoebox/shared";
import type { QueryClient } from "@tanstack/react-query";
import { apiFetch, jsonInit } from "@/api/clientHelpers/clientHelpers";
import {
  capturePrivateAuthority,
  isPrivateAuthorityCurrent,
  reconcileAccountFields,
} from "@/api/me/privateQueryHelpers";

type SaveOptions = {
  client: QueryClient;
  file: File;
  crop: AvatarCrop;
  expectedAvatarId: string | null;
};

type PublicationOwner = {
  ticket: ReturnType<typeof capturePrivateAuthority>;
  issued: number;
  published: number;
};
type Publication = { owner: PublicationOwner; sequence: number };
const PUBLICATIONS = new WeakMap<QueryClient, PublicationOwner>();

function _capturePublication(
  client: QueryClient,
  ticket: ReturnType<typeof capturePrivateAuthority>,
): Publication {
  let owner = PUBLICATIONS.get(client);
  if (
    !owner ||
    owner.ticket.query !== ticket.query ||
    owner.ticket.generation !== ticket.generation ||
    owner.ticket.authority !== ticket.authority
  ) {
    owner = { ticket, issued: 0, published: 0 };
    PUBLICATIONS.set(client, owner);
  }
  owner.issued += 1;
  return { owner, sequence: owner.issued };
}

type PublicationOptions = {
  client: QueryClient;
  response: MeResponse;
  ticket: ReturnType<typeof capturePrivateAuthority>;
  publication: Publication;
  expectedAvatarId: string | null;
};
function _publishOwnAvatar(options: Readonly<PublicationOptions>): void {
  const { client, response, ticket, publication, expectedAvatarId } = options;
  if (publication.sequence < publication.owner.published) {
    return;
  }
  publication.owner.published = publication.sequence;
  const currentId =
    client.getQueryData<MeResponse>(["me"])?.me.member.avatar?.avatarId ?? null;
  if (
    currentId !== expectedAvatarId &&
    currentId !== (response.me.member.avatar?.avatarId ?? null)
  ) {
    return;
  }
  reconcileAccountFields(client, response, "avatar", ticket);
  publishMemberAvatar(client, response.me.member);
}

function _assertAuthority(
  client: QueryClient,
  ticket: ReturnType<typeof capturePrivateAuthority>,
): void {
  if (!isPrivateAuthorityCurrent(client, ticket)) {
    throw new Error("Account changed.");
  }
}

/** Saves only the own-account photo and retires stale continuations. */
export async function saveAvatar(
  options: Readonly<SaveOptions>,
): Promise<MeResponse> {
  const { client, file, crop, expectedAvatarId } = options;
  const ticket = capturePrivateAuthority(client);
  const publication = _capturePublication(client, ticket);
  _assertAuthority(client, ticket);
  const reservation = await apiFetch({
    path: "/me/avatar-uploads",
    schema: reserveAvatarResponseSchema,
    init: jsonInit({
      method: "POST",
      body: {
        expectedAvatarId,
        contentType: file.type,
        byteSize: file.size,
        crop,
      },
    }),
  });
  _assertAuthority(client, ticket);
  const response = await apiFetch({
    path: `/me/avatar-uploads/${reservation.avatarId}`,
    schema: meResponseSchema,
    init: { method: "PUT", headers: { "Content-Type": file.type }, body: file },
  });
  _assertAuthority(client, ticket);
  _publishOwnAvatar({
    client,
    response,
    ticket,
    publication,
    expectedAvatarId,
  });
  return client.getQueryData<MeResponse>(["me"])!;
}

/** Removes only the current own-account photo using its expected version. */
export async function removeAvatar(
  options: Readonly<{ client: QueryClient; expectedAvatarId: string | null }>,
): Promise<MeResponse> {
  const ticket = capturePrivateAuthority(options.client);
  const publication = _capturePublication(options.client, ticket);
  _assertAuthority(options.client, ticket);
  const response = await apiFetch({
    path: "/me/avatar",
    schema: meResponseSchema,
    init: jsonInit({
      method: "DELETE",
      body: { expectedAvatarId: options.expectedAvatarId },
    }),
  });
  _assertAuthority(options.client, ticket);
  _publishOwnAvatar({
    client: options.client,
    response,
    ticket,
    publication,
    expectedAvatarId: options.expectedAvatarId,
  });
  return options.client.getQueryData<MeResponse>(["me"])!;
}

/** Updates matching cached member references without replacing other fields. */
export function publishMemberAvatar(
  client: QueryClient,
  member: Readonly<MemberRef>,
  expectedAvatarId?: string | null,
): void {
  client.setQueriesData(
    {
      predicate: (query) => {
        return query.queryKey[0] !== "avatar-renewal";
      },
    },
    (data: unknown) => {
      return _getDataWithAvatar(data, member, expectedAvatarId);
    },
  );
}

function _getDataWithAvatar(
  data: unknown,
  member: Readonly<MemberRef>,
  expectedAvatarId?: string | null,
): unknown {
  if (Array.isArray(data)) {
    return data.map((entry) => {
      return _getDataWithAvatar(entry, member, expectedAvatarId);
    });
  }
  if (data === null || typeof data !== "object") {
    return data;
  }
  if (Object.getPrototypeOf(data) !== Object.prototype) {
    return data;
  }
  const record = data as Record<string, unknown>;
  if (record.memberId === member.memberId && "avatar" in record) {
    const avatar = record.avatar as MemberRef["avatar"];
    if (
      expectedAvatarId !== undefined &&
      (avatar?.avatarId ?? null) !== expectedAvatarId
    ) {
      return data;
    }
    return { ...record, avatar: member.avatar };
  }
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => {
      return [key, _getDataWithAvatar(value, member, expectedAvatarId)];
    }),
  );
}

/** Reads the latest private pointer without publishing an old renewal. */
export async function getLatestAvatarFromMember(
  options: Readonly<{ client: QueryClient; member: MemberRef }>,
): Promise<MemberRef["avatar"]> {
  const ticket = capturePrivateAuthority(options.client);
  const response = await apiFetch({
    path: `/members/${encodeURIComponent(options.member.memberId)}/avatar`,
    schema: readMemberAvatarResponseSchema,
  });
  _assertAuthority(options.client, ticket);
  return response.avatar;
}

/** Renews a failed/expired immutable source once per private query lifetime. */
export async function renewMemberAvatar(
  options: Readonly<{ client: QueryClient; member: MemberRef }>,
): Promise<MemberRef["avatar"] | undefined> {
  const { client, member } = options;
  const ticket = capturePrivateAuthority(client);
  if (!isPrivateAuthorityCurrent(client, ticket) || !member.avatar) {
    return undefined;
  }
  const queryKey = [
    "avatar-renewal",
    ticket.authority,
    member.memberId,
    member.avatar.avatarId,
  ];
  if (client.getQueryState(queryKey)?.status === "error") {
    return undefined;
  }
  return client
    .fetchQuery({
      queryKey,
      retry: false,
      staleTime: Infinity,
      gcTime: Infinity,
      queryFn: async () => {
        const avatar = await getLatestAvatarFromMember(options);
        _assertAuthority(client, ticket);
        publishMemberAvatar(
          client,
          { ...member, avatar },
          member.avatar!.avatarId,
        );
        return avatar;
      },
    })
    .catch(() => {
      return undefined;
    });
}
