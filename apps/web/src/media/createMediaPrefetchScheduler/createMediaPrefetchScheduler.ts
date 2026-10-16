import { APP_CONFIG } from "../../../../../app.config";
import type {
  MediaDestination,
  MediaPrefetchScheduler,
  MediaPromotion,
  PrefetchCandidate,
  PrefetchEnvironment,
  SpeculativeMedia,
  SpeculativeMediaLoader,
} from "../mediaPrefetch.types";
import {
  getAllowedPrefetchCandidatesFromEnvironment,
  getPrefetchCostsFromCandidate,
} from "../mediaPrefetchPolicyHelpers/mediaPrefetchPolicyHelpers";
import type {
  MediaPromotionOptions,
  Operation,
  RetainedMedia,
  Handoff,
  SchedulerState,
} from "./createMediaPrefetchScheduler.types";
import { getMediaReservationsFromSchedulerState } from "./getMediaReservationsFromSchedulerState";

function _dropRetained(state: SchedulerState): void {
  state.retained?.media.release();
  state.retained = undefined;
}

function _clear(state: SchedulerState): void {
  clearTimeout(state.timer);
  state.timer = undefined;
  state.candidates = [];
  state.environment = undefined;
  state.completed.clear();
  state.generation += 1;
  _dropRetained(state);
  state.active.forEach((operation) => {
    if (operation.foregroundOwners === 0) {
      operation.controller.abort();
    }
  });
}

function _settle({
  state,
  operation,
  media,
}: {
  state: SchedulerState;
  operation: Readonly<Operation>;
  media?: SpeculativeMedia;
}): void {
  const id = operation.candidate.source.renditionId;
  state.active.delete(id);
  const desired = state.candidates.find((candidate) => {
    return candidate.source.renditionId === id;
  });
  const isCurrent =
    !state.disposed &&
    !operation.controller.signal.aborted &&
    operation.foregroundOwners === 0 &&
    operation.generation === state.generation &&
    operation.epoch === state.getEpoch() &&
    desired !== undefined;
  if (isCurrent) {
    state.completed.add(id);
  }
  if (
    isCurrent &&
    operation.candidate.decode &&
    desired?.decode &&
    media !== undefined
  ) {
    _dropRetained(state);
    state.retained = {
      candidate: operation.candidate,
      media,
      epoch: operation.epoch,
    };
  } else {
    media?.release();
  }
  _pump(state);
}

function _start({
  state,
  candidate,
}: {
  state: SchedulerState;
  candidate: Readonly<PrefetchCandidate>;
}): void {
  const operation: Operation = {
    candidate: { ...candidate },
    controller: new AbortController(),
    generation: state.generation,
    foregroundOwners: 0,
    epoch: state.getEpoch(),
  };
  state.active.set(candidate.source.renditionId, operation);
  try {
    void state
      .load({
        candidate: operation.candidate,
        signal: operation.controller.signal,
      })
      .then(
        (media) => {
          _settle({ state, operation, media });
        },
        () => {
          _settle({ state, operation });
        },
      );
  } catch {
    _settle({ state, operation });
  }
}

function _pump(state: SchedulerState): void {
  if (
    state.disposed ||
    state.environment === undefined ||
    state.clock() < state.readyAt
  ) {
    return;
  }
  getAllowedPrefetchCandidatesFromEnvironment({
    candidates: state.candidates,
    environment: state.environment,
    now: state.clock(),
  }).forEach((candidate) => {
    const id = candidate.source.renditionId;
    if (
      state.active.size >= APP_CONFIG.media.prefetch.maxOperations ||
      state.active.has(id) ||
      state.completed.has(id)
    ) {
      return;
    }
    const reserved = getMediaReservationsFromSchedulerState(state);
    const cost = getPrefetchCostsFromCandidate(candidate);
    if (
      reserved.encodedBytes + cost.encodedBytes >
        APP_CONFIG.media.prefetch.maxEncodedBytes ||
      (candidate.decode && reserved.decodedBytes > 0)
    ) {
      return;
    }
    _start({ state, candidate });
  });
}

function _discardObsolete(state: SchedulerState): void {
  const desired = new Set(
    state.candidates.map((candidate) => {
      return candidate.source.renditionId;
    }),
  );
  state.completed = new Set(
    [...state.completed].filter((id) => {
      return desired.has(id);
    }),
  );
  state.active.forEach((operation, id) => {
    if (!desired.has(id) && operation.foregroundOwners === 0) {
      operation.controller.abort();
    }
  });
  const retainedId = state.retained?.candidate.source.renditionId;
  if (
    !state.candidates.some((candidate) => {
      return candidate.decode && candidate.source.renditionId === retainedId;
    })
  ) {
    _dropRetained(state);
  }
}

