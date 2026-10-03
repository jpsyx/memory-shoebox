import {
  KEY_PREFIX,
  createClient,
  startStubBucket,
  CORS_XML,
  NO_CORS_XML,
  B2_NO_CORS_XML,
  NO_BUCKET_XML,
  SOME_KEY,
  makeBucketPathFromPrefix,
  INITIATE_XML,
  WIRE_CASES,
  makeListXmlFromOptions,
  getObjectKeysFromAsyncIterable,
  getQueryFromStubRequest,
} from "./clientTestHelpers.ts";

import { describe, expect, it } from "vitest";

describe("getBucketCors", () => {
  it("maps S3's rules onto this codebase's spelling", async () => {
    const bucket = await startStubBucket({
      answer: () => {
        return {
          status: 200,
          headers: { "content-type": "application/xml" },
          body: CORS_XML,
        };
      },
    });

    expect(await bucket.client.getBucketCors()).toEqual([
      {
        allowedOrigins: ["https://shoebox.example"],
        allowedMethods: ["PUT", "GET"],
        allowedHeaders: ["content-type"],
        exposeHeaders: ["ETag"],
        maxAgeSeconds: 3600,
      },
      {
        allowedOrigins: ["*"],
        allowedMethods: ["GET"],
        allowedHeaders: [],
        exposeHeaders: [],
        maxAgeSeconds: 0,
      },
    ]);
    await bucket.close();
  });

  it("answers no rules for a bucket that has none", async () => {
    const bucket = await startStubBucket({
      answer: () => {
        return {
          status: 404,
          headers: { "content-type": "application/xml" },
          body: NO_CORS_XML,
        };
      },
    });

    expect(await bucket.client.getBucketCors()).toEqual([]);
    await bucket.close();
  });

  it("answers no rules in Backblaze's own spelling of that error too", async () => {
    // Found against a real bucket: B2 answers `NoSuchCorsConfiguration`, and
    // matching only AWS's `NoSuchCORSConfiguration` made `pnpm b2:cors` crash
    // on a bucket that simply had no rule yet.
    const bucket = await startStubBucket({
      answer: () => {
        return {
          status: 404,
          headers: { "content-type": "application/xml" },
          body: B2_NO_CORS_XML,
        };
      },
    });

    expect(await bucket.client.getBucketCors()).toEqual([]);
    await bucket.close();
  });

  it("still throws when the bucket itself is missing, a 404 as well", async () => {
    const bucket = await startStubBucket({
      answer: () => {
        return {
          status: 404,
          headers: { "content-type": "application/xml" },
          body: NO_BUCKET_XML,
        };
      },
    });

    await expect(bucket.client.getBucketCors()).rejects.toThrow();
    await bucket.close();
  });
});

describe("putBucketCors", () => {
  it("sends every field of every rule to the bucket's cors resource", async () => {
    const bucket = await startStubBucket({
      answer: () => {
        return { status: 200 };
      },
    });

    await bucket.client.putBucketCors({
      rules: [
        {
          allowedOrigins: ["https://shoebox.example"],
          allowedMethods: ["PUT", "GET", "HEAD"],
          allowedHeaders: ["content-type"],
          exposeHeaders: ["ETag"],
          maxAgeSeconds: 3600,
        },
      ],
    });

    const sent = bucket.requests[0];
    expect(sent?.method).toBe("PUT");
    expect(sent?.url).toMatch(/^\/memory-shoebox-media\/\?cors/u);
    expect(sent?.body).toContain(
      "<AllowedOrigin>https://shoebox.example</AllowedOrigin>",
    );
    expect(sent?.body).toContain("<AllowedMethod>HEAD</AllowedMethod>");
    expect(sent?.body).toContain("<AllowedHeader>content-type</AllowedHeader>");
    expect(sent?.body).toContain("<ExposeHeader>ETag</ExposeHeader>");
    expect(sent?.body).toContain("<MaxAgeSeconds>3600</MaxAgeSeconds>");
    await bucket.close();
  });
});

