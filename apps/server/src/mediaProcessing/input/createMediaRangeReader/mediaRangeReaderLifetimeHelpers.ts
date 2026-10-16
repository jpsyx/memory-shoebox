import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type {
  MediaRangeReader,
  ReaderState,
} from "./createMediaRangeReader.types.ts";

type MediaRangeReaderOptions = {
  server: Server;
  signal: AbortSignal;
  state: ReaderState;
  path: string;
};

async function _awaitIdle({
  state,
  signal,
}: {
  state: ReaderState;
  signal?: AbortSignal;
}): Promise<void> {
  signal?.throwIfAborted();
  while (state.active.size > 0) {
    await once(state.capacityChanges, "settled", { signal });
  }
}

function _makeCloseFromReader(
  options: Readonly<{
    server: Server;
    signal: AbortSignal;
    state: ReaderState;
  }>,
): () => Promise<void> {
  const { server, signal, state } = options;
  let closing: Promise<void> | undefined;
  const close = (): Promise<void> => {
    closing ??= new Promise<void>((resolve) => {
      signal.removeEventListener("abort", onAbort);
      state.active.forEach((controller) => {
        controller.abort();
      });
      server.closeAllConnections();
      server.close(() => {
        void _awaitIdle({ state }).then(resolve);
      });
    });
    return closing;
  };
  const onAbort = (): void => {
    void close();
  };
  signal.addEventListener("abort", onAbort, { once: true });
  return close;
}

/** Rejects a phase cap that cannot represent a nonnegative byte allowance. */
export function validateMediaRangePhaseLimit(limit: number | undefined): void {
  if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 0)) {
    throw new Error("processing_phase_limit_invalid");
  }
}

/** Exposes one loopback reader and its shared, idempotent lifetime controls. */
export function makeMediaRangeReaderFromServer(
  options: Readonly<MediaRangeReaderOptions>,
): MediaRangeReader {
  const { server, signal, state, path } = options;
  const close = _makeCloseFromReader({ server, signal, state });
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}${path}`,
    getBytesRead: () => {
      return state.bytesRead;
    },
    getFailure: () => {
      return state.failure;
    },
    close,
    awaitIdle: (waitSignal) => {
      return _awaitIdle({ state, signal: waitSignal });
    },
    setPhaseByteLimit: (limit) => {
      if (state.active.size > 0) {
        throw new Error("processing_reads_active");
      }
      validateMediaRangePhaseLimit(limit);
      state.phaseByteLimit = limit;
      if (state.failure === "phase_byte_limit") {
        state.failure = undefined;
      }
    },
  };
}
