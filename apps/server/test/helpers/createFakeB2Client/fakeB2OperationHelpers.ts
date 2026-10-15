import { createMediaDelivery } from "../../../src/media/createMediaDelivery.ts";

import type {
  B2Client,
  BucketCorsRule,
} from "../../../src/b2/createB2Client/createB2Client.types.ts";

import {
  type FakeB2Client,
  type FakeB2State,
} from "./createFakeB2Client.types.ts";

/** Marks operations that must respect the fake client network-unavailable switch. */
export const NETWORK = { isNetworkCall: true } as const;

/** Marks local signing operations that remain available without provider access. */
export const LOCAL = { isNetworkCall: false } as const;

/** Encodes object key, upload ID and part number into a deterministic fake part URL so distinct multipart identities cannot collide. */
export function makePartUrlFromUpload(options: {
  key: string;
  uploadId: string;
  partNumber: number;
}): string {
  const key = encodeURIComponent(options.key);
  const uploadId = encodeURIComponent(options.uploadId);
  return `https://b2.test/part/${key}/${uploadId}/${options.partNumber}`;
}

/** Copies every CORS array so callers cannot mutate stored rules through read or write aliases. */
export function copyBucketCorsRule(
  rule: Readonly<BucketCorsRule>,
): BucketCorsRule {
  return {
    allowedOrigins: [...rule.allowedOrigins],
    allowedMethods: [...rule.allowedMethods],
    allowedHeaders: [...rule.allowedHeaders],
    exposeHeaders: [...rule.exposeHeaders],
    maxAgeSeconds: rule.maxAgeSeconds,
  };
}

/** Uses the real lease policy with fake URLs identified by object, whole-second issue time and optional filename; records signing without network access. */
export function createFakeMediaDelivery(
  record: (
    options: Readonly<{
      operation: string;
      options: { isNetworkCall: boolean };
    }>,
  ) => void,
): ReturnType<typeof createMediaDelivery> {
  return createMediaDelivery({
    namespace: "fake-bucket/test",
    sign: async (request) => {
      record({ operation: "presignGet", options: LOCAL });
      const issuedAt = new Date(
        Math.floor(request.now.getTime() / 1000) * 1000,
      );
      const url = new URL(
        `https://b2.test/get/${encodeURIComponent(request.key)}`,
      );
      url.searchParams.set("issuedAt", issuedAt.toISOString());
      url.searchParams.set(
        "expiresInSeconds",
        String(request.expiresInSeconds),
      );
      if (request.downloadFilename !== undefined) {
        url.searchParams.set("filename", request.downloadFilename);
      }
      return {
        url: url.href,
        issuedAt: issuedAt.toISOString(),
        expiresAt: new Date(
          issuedAt.getTime() + request.expiresInSeconds * 1000,
        ).toISOString(),
      };
    },
  });
}

/** Creates recorded listing, head and signing operations over the shared fake object state and lease cache. */
export function makeReadOperationsFromContext(
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
): Pick<
  B2Client,
  "listObjects" | "headObject" | "presignGet" | "getMediaLease"
> {
  const delivery = createFakeMediaDelivery(context.record);
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
    getMediaLease: delivery.getLease,
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

/** Creates recorded put/delete/signing operations; storage metadata mutates in memory and configured delete failures remain observable. */
export function makeWriteOperationsFromContext(
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

/** Creates unique fake multipart lifetimes and deterministic part URLs; signing additional parts performs no provider operation. */
export function makeMultipartOperationsFromContext(
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
      context.state.multipartUploads.set(uploadId, { key });
      return {
        uploadId,
        partUrls: Array.from({ length: partCount }, (_unused, index) => {
          return makePartUrlFromUpload({
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
          url: makePartUrlFromUpload({ key, uploadId, partNumber }),
        };
      });
    },
  };
}

/** Reads and writes copied CORS rules on the current fake client, preserving caller/storage array isolation. */
export function makeCorsOperationsFromContext(
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
      return context.getClient().corsRules.map(copyBucketCorsRule);
    },
    putBucketCors: async ({ rules }) => {
      context.record({ operation: "putBucketCors", options: NETWORK });
      context.getClient().corsRules = rules.map(copyBucketCorsRule);
    },
  };
}

/** Completes or aborts an owned fake upload; completion publishes only the preseeded assembled object metadata. */
export function makeMultipartFinishOperationsFromContext(
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
    completeMultipart: async ({ key, uploadId }) => {
      context.record({ operation: "completeMultipart", options: NETWORK });
      context.state.multipartUploads.delete(uploadId);
      const assembled = context.state.multipartObjects.get(key);
      if (assembled !== undefined) {
        context.state.storedObjects.set(key, assembled);
      }
    },
    abortMultipart: async ({ uploadId }) => {
      context.record({ operation: "abortMultipart", options: NETWORK });
      context.state.multipartUploads.delete(uploadId);
    },
  };
}

/** Consumes and counts streamed chunks under cancellation, publishes exact-size metadata on success, and aborts the fake multipart upload on failure. */
export function makeStreamingOperationsFromContext(
  context: Parameters<typeof makeWriteOperationsFromContext>[0],
): Pick<B2Client, "putObjectStream" | "listMultipartUploadsForKey"> {
  return {
    listMultipartUploadsForKey: async function* (key) {
      context.record({
        operation: "listMultipartUploadsForKey",
        options: NETWORK,
      });
      for (const [uploadId, upload] of context.state.multipartUploads) {
        if (upload.key === key) {
          yield { uploadId };
        }
      }
    },
    putObjectStream: async (options) => {
      context.record({ operation: "putObjectStream", options: NETWORK });
      options.signal.throwIfAborted();
      const client = context.getClient();
      const { uploadId } = await client.presignMultipart({
        key: options.key,
        contentType: options.contentType,
        partCount: 0,
      });
      try {
        await options.onMultipartStarted(uploadId);
        let sizeBytes = 0;
        for await (const chunk of options.body) {
          options.signal.throwIfAborted();
          sizeBytes += chunk.byteLength;
        }
        if (sizeBytes !== options.byteSize) {
          throw new Error("processing_output_size_mismatch");
        }
        context.state.storedObjects.set(options.key, {
          sizeBytes,
          contentType: options.contentType,
        });
        context.state.multipartUploads.delete(uploadId);
      } catch (error) {
        await client.abortMultipart({ key: options.key, uploadId });
        throw error;
      }
    },
  };
}
