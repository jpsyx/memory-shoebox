import type { RequestListener } from "node:http";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { createB2Client } from "../../../../src/b2/createB2Client/createB2Client.ts";
import { type B2Client } from "../../../../src/b2/createB2Client/createB2Client.types.ts";
import { createTestConfig } from "../../../helpers/createTestConfig.ts";

/**
 * The prefix `createTestConfig` resolves, because its environment is `test`.
 * Every key below reaches the bucket under it.
 */
export const KEY_PREFIX = "test";

/**
 * Creates a B2 client configured from the supplied test environment.
 */
export function createClient(
  environment: Record<string, string | undefined> = {},
): B2Client {
  return createB2Client(createTestConfig(environment).b2);
}

/** One request the stand-in bucket received. */
export type StubRequest = { method: string; url: string; body: string };

/** What the stand-in bucket answers one request with. */
export type StubAnswer = {
  status: number;
  headers?: Record<string, string>;
  body?: string;
};

/**
 * Starts an HTTP server on a free local port that answers as Backblaze would,
 * and builds the real client with that server as its endpoint.
 *
 * This is how the operations that call the API are covered offline: the
 * client, its SDK and its XML parsing are all real, and only the far end of
 * the socket is not. The path-style addressing the client already uses is
 * what lets a bare `127.0.0.1` stand in for the bucket's host.
 */
export async function startStubBucket(
  functionOptions: Readonly<{
    answer: (request: StubRequest) => StubAnswer;
    environment?: Record<string, string | undefined>;
  }>,
): Promise<{
  client: B2Client;
  requests: StubRequest[];
  close: () => Promise<void>;
}> {
  const { answer, environment = {} } = functionOptions;

  const requests: StubRequest[] = [];
  const server = createServer(
    _makeStubRequestListenerFromAnswer({ answer, requests }),
  );
  await new Promise<void>((onListening) => {
    server.listen(0, "127.0.0.1", onListening);
  });
  const { port } = server.address() as AddressInfo;
  const config = createTestConfig({
    B2_ENDPOINT: `http://127.0.0.1:${port}`,
    ...environment,
  });

  return {
    client: createB2Client(config.b2),
    requests,
    close: () => {
      // The SDK keeps its sockets alive, and `close` waits on them otherwise.
      server.closeAllConnections();
      return new Promise<void>((onClosed) => {
        server.close(() => {
          onClosed();
        });
      });
    },
  };
}

/** A bucket's CORS configuration, as S3 serialises it. */
export const CORS_XML = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<CORSConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">',
  "<CORSRule>",
  "<AllowedHeader>content-type</AllowedHeader>",
  "<AllowedMethod>PUT</AllowedMethod>",
  "<AllowedMethod>GET</AllowedMethod>",
  "<AllowedOrigin>https://shoebox.example</AllowedOrigin>",
  "<ExposeHeader>ETag</ExposeHeader>",
  "<MaxAgeSeconds>3600</MaxAgeSeconds>",
  "</CORSRule>",
  "<CORSRule>",
  "<AllowedMethod>GET</AllowedMethod>",
  "<AllowedOrigin>*</AllowedOrigin>",
  "</CORSRule>",
  "</CORSConfiguration>",
].join("");

/** What AWS S3 answers for a bucket that has never had a CORS rule. */
export const NO_CORS_XML = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  "<Error><Code>NoSuchCORSConfiguration</Code>",
  "<Message>The CORS configuration does not exist</Message></Error>",
].join("");

/**
 * What Backblaze B2 answers for the same bucket: the same 404, but with its
 * own spelling of the code, `Cors` where AWS writes `CORS`.
 */
export const B2_NO_CORS_XML = [
  "<Error><Code>NoSuchCorsConfiguration</Code>",
  "<Message>The CORS configuration does not exist</Message></Error>",
].join("");

/** What either service answers when the bucket itself is not there. */
export const NO_BUCKET_XML = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  "<Error><Code>NoSuchBucket</Code>",
  "<Message>The specified bucket does not exist</Message></Error>",
].join("");

/** The key every prefix test uses, as the rest of the server spells it. */
export const SOME_KEY = "uploads/s/f/original.jpg";

/** The path S3 sees for `SOME_KEY` when the prefix is `prefix`. */
export function makeBucketPathFromPrefix(prefix: string): string {
  return `/memory-shoebox-media/${prefix}/${SOME_KEY}`;
}