describe("the key prefix, on every operation that takes a key", () => {
  it.each(WIRE_CASES)(
    "$operation reaches the bucket under the prefix",
    async ({ method, call, answer }) => {
      const bucket = await startStubBucket({
        answer: () => {
          return answer;
        },
      });

      await call(bucket.client);

      expect(bucket.requests).toHaveLength(1);
      expect(bucket.requests[0]?.method).toBe(method);
      expect(new URL(bucket.requests[0]?.url ?? "", "http://x").pathname).toBe(
        makeBucketPathFromPrefix(KEY_PREFIX),
      );
      await bucket.close();
    },
  );

  it("signs a GET, a PUT and part URLs for the prefixed key", async () => {
    const client = createClient();

    const get = await client.presignGet({ key: SOME_KEY });
    const put = await client.presignPut({
      key: SOME_KEY,
      contentType: "image/jpeg",
    });
    const parts = await client.signParts({
      key: SOME_KEY,
      uploadId: "upload-1",
      partNumbers: [1, 2],
    });

    const partUrls = parts.map((part) => {
      return part.url;
    });
    [get, put, ...partUrls].forEach((url) => {
      expect(new URL(url).pathname).toBe(makeBucketPathFromPrefix(KEY_PREFIX));
    });
  });

  it("signs the part URLs that presignMultipart returns for the prefixed key", async () => {
    const bucket = await startStubBucket({
      answer: () => {
        return { status: 200, body: INITIATE_XML };
      },
    });

    const started = await bucket.client.presignMultipart({
      key: SOME_KEY,
      contentType: "image/jpeg",
      partCount: 2,
    });

    started.partUrls.forEach((url) => {
      expect(new URL(url).pathname).toBe(makeBucketPathFromPrefix(KEY_PREFIX));
    });
    await bucket.close();
  });

  it("uses the configured prefix, a production client never the test one", async () => {
    const bucket = await startStubBucket({
      answer: () => {
        return { status: 204 };
      },
      environment: { NODE_ENV: "production" },
    });

    await bucket.client.deleteObject({ key: SOME_KEY });

    expect(new URL(bucket.requests[0]?.url ?? "", "http://x").pathname).toBe(
      makeBucketPathFromPrefix("production"),
    );
    await bucket.close();
  });

  it("keeps a prefix of several segments whole", async () => {
    const url = await createClient({
      B2_KEY_PREFIX: "shoebox/test-1",
    }).presignGet({ key: SOME_KEY });

    expect(new URL(url).pathname).toBe(
      makeBucketPathFromPrefix("shoebox/test-1"),
    );
  });
});

describe("listObjects, under the key prefix", () => {
  it("lists only under the prefix and hands back keys without it", async () => {
    const bucket = await startStubBucket({
      answer: () => {
        return {
          status: 200,
          body: makeListXmlFromOptions({
            keys: ["test/uploads/a.jpg", "test/uploads/b.jpg", "test/c.jpg"],
          }),
        };
      },
    });

    const keys = await getObjectKeysFromAsyncIterable(
      bucket.client.listObjects(),
    );

    expect(keys).toEqual(["uploads/a.jpg", "uploads/b.jpg", "c.jpg"]);
    // A trailing slash, so that a prefix of `test` never lists `test-2/`.
    expect(getQueryFromStubRequest(bucket.requests[0]).get("prefix")).toBe(
      "test/",
    );
    await bucket.close();
  });

  it("applies the caller's own prefix inside the key prefix", async () => {
    const bucket = await startStubBucket({
      answer: () => {
        return {
          status: 200,
          body: makeListXmlFromOptions({ keys: ["test/uploads/a.jpg"] }),
        };
      },
    });

    const keys = await getObjectKeysFromAsyncIterable(
      bucket.client.listObjects({ prefix: "uploads/" }),
    );

    expect(keys).toEqual(["uploads/a.jpg"]);
    expect(getQueryFromStubRequest(bucket.requests[0]).get("prefix")).toBe(
      "test/uploads/",
    );
    await bucket.close();
  });

  it("skips a listed key that is not under the prefix, rather than mangling it", async () => {
    const bucket = await startStubBucket({
      answer: () => {
        return {
          status: 200,
          body: makeListXmlFromOptions({
            keys: ["test-2/x.jpg", "production/x.jpg", "test/y.jpg"],
          }),
        };
      },
    });

    const keys = await getObjectKeysFromAsyncIterable(
      bucket.client.listObjects(),
    );

    // `test-2/` starts with `test` but is another folder, and `production/`
    // is another environment's. Neither is this instance's to report.
    expect(keys).toEqual(["y.jpg"]);
    await bucket.close();
  });

  it("keeps the prefix on every page it follows", async () => {
    const bucket = await startStubBucket({
      answer: (request) => {
        const isFirstPage = !request.url.includes("continuation-token");
        return {
          status: 200,
          body: isFirstPage
            ? makeListXmlFromOptions({
                keys: ["test/a.jpg"],
                nextToken: "page-2",
              })
            : makeListXmlFromOptions({ keys: ["test/b.jpg"] }),
        };
      },
    });

    const keys = await getObjectKeysFromAsyncIterable(
      bucket.client.listObjects(),
    );

    expect(keys).toEqual(["a.jpg", "b.jpg"]);
    expect(bucket.requests).toHaveLength(2);
    expect(
      getQueryFromStubRequest(bucket.requests[1]).get("continuation-token"),
    ).toBe("page-2");
    expect(getQueryFromStubRequest(bucket.requests[1]).get("prefix")).toBe(
      "test/",
    );
    await bucket.close();
  });
});
