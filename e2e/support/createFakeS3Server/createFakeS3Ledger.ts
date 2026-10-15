import type { ServerResponse } from "node:http";
import type {
  FakeS3LedgerSnapshot,
  FakeS3RequestEvidence,
} from "./createFakeS3Server.types.ts";

/** Records sanitized lifecycle events before body reads, independently of close. */
export function createFakeS3Ledger(): {
  start: (options: {
    objectId: string;
    method: string;
    response: ServerResponse;
  }) => (bodyBytes: number) => void;
  snapshot: () => FakeS3LedgerSnapshot;
} {
  const requests: FakeS3RequestEvidence[] = [];
  let sequence = 0;
  let bodyBytes = 0;
  let activeRequests = 0;
  return {
    start: ({ objectId, method, response }) => {
      const entry: FakeS3RequestEvidence = {
        requestId: requests.length + 1,
        objectId,
        method,
        startSequence: ++sequence,
        startedAtMs: performance.now(),
        terminalSequence: null,
        terminatedAtMs: null,
        closedAtMs: null,
        terminal: null,
        status: null,
        bodyBytes: 0,
        chunks: [],
      };
      requests.push(entry);
      activeRequests += 1;
      const finish = (terminal: "finished" | "closed-before-finish") => {
        if (entry.terminal !== null) {
          return;
        }
        entry.terminal = terminal;
        entry.terminalSequence = ++sequence;
        entry.terminatedAtMs = performance.now();
        entry.status = response.statusCode;
      };
      response.once("finish", () => {
        finish("finished");
      });
      response.once("close", () => {
        finish("closed-before-finish");
        entry.closedAtMs = performance.now();
        activeRequests -= 1;
      });
      return (bytes) => {
        if (bytes === 0) {
          return;
        }
        entry.bodyBytes += bytes;
        bodyBytes += bytes;
        entry.chunks.push({
          sequence: ++sequence,
          atMs: performance.now(),
          bodyBytes: bytes,
        });
      };
    },
    snapshot: () => {
      return {
        capturedAtMs: performance.now(),
        nextRequestId: requests.length + 1,
        sequence,
        activeRequests,
        bodyBytes,
        requests: structuredClone(requests),
      };
    },
  };
}
