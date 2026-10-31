import {
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
  type Dispatch,
  type SetStateAction,
} from "react";
import { QueryClientContext, type QueryClient } from "@tanstack/react-query";
import type { MeResponse, MemberRef } from "@memory-shoebox/shared";
import { renewMemberAvatar } from "@/api/avatars/avatars";
import {
  capturePrivateAuthority,
  isPrivateAuthorityCurrent,
} from "@/api/me/privateQueryHelpers";
import { getInitialsFromDisplayName } from "@/system/labelHelpers/getInitialsFromDisplayName";
import classes from "./MemberAvatar.module.css";

/** Shows a private avatar with a fixed footprint and one renewal attempt. */
export function MemberAvatar({
  member,
  size,
}: Readonly<{ member: MemberRef; size: number }>): ReactNode {
  const { displayed, setFailedUrl } = useMemberAvatarSource(member);
  return (
    <span
      className={classes.avatar}
      aria-hidden="true"
      style={{ width: size, height: size, flexBasis: size }}
    >
      {displayed ? (
        <img
          src={displayed.url}
          alt=""
          onError={() => {
            return setFailedUrl(displayed.url);
          }}
        />
      ) : (
        getInitialsFromDisplayName(member.displayName)
      )}
    </span>
  );
}

function useMemberAvatarSource(member: Readonly<MemberRef>) {
  const client = useContext(QueryClientContext);
  const account = useSyncExternalStore(
    (notify) => {
      return client?.getQueryCache().subscribe(notify) ?? (() => {});
    },
    () => {
      return client?.getQueryData<MeResponse | null>(["me"]);
    },
  );
  const source =
    account?.me.member.memberId === member.memberId
      ? account.me.member.avatar
      : member.avatar;
  const [failedUrl, setFailedUrl] = useState<string>();
  const [renewed, setRenewed] = useState<MemberRef["avatar"]>();
  const sourceId = source?.avatarId;
  const currentId = useRef(sourceId);
  currentId.current = sourceId;
  const displayed = renewed?.avatarId === sourceId ? renewed : source;
  const isExpired =
    !!displayed && Date.parse(displayed.expiresAt) <= Date.now();
  const shouldRenew = !!displayed && (isExpired || failedUrl === displayed.url);
  useAvatarRenewal({
    client,
    source,
    shouldRenew,
    member,
    setRenewed,
    currentId,
  });
  return {
    displayed:
      displayed && !isExpired && failedUrl !== displayed.url
        ? displayed
        : undefined,
    setFailedUrl,
  };
}

type RenewalOptions = {
  client: QueryClient | undefined;
  source: MemberRef["avatar"];
  shouldRenew: boolean;
  member: MemberRef;
  setRenewed: Dispatch<SetStateAction<MemberRef["avatar"] | undefined>>;
  currentId: RefObject<string | undefined>;
};
function useAvatarRenewal({
  client,
  source,
  shouldRenew,
  member,
  setRenewed,
  currentId,
}: Readonly<RenewalOptions>): void {
  const attempted = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (
      !client ||
      !source ||
      !shouldRenew ||
      attempted.current === source.avatarId
    ) {
      return;
    }
    attempted.current = source.avatarId;
    const ticket = capturePrivateAuthority(client);
    void renewMemberAvatar({
      client,
      member: { ...member, avatar: source },
    }).then((avatar) => {
      if (
        isPrivateAuthorityCurrent(client, ticket) &&
        currentId.current === source.avatarId
      ) {
        setRenewed(avatar);
      }
    });
  }, [client, member, source, shouldRenew, currentId, setRenewed]);
}
