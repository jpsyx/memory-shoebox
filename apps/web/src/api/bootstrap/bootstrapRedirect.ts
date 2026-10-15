import type { BootstrapResponse } from "@memory-shoebox/shared";
import type { QueryClient } from "@tanstack/react-query";
import type {
  AnyRouter,
  HistoryState,
  ParsedLocation,
} from "@tanstack/react-router";

declare module "@tanstack/react-router" {
  interface HistoryState {
    bootstrapRedirect?: string;
  }
}

/** One response may cross only its own immediate guard redirect. */
export type NavigationBootstrap = Readonly<{
  bootstrap: BootstrapResponse;
  generation: number;
}>;

type RedirectReceipt = NavigationBootstrap &
  Readonly<{
    token: string;
    sourceKey: string | undefined;
    destinationHref: string;
    claimedLocation?: ParsedLocation;
  }>;

const REDIRECT_RECEIPTS = new WeakMap<QueryClient, RedirectReceipt>();
const ROUTER_OWNERS = new WeakMap<
  AnyRouter,
  Readonly<{ client: QueryClient; stop: () => void }>
>();

/** Claims only the immediate redirect event; an intervening retry must read again. */
export function installBootstrapRedirectTracking(
  options: Readonly<{
    router: AnyRouter;
    client: QueryClient;
  }>,
): void {
  const previous = ROUTER_OWNERS.get(options.router);
  if (previous?.client === options.client) {
    return;
  }
  if (previous) {
    previous.stop();
    discardBootstrapRedirect(previous.client);
  }
  const stop = options.router.subscribe(
    "onBeforeNavigate",
    ({ toLocation }) => {
      const receipt = REDIRECT_RECEIPTS.get(options.client);
      if (
        receipt &&
        !receipt.claimedLocation &&
        receipt.token === toLocation.state.bootstrapRedirect &&
        receipt.destinationHref === toLocation.href
      ) {
        REDIRECT_RECEIPTS.set(options.client, {
          ...receipt,
          claimedLocation: toLocation,
        });
      } else {
        discardBootstrapRedirect(options.client);
      }
    },
  );
  ROUTER_OWNERS.set(options.router, { client: options.client, stop });
}

/** Invalidates any unconsumed redirect response when authority changes. */
export function discardBootstrapRedirect(client: QueryClient): void {
  REDIRECT_RECEIPTS.delete(client);
}

/** Retains a bounded, single-use response and puts only an opaque token in history. */
export function retainBootstrapForRedirect(
  options: Readonly<{
    client: QueryClient;
    navigation: NavigationBootstrap;
    source: ParsedLocation;
    destinationHref: string;
  }>,
): HistoryState {
  const token = crypto.randomUUID();
  REDIRECT_RECEIPTS.set(options.client, {
    ...options.navigation,
    token,
    sourceKey: options.source.state.__TSR_key,
    destinationHref: options.destinationHref,
  });
  return { bootstrapRedirect: token };
}

/** Consumes before awaiting anything; all mismatches require a fresh authority read. */
export function takeBootstrapForRedirect(
  options: Readonly<{
    client: QueryClient;
    location: ParsedLocation;
    generation: number;
  }>,
): NavigationBootstrap | undefined {
  const receipt = REDIRECT_RECEIPTS.get(options.client);
  REDIRECT_RECEIPTS.delete(options.client);
  if (
    receipt !== undefined &&
    receipt.claimedLocation === options.location &&
    receipt.token === options.location.state.bootstrapRedirect &&
    receipt.destinationHref === options.location.href &&
    receipt.sourceKey !== options.location.state.__TSR_key &&
    receipt.generation === options.generation
  ) {
    return receipt;
  }
  return undefined;
}
