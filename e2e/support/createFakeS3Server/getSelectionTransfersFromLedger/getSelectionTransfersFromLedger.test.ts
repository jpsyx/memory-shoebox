import { expect, test } from "vitest";
import type {
  FakeS3LedgerSnapshot,
  FakeS3RequestEvidence,
} from "../createFakeS3Server.types.ts";
import { getSelectionTransfersFromLedger } from "./getSelectionTransfersFromLedger.ts";

function _request(
  requestId: number,
  objectId: string,
  bodyBytes: number,
): FakeS3RequestEvidence {
  return {
    requestId,
    objectId,
    method: "GET",
    startSequence: requestId * 2,
    startedAtMs: requestId * 10,
    terminalSequence: 100,
    terminatedAtMs: 1000,
    closedAtMs: 1001,
    terminal: "finished",
    status: 200,
    bodyBytes,
    chunks: [{ sequence: 99, atMs: 999, bodyBytes }],
  };
}
const ledger: FakeS3LedgerSnapshot = {
  capturedAtMs: 1100,
  nextRequestId: 10,
  sequence: 100,
  activeRequests: 0,
  bodyBytes: 3816,
  requests: [
    _request(5, "target/display", 2),
    _request(8, "target/thumb", 3809),
    _request(9, "other/thumb", 5),
  ],
};
const options = {
  ledger,
  objectIds: ["target/thumb", "target/display"],
  sequenceAtSelection: 12,
  activeRequestIds: [],
};

test("attributes a later thumbnail only to its repeated-ID visit, retaining bytes completed after the next selection", () => {
  const firstVisit = getSelectionTransfersFromLedger({
    ...options,
    requestStartWatermark: 6,
    nextSelectionWatermark: 7,
  });
  expect(firstVisit).toEqual({
    bodyBytes: 0,
    displayBodyBytes: 0,
    requestIds: [],
    activeBodyBytesAfterSelection: 0,
  });
  const secondVisit = getSelectionTransfersFromLedger({
    ...options,
    requestStartWatermark: 8,
    nextSelectionWatermark: 9,
  });
  expect(secondVisit).toEqual({
    bodyBytes: 3809,
    displayBodyBytes: 0,
    requestIds: [8],
    activeBodyBytesAfterSelection: 0,
  });
  expect(ledger.requests[1]!.terminalSequence).toBeGreaterThan(
    ledger.requests[2]!.startSequence,
  );
});

test("keeps unavoidable pre-selection work's late chunks separate from new starts", () => {
  const selection = getSelectionTransfersFromLedger({
    ...options,
    requestStartWatermark: 6,
    nextSelectionWatermark: 7,
    activeRequestIds: [5],
  });
  expect(selection.bodyBytes).toBe(0);
  expect(selection.activeBodyBytesAfterSelection).toBe(2);
  expect(ledger.bodyBytes).toBe(3816);
});
