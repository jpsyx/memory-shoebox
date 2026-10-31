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
  getAuthorityFromAccount,
  isPrivateAuthorityCurrent,
  reconcileAccountFields,
} from "@/api/me/privateQueryHelpers";

type SaveOptions = {
  client: QueryClient;
  file: File;
  crop: AvatarCrop;
  expectedAvatarId: string | null;
  write?: {
    context: AvatarWriteContext;
    freshExpectedAvatarId?: string | null;
  };
};

type PublicationOwner = {
  ticket: ReturnType<typeof capturePrivateAuthority>;
  issued: number;
  published: number;
};
type Publication = { owner: PublicationOwner; sequence: number };
const PUBLICATIONS = new WeakMap<QueryClient, PublicationOwner>();

/** One original authority/publication lifetime, retained across version reads. */
export type AvatarWriteContext = {
  authority: ReturnType<typeof capturePrivateAuthority>;
  publication: Publication;
  cachedAvatarId: string | null;
};

/** Captures an own-avatar write without adopting a later account lifetime. */
export function captureAvatarWrite(
  client: QueryClient,
  authority = capturePrivateAuthority(client),
): AvatarWriteContext {
  _assertAuthority(client, authority);
  return {
    authority,
    publication: _capturePublication(client, authority),
    cachedAvatarId:
      client.getQueryData<MeResponse>(["me"])?.me.member.avatar?.avatarId ??
      null,
  };
}

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
  previousAvatarId?: string | null;
};
function _publishOwnAvatar(options: Readonly<PublicationOptions>): void {
  const { client, response, ticket, publication, expectedAvatarId } = options;
  if (publication.sequence < publication.owner.published) {
    return;
  }
  publication.owner.published = publication.sequence;
  if (getAuthorityFromAccount(response) !== ticket.authority) {
    reconcileAccountFields(client, response, "avatar", ticket);
    return;
  }
  const currentId =
    client.getQueryData<MeResponse>(["me"])?.me.member.avatar?.avatarId ?? null;
  if (
    currentId !== expectedAvatarId &&
    currentId !== (response.me.member.avatar?.avatarId ?? null) &&
    currentId !== options.previousAvatarId
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
  const context = options.write?.context ?? captureAvatarWrite(client);
  const { authority: ticket, publication } = context;
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
    previousAvatarId:
      options.write?.freshExpectedAvatarId === expectedAvatarId
        ? context.cachedAvatarId
        : undefined,
  });
  return client.getQueryData<MeResponse>(["me"])!;
}

/** Removes only the current own-account photo using its expected version. */
export async function removeAvatar(
  options: Readonly<{
    client: QueryClient;
    expectedAvatarId: string | null;
    writeContext?: AvatarWriteContext;
  }>,
): Promise<MeResponse> {
  const { authority: ticket, publication } =
    options.writeContext ?? captureAvatarWrite(options.client);
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

/** Publishes a refreshed pointer only within its original write lifetime. */
export function publishLatestAvatarFromWrite(
  options: Readonly<{
    client: QueryClient;
    member: MemberRef;
    writeContext: AvatarWriteContext;
  }>,
): MeResponse {
  const { client, member, writeContext } = options;
  _assertAuthority(client, writeContext.authority);
  const current = client.getQueryData<MeResponse>(["me"])!;
  const response = {
    ...current,
    me: {
      ...current.me,
      member: { ...current.me.member, avatar: member.avatar },
    },
  };
  _publishOwnAvatar({
    client,
    response,
    ticket: writeContext.authority,
    publication: writeContext.publication,
    expectedAvatarId: writeContext.cachedAvatarId,
  });
  return client.getQueryData<MeResponse>(["me"])!;
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
  options: Readonly<{
    client: QueryClient;
    member: MemberRef;
    authority?: ReturnType<typeof capturePrivateAuthority>;
  }>,
): Promise<MemberRef["avatar"]> {
  const ticket = options.authority ?? capturePrivateAuthority(options.client);
  _assertAuthority(options.client, ticket);
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
