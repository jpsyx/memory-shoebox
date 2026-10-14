import { describe, expect, it, vi } from "vitest";
import { createMediaDelivery } from "../../src/media/createMediaDelivery.ts";
import type {
  MediaLeaseRequest,
  SignedMediaLease,
} from "../../src/media/mediaDelivery.types.ts";
import { createB2Client } from "../../src/b2/createB2Client/createB2Client.ts";

const START: number = Date.parse("2026-10-14T10:00:00.000Z");

function _makeRequest(seconds = 0): MediaLeaseRequest {
  return {
    key: "items/photo/display.jpg",
    renditionId: "rendition-1",
    expiresInSeconds: 3600,
    now: new Date(START + seconds * 1000),
  };
}

function _sign(
  request: Readonly<MediaLeaseRequest>,
): Promise<SignedMediaLease> {
  return Promise.resolve({
    url: `https://bucket.test/${request.key}?issued=${request.now.toISOString()}`,
    issuedAt: request.now.toISOString(),
    expiresAt: new Date(
      request.now.getTime() + request.expiresInSeconds * 1000,
    ).toISOString(),
  });
}

function _createDelivery() {
  const sign = vi.fn(_sign);
  return {
    sign,
    delivery: createMediaDelivery({ namespace: "bucket/prefix", sign }),
  };
}

describe("createMediaDelivery", () => {
  it("reuses a lease without extending it", async () => {
    const { delivery, sign } = _createDelivery();
    const first = await delivery.getLease(_makeRequest());
    const second = await delivery.getLease(_makeRequest(120));
    expect(second).toEqual(first);
    expect(sign).toHaveBeenCalledTimes(1);
  });

  it("renews at exactly the 60-second margin", async () => {
    const { delivery, sign } = _createDelivery();
    const first = await delivery.getLease(_makeRequest());
    expect(await delivery.getLease(_makeRequest(3539))).toEqual(first);
    const renewed = await delivery.getLease(_makeRequest(3540));
    expect(renewed.issuedAt).toBe("2026-10-14T10:59:00.000Z");
    expect(renewed.expiresAt).toBe("2026-10-14T11:59:00.000Z");
    expect(sign).toHaveBeenCalledTimes(2);
  });

  it("evicts the least recently used lease when the 10,001st key arrives", async () => {
    const { delivery, sign } = _createDelivery();
    const request = _makeRequest();
    await Array.from({ length: 10000 }).reduce(
      async (prior, _unused, index) => {
        await prior;
        await delivery.getLease({
          ...request,
          key: `photo-${index}`,
          renditionId: `revision-${index}`,
        });
      },
      Promise.resolve(),
    );
    await delivery.getLease({
      ...request,
      key: "photo-0",
      renditionId: "revision-0",
    });
    await delivery.getLease({
      ...request,
      key: "photo-10000",
      renditionId: "revision-10000",
    });
    await delivery.getLease({
      ...request,
      key: "photo-0",
      renditionId: "revision-0",
    });
    expect(sign).toHaveBeenCalledTimes(10001);
    await delivery.getLease({
      ...request,
      key: "photo-1",
      renditionId: "revision-1",
    });
    expect(sign).toHaveBeenCalledTimes(10002);
  });

  it("shares pending signing work for concurrent calls", async () => {
    let finishSigning: (lease: SignedMediaLease) => void = () => {};
    const pendingSignature = new Promise<SignedMediaLease>((resolve) => {
      finishSigning = resolve;
    });
    const sign = vi.fn(() => {
      return pendingSignature;
    });
    const delivery = createMediaDelivery({ namespace: "bucket", sign });
    const first = delivery.getLease(_makeRequest());
    const second = delivery.getLease(_makeRequest(1));
    await Promise.resolve();
    finishSigning(await _sign(_makeRequest()));
    expect(await second).toEqual(await first);
    expect(sign).toHaveBeenCalledTimes(1);
  });

  it.each([3540, 3600, 3601])(
    "replaces stale pending work at %i seconds without restoring its later result",
    async (seconds) => {
      let finishSigning: (lease: SignedMediaLease) => void = () => {};
      const { delivery, sign } = _createDelivery();
      sign.mockImplementationOnce(() => {
        return new Promise((resolve) => {
          finishSigning = resolve;
        });
      });
      const first = delivery.getLease(_makeRequest(0.999));
      const sharedBeforeMargin = delivery.getLease(_makeRequest(3539.999));
      await Promise.resolve();
      expect(sign).toHaveBeenCalledTimes(1);
      const replacement = delivery.getLease(_makeRequest(seconds));
      await Promise.resolve();
      expect(sign).toHaveBeenCalledTimes(2);
      const renewed = await replacement;
      expect(renewed.issuedAt).toBe(
        new Date(START + seconds * 1000).toISOString(),
      );
      finishSigning(await _sign(_makeRequest()));
      expect((await first).expiresAt).toBe("2026-10-14T11:00:00.000Z");
      expect(await sharedBeforeMargin).toEqual(await first);
      expect(await delivery.getLease(_makeRequest(seconds + 1))).toEqual(
        renewed,
      );
      expect(sign).toHaveBeenCalledTimes(2);
    },
  );

  it.each([3540, 3601])(
    "keeps the replacement after stale pending work rejects at %i seconds",
    async (seconds) => {
      let failSigning: (failure: Error) => void = () => {};
      const { delivery, sign } = _createDelivery();
      sign.mockImplementationOnce(() => {
        return new Promise((_resolve, reject) => {
          failSigning = reject;
        });
      });
      const first = delivery.getLease(_makeRequest());
      const firstFailure = first.catch((failure: unknown) => {
        return failure;
      });
      const replacement = delivery.getLease(_makeRequest(seconds));
      await Promise.resolve();
      expect(sign).toHaveBeenCalledTimes(2);
      const renewed = await replacement;
      failSigning(new Error("stale signing failed"));
      expect(await firstFailure).toMatchObject({
        message: "stale signing failed",
      });
      expect(await delivery.getLease(_makeRequest(seconds + 1))).toEqual(
        renewed,
      );
      expect(sign).toHaveBeenCalledTimes(2);
    },
  );

  it("retries after failed signing instead of retaining the rejection", async () => {
    const { delivery, sign } = _createDelivery();
    sign.mockRejectedValueOnce(new Error("signing failed"));
    await expect(delivery.getLease(_makeRequest())).rejects.toThrow(
      "signing failed",
    );
    expect((await delivery.getLease(_makeRequest(1))).issuedAt).toBe(
      "2026-10-14T10:00:01.000Z",
    );
    expect(sign).toHaveBeenCalledTimes(2);
  });

  it.each([
    { renditionId: "rendition-2" },
    { key: "items/photo/replacement.jpg" },
    { downloadFilename: "photo.jpg" },
    { expiresInSeconds: 7200 },
  ])("isolates revision, key, disposition and TTL: %j", async (change) => {
    const { delivery, sign } = _createDelivery();
    await delivery.getLease(_makeRequest());
    await delivery.getLease({ ..._makeRequest(120), ...change });
    expect(sign).toHaveBeenCalledTimes(2);
  });

  it("discards future-issued leases on clock rollback", async () => {
    const { delivery, sign } = _createDelivery();
    await delivery.getLease(_makeRequest(120));
    const rolledBack = await delivery.getLease(_makeRequest());
    expect(rolledBack.issuedAt).toBe("2026-10-14T10:00:00.000Z");
    expect(sign).toHaveBeenCalledTimes(2);
  });

  it("does not restore cleared leases when old in-flight work finishes", async () => {
    let finishSigning: (lease: SignedMediaLease) => void = () => {};
    const { delivery, sign } = _createDelivery();
    sign.mockImplementationOnce(() => {
      return new Promise((resolve) => {
        finishSigning = resolve;
      });
    });
    const pending = delivery.getLease(_makeRequest());
    await Promise.resolve();
    delivery.clear();
    finishSigning(await _sign(_makeRequest()));
    await pending;
    expect((await delivery.getLease(_makeRequest(120))).issuedAt).toBe(
      "2026-10-14T10:02:00.000Z",
    );
    expect(sign).toHaveBeenCalledTimes(2);
  });

  it("keeps lease state local to its client even with identical namespaces", async () => {
    const firstClient = _createDelivery();
    const secondClient = _createDelivery();
    await firstClient.delivery.getLease(_makeRequest());
    expect(
      (await secondClient.delivery.getLease(_makeRequest(120))).issuedAt,
    ).toBe("2026-10-14T10:02:00.000Z");
    expect(secondClient.sign).toHaveBeenCalledTimes(1);
  });
});