/** An `InitiateMultipartUploadResult`, which `presignMultipart` needs. */
export const INITIATE_XML = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<InitiateMultipartUploadResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">',
  `<Bucket>memory-shoebox-media</Bucket><Key>${SOME_KEY}</Key>`,
  "<UploadId>upload-1</UploadId>",
  "</InitiateMultipartUploadResult>",
].join("");

/** A `CompleteMultipartUploadResult`, which `completeMultipart` needs. */
export const COMPLETE_XML = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<CompleteMultipartUploadResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">',
  `<Bucket>memory-shoebox-media</Bucket><Key>${SOME_KEY}</Key>`,
  '<ETag>"etag-1"</ETag>',
  "</CompleteMultipartUploadResult>",
].join("");

/** One operation that reaches the bucket, and what the bucket answers it. */
export type WireCase = {
  operation: string;
  method: string;
  call: (client: B2Client) => Promise<unknown>;
  answer: StubAnswer;
};

/**
 * B2 operations and their expected requests for the wire-contract tests.
 */
export const WIRE_CASES: readonly WireCase[] = [
  {
    operation: "presignMultipart",
    method: "POST",
    call: (client) => {
      return client.presignMultipart({
        key: SOME_KEY,
        contentType: "image/jpeg",
        partCount: 1,
      });
    },
    answer: { status: 200, body: INITIATE_XML },
  },
  {
    operation: "completeMultipart",
    method: "POST",
    call: (client) => {
      return client.completeMultipart({
        key: SOME_KEY,
        uploadId: "upload-1",
        parts: [{ partNumber: 1, etag: '"etag-1"' }],
      });
    },
    answer: { status: 200, body: COMPLETE_XML },
  },
  {
    operation: "abortMultipart",
    method: "DELETE",
    call: (client) => {
      return client.abortMultipart({ key: SOME_KEY, uploadId: "upload-1" });
    },
    answer: { status: 204 },
  },
  {
    operation: "headObject",
    method: "HEAD",
    call: (client) => {
      return client.headObject({ key: SOME_KEY });
    },
    answer: { status: 200, headers: { "content-length": "3" } },
  },
  {
    operation: "deleteObject",
    method: "DELETE",
    call: (client) => {
      return client.deleteObject({ key: SOME_KEY });
    },
    answer: { status: 204 },
  },
  {
    operation: "putObject",
    method: "PUT",
    call: (client) => {
      return client.putObject({
        key: SOME_KEY,
        body: new Uint8Array([1, 2, 3]),
        contentType: "image/jpeg",
      });
    },
    answer: { status: 200 },
  },
] as const;

/** A `ListBucketResult` page, with the keys exactly as S3 stores them. */
export function makeListXmlFromOptions(
  options: Readonly<{
    keys: readonly string[];
    nextToken?: string;
  }>,
): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">',
    "<Name>memory-shoebox-media</Name>",
    `<IsTruncated>${options.nextToken === undefined ? "false" : "true"}</IsTruncated>`,
    options.nextToken === undefined
      ? ""
      : `<NextContinuationToken>${options.nextToken}</NextContinuationToken>`,
    ...options.keys.map((key) => {
      return `<Contents><Key>${key}</Key><LastModified>2026-10-01T10:00:00.000Z</LastModified><Size>100</Size></Contents>`;
    }),
    "</ListBucketResult>",
  ].join("");
}

/** Everything a listing yields, in order. */
export async function getObjectKeysFromAsyncIterable(
  objects: AsyncGenerator<{ key: string }>,
): Promise<string[]> {
  const keys: string[] = [];
  for await (const object of objects) {
    keys.push(object.key);
  }
  return keys;
}

/** The query parameters of one request the stub received. */
export function getQueryFromStubRequest(
  request: StubRequest | undefined,
): URLSearchParams {
  return new URL(request?.url ?? "", "http://x").searchParams;
}

// Buffer, record and answer each stub HTTP request.
function _makeStubRequestListenerFromAnswer(options: {
  answer: (request: StubRequest) => StubAnswer;
  requests: StubRequest[];
}): RequestListener {
  const { answer, requests } = options;
  return (request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    request.on("end", () => {
      const received = {
        method: request.method ?? "",
        url: request.url ?? "",
        body: Buffer.concat(chunks).toString("utf8"),
      };
      requests.push(received);
      const reply = answer(received);
      response.writeHead(reply.status, reply.headers);
      response.end(reply.body);
    });
  };
}
