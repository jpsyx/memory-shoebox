/** Mutable state shared by the fake storage operations. */
type FakeB2State = Pick<
  FakeB2Client,
  | "deletedKeys"
  | "failingKeys"
  | "objects"
  | "storedObjects"
  | "multipartObjects"
  | "calls"
> & { openedUploadCount: number };
import type {
  B2Client,
  B2Object,
  BucketCorsRule,
  HeadObjectResult,
} from "../../../src/b2/createB2Client/createB2Client.types.ts";

/** A `B2Client` that records what it was asked to do and talks to nothing. */
export type FakeB2Client = B2Client & {
  deletedKeys: string[];
  /** Keys that will throw when deleted, so a retry path can be exercised. */
  failingKeys: Set<string>;
  objects: Map<string, B2Object>;
  /**
   * What `headObject` answers, by key. A key absent here is Backblaze's 404,
   * so a test that wants a transfer to have landed puts it here first.
   */
  storedObjects: Map<string, HeadObjectResult>;
  /**
   * What a successful `completeMultipart` assembles, by key: Backblaze joins
   * the parts into one object, which `headObject` then answers for. A key
   * absent here assembles nothing, so a test that completes a multipart
   * upload and expects it to land says what landed.
   */
  multipartObjects: Map<string, HeadObjectResult>;
  /** Every operation called, by name, in the order it was called. */
  calls: string[];
  /**
   * When true, every operation that would reach the network rejects, which
   * is how a route's `503 upload_storage_unavailable` is reached. The two
   * presigners and `signParts` keep working: they are local HMAC work.
   */
  isUnavailable: boolean;
  /** The bucket's CORS rules, as `getBucketCors` reads them. */
  corsRules: BucketCorsRule[];
  /**
   * Called with the operation's name before every operation runs. A test
   * that throws from it fails the call, which is how a test asserts that no
   * Backblaze call happens while a transaction is open.
   */
  onCall: ((operation: string) => void) | undefined;
};

/** Whether an operation reaches Backblaze, or is signing work done locally. */
const NETWORK = { isNetworkCall: true } as const;
const LOCAL = { isNetworkCall: false } as const;

/**
 * One part's URL, carrying the upload id as the real URL's query does, so a
 * test that re-signs under the wrong upload id sees a different URL.
 */
function _makePartUrlFromUpload(options: {
  key: string;
  uploadId: string;
  partNumber: number;
}): string {
  const key = encodeURIComponent(options.key);
  const uploadId = encodeURIComponent(options.uploadId);
  return `https://b2.test/part/${key}/${uploadId}/${options.partNumber}`;
}

/**
 * A rule sharing no array with the original, so neither side can mutate the
 * other.
 */
function _copyBucketCorsRule(rule: Readonly<BucketCorsRule>): BucketCorsRule {
  return {
    allowedOrigins: [...rule.allowedOrigins],
    allowedMethods: [...rule.allowedMethods],
    allowedHeaders: [...rule.allowedHeaders],
    exposeHeaders: [...rule.exposeHeaders],
    maxAgeSeconds: rule.maxAgeSeconds,
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
    calls,
    isUnavailable: false,
    corsRules: [],
    onCall: undefined,
    ..._makeReadOperations(context),
    ..._makeWriteOperations(context),
    ..._makeMultipartOperations(context),
    ..._makeMultipartFinishOperations(context),
    ..._makeCorsOperations(context),
  };

  return client;
}

// Binds fake read operations to the fixture state.
function _makeReadOperations(
  context: Readonly<{
    state: FakeB2State;
    record: (
      options: Readonly<{
        operation: string;
        options: { isNetworkCall: boolean };
      }>,
    ) => void;
    getClient: () => FakeB2Client;
  }>,
): Pick<B2Client, "listObjects" | "headObject" | "presignGet"> {
  return {
    listObjects: async function* (options = {}) {
      context.record({ operation: "listObjects", options: NETWORK });
      for (const object of context.state.objects.values()) {
        if (
          options.prefix === undefined ||
          object.key.startsWith(options.prefix)
        ) {
          yield object;
        }
      }
    },
    presignGet: async ({ key, downloadFilename }) => {
      context.record({ operation: "presignGet", options: LOCAL });
      const url = `https://b2.test/get/${encodeURIComponent(key)}`;
      return downloadFilename === undefined
        ? url
        : `${url}?filename=${encodeURIComponent(downloadFilename)}`;
    },
    headObject: async ({ key }) => {
      context.record({ operation: "headObject", options: NETWORK });
      return context.state.storedObjects.get(key) ?? undefined;
    },
  };
}

