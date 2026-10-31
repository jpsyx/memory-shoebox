import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  capturePrivateAuthority,
  isPrivateAuthorityCurrent,
  subscribePrivateRetirement,
  type PrivateAuthority,
} from "@/api/me/privateQueryHelpers";
import {
  createConversationJourney,
  type ConversationJourney,
} from "../conversationJourneyHelpers/conversationJourneyHelpers";

/** One optional context so isolated conversation consumers can own local drafts. */
export const ConversationJourneyContext = createContext<
  ConversationJourney | undefined
>(undefined);

function _makeOwnerFromClient(client: QueryClient) {
  let ticket = capturePrivateAuthority(client);
  let journey = _makeJourneyFromAuthority(client, ticket);
  const listeners = new Set<() => void>();
  let isRetired = false;
  const refresh = () => {
    const updated = capturePrivateAuthority(client);
    if (
      !isRetired &&
      updated.authority === ticket.authority &&
      updated.query === ticket.query &&
      updated.generation === ticket.generation
    ) {
      return;
    }
    journey.retire();
    isRetired = false;
    ticket = updated;
    journey = _makeJourneyFromAuthority(client, ticket);
    listeners.forEach((listener) => {
      return listener();
    });
  };
  return {
    getSnapshot: () => {
      return journey;
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      const unwatch = client.getQueryCache().subscribe(refresh);
      const unretire = subscribePrivateRetirement(client, refresh);
      refresh();
      return () => {
        listeners.delete(listener);
        unwatch();
        unretire();
      };
    },
    activate: refresh,
    retire: () => {
      isRetired = true;
      return journey.retire();
    },
  };
}
function _makeJourneyFromAuthority(
  client: QueryClient,
  ticket: Readonly<PrivateAuthority>,
): ConversationJourney {
  return createConversationJourney(() => {
    return isPrivateAuthorityCurrent(client, ticket);
  });
}
/** Retains user drafts above routes, fenced to one real private session lifetime. */
export function ConversationJourneyProvider({
  children,
}: Readonly<{ children: ReactNode }>): ReactNode {
  const client = useQueryClient();
  const owner = useMemo(() => {
    return _makeOwnerFromClient(client);
  }, [client]);
  const journey = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  useEffect(() => {
    owner.activate();
    return () => {
      return owner.retire();
    };
  }, [owner]);
  return (
    <ConversationJourneyContext value={journey}>
      {children}
    </ConversationJourneyContext>
  );
}
/** Optional consumer for links and surfaces that also appear outside items. */
export function useConversationJourney(): ConversationJourney | undefined {
  const journey = useContext(ConversationJourneyContext);
  useSyncExternalStore(
    journey?.subscribe ?? _subscribeNothing,
    journey?.getSnapshot ?? _emptySnapshot,
  );
  return journey;
}
function _subscribeNothing(): () => void {
  return () => {};
}
function _emptySnapshot(): number {
  return 0;
}
/** Uses the session owner when present, otherwise a single local editor owner. */
export function useConversationDraftOwner(): ConversationJourney {
  const journey = useConversationJourney();
  const [local] = useState(createConversationJourney);
  useSyncExternalStore(
    journey ? _subscribeNothing : local.subscribe,
    journey ? _emptySnapshot : local.getSnapshot,
  );
  return journey ?? local;
}