function _schedule({
  state,
  candidates,
  environment,
}: {
  state: SchedulerState;
  candidates: readonly PrefetchCandidate[];
  environment: Readonly<PrefetchEnvironment>;
}): void {
  if (state.disposed) {
    return;
  }
  const isNewSelection =
    state.environment?.memberId !== environment.memberId ||
    state.environment.selectionKey !== environment.selectionKey;
  if (isNewSelection) {
    _clear(state);
    state.readyAt = state.clock() + APP_CONFIG.media.prefetch.dwellMs;
  }
  state.environment = { ...environment };
  state.candidates = getAllowedPrefetchCandidatesFromEnvironment({
    candidates,
    environment,
    now: state.clock(),
  });
  _discardObsolete(state);
  clearTimeout(state.timer);
  state.timer = setTimeout(
    () => {
      state.timer = undefined;
      _pump(state);
    },
    Math.max(0, state.readyAt - state.clock()),
  );
}

function _matchesHandoff({
  state,
  retained,
  destination,
}: {
  state: SchedulerState;
  retained: RetainedMedia | undefined;
  destination: Readonly<MediaDestination>;
}): boolean {
  return (
    retained !== undefined &&
    retained.epoch === state.getEpoch() &&
    retained.candidate.itemId === destination.itemId &&
    retained.candidate.source.renditionId === destination.source?.renditionId &&
    retained.candidate.source.url === destination.source?.url &&
    Date.parse(retained.candidate.source.expiresAt) > state.clock() + 60_000 &&
    retained.media.decodedPhoto?.getImage() !== undefined
  );
}

function _releaseHandoff({
  state,
  handoff,
}: {
  state: SchedulerState;
  handoff: Handoff | undefined;
}): void {
  if (handoff !== undefined && state.handoff === handoff) {
    state.handoff = undefined;
    handoff.media.release();
    _pump(state);
  }
}

function _promote({
  state,
  destination,
}: {
  state: SchedulerState;
  destination: Readonly<MediaDestination>;
}): MediaPromotion {
  const id = destination.source?.renditionId ?? "";
  const operation = state.active.get(id);
  if (operation !== undefined) {
    operation.foregroundOwners += 1;
  }
  state.candidates = state.candidates.filter((candidate) => {
    return candidate.source.renditionId !== id;
  });
  if (
    state.handoff === undefined &&
    _matchesHandoff({ state, retained: state.retained, destination })
  ) {
    state.handoff = { ...state.retained!, owners: 0 };
    state.retained = undefined;
  }
  const handoff = _matchesHandoff({
    state,
    retained: state.handoff,
    destination,
  })
    ? state.handoff
    : undefined;
  if (handoff !== undefined) {
    handoff.owners += 1;
  }
  return _makePromotionFromOwners({ state, destination, operation, handoff });
}

function _makePromotionFromOwners({
  state,
  destination,
  operation,
  handoff,
}: MediaPromotionOptions): MediaPromotion {
  let isReleased = false;
  return {
    get decodedPhoto() {
      return !isReleased &&
        state.handoff === handoff &&
        _matchesHandoff({ state, retained: handoff, destination })
        ? handoff?.media.decodedPhoto
        : undefined;
    },
    finishSelectedDecode: () => {
      _releaseHandoff({ state, handoff });
    },
    release: () => {
      if (isReleased) {
        return;
      }
      isReleased = true;
      if (operation !== undefined && --operation.foregroundOwners === 0) {
        operation.controller.abort();
      }
      if (handoff !== undefined && --handoff.owners === 0) {
        _releaseHandoff({ state, handoff });
      }
    },
  };
}

function _dispose(state: SchedulerState): void {
  state.disposed = true;
  _clear(state);
  _releaseHandoff({ state, handoff: state.handoff });
  // A disposed member has no remaining foreground owner for a decode.
  state.active.forEach((operation) => {
    operation.controller.abort();
  });
}

/** Creates one member's window; unsettled loads remain reserved after clear. */
export function createMediaPrefetchScheduler(
  options: Readonly<{
    load: SpeculativeMediaLoader;
    clock: () => number;
    getEpoch?: () => unknown;
  }>,
): MediaPrefetchScheduler {
  const state: SchedulerState = {
    ...options,
    getEpoch:
      options.getEpoch ??
      (() => {
        return undefined;
      }),
    candidates: [],
    environment: undefined,
    active: new Map(),
    completed: new Set(),
    retained: undefined,
    handoff: undefined,
    generation: 0,
    readyAt: 0,
    timer: undefined,
    disposed: false,
  };
  return {
    schedule: ({ candidates, environment }) => {
      _schedule({ state, candidates, environment });
    },
    promote: (id) => {
      return _promote({ state, destination: id });
    },
    clear: () => {
      _clear(state);
    },
    dispose: () => {
      _dispose(state);
    },
  };
}
