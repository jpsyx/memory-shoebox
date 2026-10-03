import type {
  B2Client,
  B2Object,
  BucketCorsRule,
  HeadObjectResult,
} from "../../src/b2/client/client.ts";

/** A `B2Client` that records what it was asked to do and talks to nothing. */
export type FakeB2Client = B2Client & {
  readonly deletedKeys: readonly string[];
  /** Keys that will throw when deleted, so a retry path can be exercised. */
  failingKeys: Set<string>;
  readonly objects: Map<string, B2Object>;
  /**
   * What `headObject` answers, by key. A key absent here is Backblaze's 404,
   * so a test that wants a transfer to have landed puts it here first.
   */
  readonly storedObjects: Map<string, HeadObjectResult>;
  /** Every operation called, by name, in the order it was called. */
  readonly calls: string[];
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
  onCall: ((operation: string) => void) | null;
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

/** A rule sharing no array with the original, so neither side can mutate the other. */
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
  const deletedKeys: string[] = [];
  const failingKeys = new Set<string>();
  const objects = new Map<string, B2Object>();
  const storedObjects = new Map<string, HeadObjectResult>();
  const calls: string[] = [];

  const record = (
    operation: string,
    options: { isNetworkCall: boolean },
  ): void => {
    calls.push(operation);
    client.onCall?.(operation);
    if (options.isNetworkCall && client.isUnavailable) {
      throw new Error(`Backblaze is unavailable (${operation})`);
    }
  };

  const client: FakeB2Client = {
    deletedKeys,
    failingKeys,
    objects,
    storedObjects,
    calls,
    isUnavailable: false,
    corsRules: [],
    onCall: null,

    listObjects: async function* (options = {}) {
      record("listObjects", NETWORK);
      for (const object of objects.values()) {
        if (
          options.prefix === undefined ||
          object.key.startsWith(options.prefix)
        ) {
          yield object;
        }
      }
    },

    presignGet: async ({ key, downloadFilename }) => {
      record("presignGet", LOCAL);
      const url = `https://b2.test/get/${encodeURIComponent(key)}`;
      return downloadFilename === undefined
        ? url
        : `${url}?filename=${encodeURIComponent(downloadFilename)}`;
    },

    presignPut: async ({ key }) => {
      record("presignPut", LOCAL);
      return `https://b2.test/put/${encodeURIComponent(key)}`;
    },

    presignMultipart: async ({ key, partCount }) => {
      record("presignMultipart", NETWORK);
      const uploadId = `upload-${key}`;
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
      record("signParts", LOCAL);
      return partNumbers.map((partNumber) => {
        return {
          partNumber,
          url: _makePartUrlFromUpload({ key, uploadId, partNumber }),
        };
      });
    },

    completeMultipart: async () => {
      record("completeMultipart", NETWORK);
    },

    abortMultipart: async () => {
      record("abortMultipart", NETWORK);
    },

    headObject: async ({ key }) => {
      record("headObject", NETWORK);
      return storedObjects.get(key) ?? null;
    },

    deleteObject: async ({ key }) => {
      record("deleteObject", NETWORK);
      if (failingKeys.has(key)) {
        throw new Error(`B2 refused to delete ${key}`);
      }
      deletedKeys.push(key);
      objects.delete(key);
      storedObjects.delete(key);
    },

    putObject: async ({ key, body, contentType }) => {
      record("putObject", NETWORK);
      objects.set(key, {
        key,
        sizeBytes: 0,
        uploadedAt: "2026-09-27T10:00:00.000Z",
      });
      storedObjects.set(key, { sizeBytes: body.byteLength, contentType });
    },

    getBucketCors: async () => {
      record("getBucketCors", NETWORK);
      return client.corsRules.map(_copyBucketCorsRule);
    },

    putBucketCors: async ({ rules }) => {
      record("putBucketCors", NETWORK);
      client.corsRules = rules.map(_copyBucketCorsRule);
    },
  };

  return client;
}