describe("B2 media signing", () => {
  it("returns the second-aligned timestamps actually signed and seven-day private freshness", async () => {
    const client = createB2Client({
      endpoint: "https://bucket.test",
      region: "test",
      bucket: "family",
      keyPrefix: "test",
      thumbnailPrefix: "thumbs",
      keyId: "test-key",
      applicationKey: "test-secret",
    });
    const request = { ..._makeRequest(), now: new Date(START + 999) };
    const lease = await client.getMediaLease(request);
    const url = new URL(lease.url);
    expect(url.searchParams.get("X-Amz-Date")).toBe("20261014T100000Z");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("3600");
    expect(url.searchParams.get("response-cache-control")).toBe(
      "private, max-age=604800",
    );
    expect(lease.issuedAt).toBe("2026-10-14T10:00:00.000Z");
    expect(lease.expiresAt).toBe("2026-10-14T11:00:00.000Z");
    expect(await client.getMediaLease(_makeRequest(120))).toEqual(lease);
    const otherClient = createB2Client({
      endpoint: "https://bucket.test",
      region: "test",
      bucket: "family",
      keyPrefix: "test",
      thumbnailPrefix: "thumbs",
      keyId: "rotated-key",
      applicationKey: "rotated-secret",
    });
    expect((await otherClient.getMediaLease(_makeRequest(120))).url).not.toBe(
      lease.url,
    );
  });
});
