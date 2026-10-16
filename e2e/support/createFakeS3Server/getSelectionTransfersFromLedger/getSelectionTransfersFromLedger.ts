import type {
  FakeS3LedgerSnapshot,
  FakeS3RequestEvidence,
} from "../createFakeS3Server.types.ts";
type SelectionTransferOptions = {
  ledger: FakeS3LedgerSnapshot;
  objectIds: readonly string[];
  requestStartWatermark: number;
  nextSelectionWatermark: number;
  sequenceAtSelection: number;
  activeRequestIds: readonly number[];
};

type SelectionTransfers = {
  bodyBytes: number;
  displayBodyBytes: number;
  requestIds: number[];
  activeBodyBytesAfterSelection: number;
};

function _getBodyBytesFromRequests(
  requests: readonly FakeS3RequestEvidence[],
): number {
  return requests.reduce((total, request) => {
    return total + request.bodyBytes;
  }, 0);
}

/**
 * Attributes starts to one selection while keeping their final terminal bytes.
 */
export function getSelectionTransfersFromLedger(
  options: Readonly<SelectionTransferOptions>,
): SelectionTransfers {
  const requests = options.ledger.requests.filter((request) => {
    return (
      options.objectIds.includes(request.objectId) &&
      request.requestId >= options.requestStartWatermark &&
      request.requestId < options.nextSelectionWatermark
    );
  });
  const activeBodyBytesAfterSelection = options.ledger.requests
    .filter((request) => {
      return options.activeRequestIds.includes(request.requestId);
    })
    .flatMap((request) => {
      return request.chunks;
    })
    .filter((chunk) => {
      return chunk.sequence > options.sequenceAtSelection;
    })
    .reduce((total, chunk) => {
      return total + chunk.bodyBytes;
    }, 0);
  return {
    bodyBytes: _getBodyBytesFromRequests(requests),
    displayBodyBytes: _getBodyBytesFromRequests(
      requests.filter((request) => {
        return request.objectId.endsWith("/display");
      }),
    ),
    requestIds: requests.map((request) => {
      return request.requestId;
    }),
    activeBodyBytesAfterSelection,
  };
}
