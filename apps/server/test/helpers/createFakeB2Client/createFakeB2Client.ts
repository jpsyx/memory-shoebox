import {
  makeCorsOperationsFromContext,
  makeMultipartFinishOperationsFromContext,
  makeMultipartOperationsFromContext,
  makeReadOperationsFromContext,
  makeStreamingOperationsFromContext,
  makeWriteOperationsFromContext,
} from "./fakeB2OperationHelpers.ts";

import {
  type FakeB2Client,
  type FakeB2State,
  type RecordFakeB2OperationOptions,
} from "./createFakeB2Client.types.ts";

export type { FakeB2Client } from "./createFakeB2Client.types.ts";

// Records calls, invokes hooks and applies simulated network refusals.
function _recordOperationForClient(
  options: Readonly<RecordFakeB2OperationOptions>,
): void {
  const { client, calls, operation, isNetworkCall } = options;
  calls.push(operation);
  client.onCall?.(operation);
  if (isNetworkCall && client.isUnavailable) {
    throw new Error(`Backblaze is unavailable (${operation})`);
  }
}

// Construct the collections and upload sequence shared by this fake client.
function _createFakeB2State(): FakeB2State {
  return {
    deletedKeys: [],
    failingKeys: new Set(),
    objects: new Map(),
    storedObjects: new Map(),
    multipartObjects: new Map(),
    multipartUploads: new Map(),
    calls: [],
    openedUploadCount: 0,
  };
}

/**
 * Builds a Backblaze double.
 *
 * No test in this repository may reach Backblaze: the credentials in the test
 * config are placeholders, and a client that signed a real request would be
 * signing it with them.
 *
 * Every operation is `async`, so a `record` that throws (an unavailable
 * bucket, or an `onCall` refusing) becomes a rejected promise, exactly as a
 * real SDK failure is, rather than a synchronous throw.
 */
export function createFakeB2Client(): FakeB2Client {
  const state = _createFakeB2State();
  const {
    deletedKeys,
    failingKeys,
    objects,
    storedObjects,
    multipartObjects,
    multipartUploads,
    calls,
  } = state;

  const record = (
    functionOptions: Readonly<{
      operation: string;
      options: { isNetworkCall: boolean };
    }>,
  ): void => {
    _recordOperationForClient({
      client,
      calls,
      operation: functionOptions.operation,
      isNetworkCall: functionOptions.options.isNetworkCall,
    });
  };

  const context = {
    state,
    record,
    getClient: (): FakeB2Client => {
      return client;
    },
  };
  const client: FakeB2Client = {
    deletedKeys,
    failingKeys,
    objects,
    storedObjects,
    multipartObjects,
    multipartUploads,
    calls,
    isUnavailable: false,
    corsRules: [],
    onCall: undefined,
    ...makeReadOperationsFromContext(context),
    ...makeWriteOperationsFromContext(context),
    ...makeStreamingOperationsFromContext(context),
    ...makeMultipartOperationsFromContext(context),
    ...makeMultipartFinishOperationsFromContext(context),
    ...makeCorsOperationsFromContext(context),
  };

  return client;
}
