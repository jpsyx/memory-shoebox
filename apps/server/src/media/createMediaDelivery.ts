import { APP_CONFIG } from "../../../../app.config.ts";
import type {
  MediaLeaseRequest,
  SignedMediaLease,
} from "./mediaDelivery.types.ts";
type SigningOptions = {
  entries: Map<string, LeaseEntry>;
  cacheKey: string;
  request: MediaLeaseRequest;
  sign: (request: MediaLeaseRequest) => Promise<SignedMediaLease>;
};

/** Pending signing work or its completed lease, owned by the cache. */
type LeaseEntry = {
  promise: Promise<SignedMediaLease>;
  issuedAtMs: number;
  expiresAtMs: number;
};

function _makeCacheKeyFromRequest({
  namespace,
  request,
}: {
  namespace: string;
  request: Readonly<MediaLeaseRequest>;
}): string {
  return JSON.stringify([
    namespace,
    request.key,
    request.renditionId,
    request.expiresInSeconds,
    request.downloadFilename ?? null,
  ]);
}

function _startSigning(options: Readonly<SigningOptions>): LeaseEntry {
  const issuedAtMs = Math.floor(options.request.now.getTime() / 1000) * 1000;
  const entry: LeaseEntry = {
    issuedAtMs,
    expiresAtMs: issuedAtMs + options.request.expiresInSeconds * 1000,
    promise: Promise.resolve()
      .then(() => {
        return options.sign(options.request);
      })
      .then(
        (lease) => {
          entry.issuedAtMs = Date.parse(lease.issuedAt);
          entry.expiresAtMs = Date.parse(lease.expiresAt);
          return { ...lease };
        },
        (failure: unknown) => {
          if (options.entries.get(options.cacheKey) === entry) {
            options.entries.delete(options.cacheKey);
          }
          throw failure;
        },
      ),
  };
  return entry;
}

// Expired hits are replaced; overflow prunes the least recently used entry.
function _pruneEntries(entries: Map<string, LeaseEntry>): void {
  if (entries.size > APP_CONFIG.media.leaseCacheMaxEntries) {
    const oldestKey = entries.keys().next().value;
    if (oldestKey !== undefined) {
      entries.delete(oldestKey);
    }
  }
}

/** Owns a bounded LRU for one private storage and credential context. */
export function createMediaDelivery(
  options: Readonly<{
    namespace: string;
    sign: (request: MediaLeaseRequest) => Promise<SignedMediaLease>;
  }>,
): {
  getLease(request: MediaLeaseRequest): Promise<SignedMediaLease>;
  clear(): void;
} {
  const entries = new Map<string, LeaseEntry>();
  let lastRequestAt = -Infinity;
  return {
    getLease: (request) => {
      const now = request.now.getTime();
      if (now < lastRequestAt) {
        entries.clear();
      }
      lastRequestAt = now;
      const cacheKey = _makeCacheKeyFromRequest({
        namespace: options.namespace,
        request,
      });
      const cached = entries.get(cacheKey);
      entries.delete(cacheKey);
      const entry =
        cached !== undefined &&
        now >= cached.issuedAtMs &&
        now <
          cached.expiresAtMs - APP_CONFIG.media.leaseRenewalMarginSeconds * 1000
          ? cached
          : _startSigning({ entries, cacheKey, request, sign: options.sign });
      entries.set(cacheKey, entry);
      _pruneEntries(entries);
      return entry.promise.then((lease) => {
        return { ...lease };
      });
    },
    clear: () => {
      entries.clear();
      lastRequestAt = -Infinity;
    },
  };
}
