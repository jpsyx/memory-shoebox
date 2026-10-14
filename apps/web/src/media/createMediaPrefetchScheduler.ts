import { appConfig } from "../../../../app.config";
import {
  getAllowedPrefetchCandidatesFromEnvironment,
  getPrefetchCostsFromCandidate,
} from "./mediaPrefetchPolicy";
import type {
  MediaPrefetchScheduler,
  PrefetchCandidate,
  PrefetchEnvironment,
  SpeculativeMedia,
  SpeculativeMediaLoader,
} from "./mediaPrefetch.types";

type Operation = {
  candidate: PrefetchCandidate;
  controller: AbortController;
  generation: number;
  promoted: boolean;
};
type SchedulerState = {
  load: SpeculativeMediaLoader;
  clock: () => number;
  candidates: PrefetchCandidate[];
  environment: PrefetchEnvironment | undefined;
  active: Map<string, Operation>;
  completed: Set<string>;
  retained:
    | { candidate: PrefetchCandidate; media: SpeculativeMedia }
    | undefined;
  generation: number;
  readyAt: number;
  timer: ReturnType<typeof setTimeout> | undefined;
  disposed: boolean;
};

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
    if (!operation.promoted) {
      operation.controller.abort();
    }
  });
}

function _getReservationsFromState(state: Readonly<SchedulerState>): {
  encodedBytes: number;
  decodedBytes: number;
} {
  const candidates = [...state.active.values()].map((operation) => {
    return operation.candidate;
  });
  if (state.retained !== undefined) {
    candidates.push(state.retained.candidate);
  }
  return candidates.reduce(
    (total, candidate) => {
      const cost = getPrefetchCostsFromCandidate(candidate);
      return {
        encodedBytes: total.encodedBytes + cost.encodedBytes,
        decodedBytes: total.decodedBytes + cost.decodedBytes,
      };
    },
    { encodedBytes: 0, decodedBytes: 0 },
  );
}

function _settle(
  state: SchedulerState,
  operation: Readonly<Operation>,
  media?: SpeculativeMedia,
): void {
  const id = operation.candidate.source.renditionId;
  state.active.delete(id);
  const desired = state.candidates.find((candidate) => {
    return candidate.source.renditionId === id;
  });
  const isCurrent =
    !state.disposed &&
    !operation.controller.signal.aborted &&
    !operation.promoted &&
    operation.generation === state.generation &&
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
    state.retained = { candidate: operation.candidate, media };
  } else {
    media?.release();
  }
  _pump(state);
}

function _start(
  state: SchedulerState,
  candidate: Readonly<PrefetchCandidate>,
): void {
  const operation: Operation = {
    candidate: { ...candidate },
    controller: new AbortController(),
    generation: state.generation,
    promoted: false,
  };
  state.active.set(candidate.source.renditionId, operation);
  try {
    void state.load(operation.candidate, operation.controller.signal).then(
      (media) => {
        _settle(state, operation, media);
      },
      () => {
        _settle(state, operation);
      },
    );
  } catch {
    _settle(state, operation);
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
      state.active.size >= appConfig.media.prefetch.maxOperations ||
      state.active.has(id) ||
      state.completed.has(id)
    ) {
      return;
    }
    const reserved = _getReservationsFromState(state);
    const cost = getPrefetchCostsFromCandidate(candidate);
    if (
      reserved.encodedBytes + cost.encodedBytes >
        appConfig.media.prefetch.maxEncodedBytes ||
      (candidate.decode && reserved.decodedBytes > 0)
    ) {
      return;
    }
    _start(state, candidate);
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
    if (!desired.has(id) && !operation.promoted) {
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

function _schedule(
  state: SchedulerState,
  candidates: readonly PrefetchCandidate[],
  environment: Readonly<PrefetchEnvironment>,
): void {
  if (state.disposed) {
    return;
  }
  const isNewSelection =
    state.environment?.memberId !== environment.memberId ||
    state.environment.selectionKey !== environment.selectionKey;
  if (isNewSelection) {
    _clear(state);
    state.readyAt = state.clock() + appConfig.media.prefetch.dwellMs;
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

function _promote(state: SchedulerState, id: string): void {
  const operation = state.active.get(id);
  if (operation !== undefined) {
    operation.promoted = true;
  }
  state.candidates = state.candidates.filter((candidate) => {
    return candidate.source.renditionId !== id;
  });
  if (state.retained?.candidate.source.renditionId === id) {
    _dropRetained(state);
  }
}

function _dispose(state: SchedulerState): void {
  state.disposed = true;
  _clear(state);
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
  }>,
): MediaPrefetchScheduler {
  const state: SchedulerState = {
    ...options,
    candidates: [],
    environment: undefined,
    active: new Map(),
    completed: new Set(),
    retained: undefined,
    generation: 0,
    readyAt: 0,
    timer: undefined,
    disposed: false,
  };
  return {
    schedule: (candidates, environment) => {
      _schedule(state, candidates, environment);
    },
    promote: (id) => {
      _promote(state, id);
    },
    clear: () => {
      _clear(state);
    },
    dispose: () => {
      _dispose(state);
    },
  };
}
