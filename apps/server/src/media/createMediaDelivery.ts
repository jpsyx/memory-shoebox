import { appConfig } from "../../../../app.config.ts";
import type {
  MediaLeaseRequest,
  SignedMediaLease,
} from "./mediaDelivery.types.ts";

/** Pending signing work or its completed lease, owned by the cache. */
type LeaseEntry = {
  promise: Promise<SignedMediaLease>;
  lease: SignedMediaLease | undefined;
};

function _makeCacheKeyFromRequest(
  namespace: string,
  request: Readonly<MediaLeaseRequest>,
): string {
  return JSON.stringify([
    namespace,
    request.key,
    request.renditionId,
    request.expiresInSeconds,
    request.downloadFilename ?? null,
  ]);
}

function _isReusableEntry(entry: Readonly<LeaseEntry>, now: number): boolean {
  if (entry.lease === undefined) {
    return true;
  }
  return (
    now >= Date.parse(entry.lease.issuedAt) &&
    now <
      Date.parse(entry.lease.expiresAt) -
        appConfig.media.leaseRenewalMarginSeconds * 1000
  );
}

function _startSigning(
  options: Readonly<{
    entries: Map<string, LeaseEntry>;
    cacheKey: string;
    request: MediaLeaseRequest;
    sign: (request: MediaLeaseRequest) => Promise<SignedMediaLease>;
  }>,
): LeaseEntry {
  const entry: LeaseEntry = {
    lease: undefined,
    promise: Promise.resolve()
      .then(() => {
        return options.sign(options.request);
      })
      .then(
        (lease) => {
          entry.lease = { ...lease };
          return entry.lease;
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
  if (entries.size > appConfig.media.leaseCacheMaxEntries) {
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
      const cacheKey = _makeCacheKeyFromRequest(options.namespace, request);
      const cached = entries.get(cacheKey);
      entries.delete(cacheKey);
      const entry =
        cached !== undefined && _isReusableEntry(cached, now)
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
