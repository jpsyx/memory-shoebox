import type { B2Client, B2Object } from "../../src/b2/client.ts";

/** A `B2Client` that records what it was asked to do and talks to nothing. */
export type FakeB2Client = B2Client & {
  readonly deletedKeys: readonly string[];
  /** Keys that will throw when deleted, so a retry path can be exercised. */
  failingKeys: Set<string>;
  readonly objects: Map<string, B2Object>;
};

/**
 * Builds a Backblaze double.
 *
 * No test in this repository may reach Backblaze: the credentials in the test
 * config are placeholders, and a client that signed a real request would be
 * signing it with them.
 */
export function createFakeB2Client(): FakeB2Client {
  const deletedKeys: string[] = [];
  const failingKeys = new Set<string>();
  const objects = new Map<string, B2Object>();

  const client: FakeB2Client = {
    deletedKeys,
    failingKeys,
    objects,

    listObjects: async function* (options = {}) {
      for (const object of objects.values()) {
        if (
          options.prefix === undefined ||
          object.key.startsWith(options.prefix)
        ) {
          yield object;
        }
      }
    },

    presignGet: ({ key }) => {
      return Promise.resolve(`https://b2.test/get/${encodeURIComponent(key)}`);
    },

    presignPut: ({ key }) => {
      return Promise.resolve(`https://b2.test/put/${encodeURIComponent(key)}`);
    },

    presignMultipart: ({ key, partCount }) => {
      return Promise.resolve({
        uploadId: `upload-${key}`,
        partUrls: Array.from({ length: partCount }, (_unused, index) => {
          return `https://b2.test/part/${encodeURIComponent(key)}/${index + 1}`;
        }),
      });
    },

    completeMultipart: () => {
      return Promise.resolve();
    },

    abortMultipart: () => {
      return Promise.resolve();
    },

    deleteObject: ({ key }) => {
      if (failingKeys.has(key)) {
        return Promise.reject(new Error(`B2 refused to delete ${key}`));
      }
      deletedKeys.push(key);
      objects.delete(key);
      return Promise.resolve();
    },

    putObject: ({ key }) => {
      objects.set(key, {
        key,
        sizeBytes: 0,
        uploadedAt: "2026-09-27T10:00:00.000Z",
      });
      return Promise.resolve();
    },
  };

  return client;
}
