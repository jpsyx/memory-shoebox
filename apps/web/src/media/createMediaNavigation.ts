import type { MediaSource } from "@memory-shoebox/shared";
import type { MediaPrefetchScheduler } from "./mediaPrefetch.types";
import type { PhotoViewport } from "./photoViewport";

type Destination = {
  itemId: string;
  source: Pick<MediaSource, "url" | "renditionId"> | undefined;
  direction?: "previous" | "next";
};
type Owner = Destination & {
  release: () => void;
  settled: boolean;
  viewVersion: number;
};
type State = {
  scheduler: Readonly<MediaPrefetchScheduler>;
  pending: Owner | undefined;
  revision: number;
  listeners: Set<() => void>;
  adopted: Map<string, Owner>;
  owners: Set<() => void>;
};
/** Member-owned handoff; pending ownership exists before the old route exits. */
export type MediaNavigation = {
  /** Acquires a lease immediately, returning rejection/supersession cleanup. */
  prepare: (destination: Readonly<Destination>) => () => void;
  /** Transfers that lease to the exact item, rendition and URL. */
  adopt: (destination: Readonly<Destination>) => (() => void) | undefined;
  /** Releases a route's unadopted work after its children commit. */
  finishRoute: () => void;
  /** Reconciles even navigation that settles without a route-key change. */
  complete: (release: () => void) => void;
  finishSettled: () => void;
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => number;
  /** Releases pending and adopted work on member retirement. */
  clear: () => void;
  direction: "previous" | "next";
  viewport: PhotoViewport | undefined;
};

function _getKeyFromDestination(destination: Readonly<Destination>): string {
  return `${destination.itemId}:${destination.source?.renditionId}:${destination.source?.url}`;
}

function _finishRoute(state: State): void {
  state.pending?.release();
  state.pending = undefined;
}

function _prepare(
  state: State,
  destination: Readonly<Destination>,
): () => void {
  _finishRoute(state);
  if (destination.source === undefined) {
    return () => {};
  }
  const releaseOperation = state.scheduler.promote(
    destination.source.renditionId,
  );
  const key = _getKeyFromDestination(destination);
  const owner: Owner = {
    ...destination,
    settled: false,
    viewVersion: 0,
    release: () => {
      if (state.owners.delete(owner.release)) {
        releaseOperation();
      }
      if (state.adopted.get(key) === owner) {
        state.adopted.delete(key);
      }
      if (state.pending === owner) {
        state.pending = undefined;
      }
    },
  };
  state.owners.add(owner.release);
  state.pending = owner;
  return owner.release;
}

function _adopt(
  state: State,
  destination: Readonly<Destination>,
): (() => void) | undefined {
  const key = _getKeyFromDestination(destination);
  const owner =
    state.pending !== undefined && _getKeyFromDestination(state.pending) === key
      ? state.pending
      : state.adopted.get(key);
  if (owner === undefined) {
    return undefined;
  }
  if (state.pending === owner) {
    state.pending = undefined;
  }
  state.adopted.set(key, owner);
  owner.viewVersion += 1;
  const version = owner.viewVersion;
  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    // A same-commit preview/detail replacement may adopt this lease.
    void Promise.resolve().then(() => {
      if (owner.viewVersion === version) {
        owner.release();
      }
    });
  };
}

function _getSettlementFromState(
  state: State,
): Pick<
  MediaNavigation,
  "complete" | "finishRoute" | "finishSettled" | "getSnapshot" | "subscribe"
> {
  return {
    complete: (release) => {
      if (state.pending?.release === release) {
        state.pending.settled = true;
        state.revision += 1;
        state.listeners.forEach((listener) => {
          listener();
        });
      }
    },
    finishRoute: () => {
      _finishRoute(state);
    },
    finishSettled: () => {
      if (state.pending?.settled) {
        _finishRoute(state);
      }
    },
    subscribe: (listener) => {
      state.listeners.add(listener);
      return () => {
        state.listeners.delete(listener);
      };
    },
    getSnapshot: () => {
      return state.revision;
    },
  };
}

/** Transfers each existing scheduler lease once to its exact consuming view. */
export function createMediaNavigation(
  scheduler: Readonly<MediaPrefetchScheduler>,
): MediaNavigation {
  const state: State = {
    scheduler,
    pending: undefined,
    revision: 0,
    listeners: new Set(),
    adopted: new Map(),
    owners: new Set(),
  };
  const navigation: MediaNavigation = {
    ..._getSettlementFromState(state),
    direction: "next",
    viewport: undefined,
    prepare: (destination) => {
      navigation.direction = destination.direction ?? "next";
      return _prepare(state, destination);
    },
    adopt: (destination) => {
      return _adopt(state, destination);
    },
    clear: () => {
      _finishRoute(state);
      state.owners.forEach((release) => {
        release();
      });
      navigation.viewport = undefined;
      navigation.direction = "next";
    },
  };
  return navigation;
}