// Binds fake write operations to the fixture state.
function _makeWriteOperations(
  context: Readonly<{
    state: FakeB2State;
    record: (
      options: Readonly<{
        operation: string;
        options: { isNetworkCall: boolean };
      }>,
    ) => void;
    getClient: () => FakeB2Client;
  }>,
): Pick<B2Client, "presignPut" | "putObject" | "deleteObject"> {
  return {
    presignPut: async ({ key, contentType }) => {
      context.record({ operation: "presignPut", options: LOCAL });
      const type = encodeURIComponent(contentType);
      return `https://b2.test/put/${encodeURIComponent(key)}?contentType=${type}`;
    },
    deleteObject: async ({ key }) => {
      context.record({ operation: "deleteObject", options: NETWORK });
      if (context.state.failingKeys.has(key)) {
        throw new Error(`B2 refused to delete ${key}`);
      }
      context.state.deletedKeys.push(key);
      context.state.objects.delete(key);
      context.state.storedObjects.delete(key);
    },
    putObject: async ({ key, body, contentType }) => {
      context.record({ operation: "putObject", options: NETWORK });
      context.state.objects.set(key, {
        key,
        sizeBytes: body.byteLength,
        uploadedAt: "2026-09-27T10:00:00.000Z",
      });
      context.state.storedObjects.set(key, {
        sizeBytes: body.byteLength,
        contentType,
      });
    },
  };
}

// Binds fake multipart signing operations to the fixture state.
function _makeMultipartOperations(
  context: Readonly<{
    state: FakeB2State;
    record: (
      options: Readonly<{
        operation: string;
        options: { isNetworkCall: boolean };
      }>,
    ) => void;
    getClient: () => FakeB2Client;
  }>,
): Pick<B2Client, "presignMultipart" | "signParts"> {
  return {
    presignMultipart: async ({ key, partCount }) => {
      context.record({ operation: "presignMultipart", options: NETWORK });
      context.state.openedUploadCount += 1;
      const uploadId = `upload-${context.state.openedUploadCount}-${key}`;
      return {
        uploadId,
        partUrls: Array.from({ length: partCount }, (_unused, index) => {
          return _makePartUrlFromUpload({
            key,
            uploadId,
            partNumber: index + 1,
          });
        }),
      };
    },
    signParts: async ({ key, uploadId, partNumbers }) => {
      context.record({ operation: "signParts", options: LOCAL });
      return partNumbers.map((partNumber) => {
        return {
          partNumber,
          url: _makePartUrlFromUpload({ key, uploadId, partNumber }),
        };
      });
    },
  };
}

// Bind the getBucketCors, putBucketCors operations to this client context.
function _makeCorsOperations(
  context: Readonly<{
    state: FakeB2State;
    record: (
      options: Readonly<{
        operation: string;
        options: { isNetworkCall: boolean };
      }>,
    ) => void;
    getClient: () => FakeB2Client;
  }>,
): Pick<B2Client, "getBucketCors" | "putBucketCors"> {
  return {
    getBucketCors: async () => {
      context.record({ operation: "getBucketCors", options: NETWORK });
      return context.getClient().corsRules.map(_copyBucketCorsRule);
    },
    putBucketCors: async ({ rules }) => {
      context.record({ operation: "putBucketCors", options: NETWORK });
      context.getClient().corsRules = rules.map(_copyBucketCorsRule);
    },
  };
}

/** Identity and flags needed to record one fake storage operation. */
type RecordFakeB2OperationOptions = {
  client: FakeB2Client;
  calls: string[];
  operation: string;
  isNetworkCall: boolean;
};

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

// Bind multipart completion and abortion to the fake client state.
function _makeMultipartFinishOperations(
  context: Readonly<{
    state: FakeB2State;
    record: (
      options: Readonly<{
        operation: string;
        options: { isNetworkCall: boolean };
      }>,
    ) => void;
    getClient: () => FakeB2Client;
  }>,
): Pick<B2Client, "completeMultipart" | "abortMultipart"> {
  return {
    completeMultipart: async ({ key }) => {
      context.record({ operation: "completeMultipart", options: NETWORK });
      const assembled = context.state.multipartObjects.get(key);
      if (assembled !== undefined) {
        context.state.storedObjects.set(key, assembled);
      }
    },
    abortMultipart: async () => {
      context.record({ operation: "abortMultipart", options: NETWORK });
    },
  };
}

// Construct the collections and upload sequence shared by this fake client.
function _createFakeB2State(): FakeB2State {
  return {
    deletedKeys: [],
    failingKeys: new Set(),
    objects: new Map(),
    storedObjects: new Map(),
    multipartObjects: new Map(),
    calls: [],
    openedUploadCount: 0,
  };
}
