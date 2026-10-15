import type { MediaSource } from "@memory-shoebox/shared";
import type {
  MediaPrefetchScheduler,
  MediaPromotion,
} from "./mediaPrefetch.types";
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
  promotion: MediaPromotion;
  viewport: PhotoViewport | undefined;
  snapshot: DecodedPhotoSnapshot;
};
/** Pure view of one live navigation owner's completed native pixels. */
export type DecodedPhotoSnapshot = {
  token: object;
  getImage: () => HTMLImageElement | undefined;
};
/** A committed view's independent transport and temporary-pixel lifetime. */
export type MediaSourceClaim = {
  release: () => void;
  finishSelectedDecode: () => void;
};
type Presentation = Destination & {
  viewport?: PhotoViewport;
  sourceEpoch?: number;
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
  adopt: (destination: Readonly<Presentation>) => MediaSourceClaim | undefined;
  /** Reads without acquiring or extending ownership, including during render. */
  getDecodedPhoto: (
    destination: Readonly<Presentation>,
  ) => DecodedPhotoSnapshot | undefined;
  getPreparedViewport: (itemId: string) => PhotoViewport | undefined;
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

function _notify(state: State): void {
  state.revision += 1;
  state.listeners.forEach((listener) => {
    listener();
  });
}

function _getOwner(
  state: State,
  destination: Readonly<Destination>,
): Owner | undefined {
  const key = _getKeyFromDestination(destination);
  return state.pending !== undefined &&
    _getKeyFromDestination(state.pending) === key
    ? state.pending
    : state.adopted.get(key);
}

function _makeOwnerFromDestination(
  state: State,
  destination: Readonly<Destination>,
  viewport: PhotoViewport | undefined,
  promotion: MediaPromotion,
): Owner {
  const key = _getKeyFromDestination(destination);
  const owner: Owner = {
    ...destination,
    settled: false,
    viewVersion: 0,
    promotion,
    viewport: viewport === undefined ? undefined : { ...viewport },
    snapshot: {
      token: {},
      getImage: () => {
        return state.owners.has(owner.release)
          ? promotion.decodedPhoto?.getImage()
          : undefined;
      },
    },
    release: () => {
      if (state.owners.delete(owner.release)) {
        promotion.release();
      }
      if (state.adopted.get(key) === owner) {
        state.adopted.delete(key);
      }
      if (state.pending === owner) {
        state.pending = undefined;
      }
      _notify(state);
    },
  };
  return owner;
}

function _prepare(
  state: State,
  destination: Readonly<Destination>,
  viewport: PhotoViewport | undefined,
): () => void {
  if (destination.source === undefined) {
    _finishRoute(state);
    return () => {};
  }
  const promotion = state.scheduler.promote(destination);
  // Replacement ownership must exist before the old lease can abort its load.
  _finishRoute(state);
  const owner = _makeOwnerFromDestination(
    state,
    destination,
    viewport,
    promotion,
  );
  state.owners.add(owner.release);
  state.pending = owner;
  return owner.release;
}

function _adopt(
  state: State,
  destination: Readonly<Presentation>,
): MediaSourceClaim | undefined {
  const owner =
    destination.source === undefined &&
    destination.viewport === undefined &&
    state.pending?.itemId === destination.itemId
      ? state.pending
      : _getOwner(state, destination);
  if (owner === undefined) {
    return undefined;
  }
  if (state.pending === owner) {
    state.pending = undefined;
  }
  const key = _getKeyFromDestination(owner);
  state.adopted.set(key, owner);
  if (
    (destination.sourceEpoch ?? 0) !== 0 ||
    (destination.viewport !== undefined &&
      owner.viewport !== undefined &&
      destination.viewport.devicePixelRatio !== owner.viewport.devicePixelRatio)
  ) {
    owner.promotion.finishSelectedDecode();
  }
  return _makeClaimFromOwner(state, owner);
}

function _makeClaimFromOwner(state: State, owner: Owner): MediaSourceClaim {
  owner.viewVersion += 1;
  const version = owner.viewVersion;
  let released = false;
  return {
    finishSelectedDecode: () => {
      if (!released && owner.viewVersion === version) {
        owner.promotion.finishSelectedDecode();
        _notify(state);
      }
    },
    release: () => {
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
    },
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

function _getPresentationFromState(
  state: State,
): Pick<MediaNavigation, "getDecodedPhoto" | "getPreparedViewport"> {
  return {
    getDecodedPhoto: (destination) => {
      const owner = _getOwner(state, destination);
      return owner !== undefined &&
        destination.viewport !== undefined &&
        (destination.sourceEpoch ?? 0) === 0 &&
        (owner.viewport === undefined ||
          owner.viewport.devicePixelRatio ===
            destination.viewport.devicePixelRatio) &&
        owner.snapshot.getImage() !== undefined
        ? owner.snapshot
        : undefined;
    },
    getPreparedViewport: (itemId) => {
      const owner =
        state.pending?.itemId === itemId
          ? state.pending
          : [...state.adopted.values()].find((entry) => {
              return entry.itemId === itemId;
            });
      return owner?.viewport;
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
    ..._getPresentationFromState(state),
    direction: "next",
    viewport: undefined,
    prepare: (destination) => {
      navigation.direction = destination.direction ?? "next";
      return _prepare(state, destination, navigation.viewport);
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
