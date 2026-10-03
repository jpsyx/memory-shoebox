import { appConfig } from "../../../../../app.config";

/*
 * The arithmetic of a transfer, pure, so every number in it is tested
 * without a network.
 */

/** One part of a multipart upload: 1-based, `end` exclusive. */
export type PartRange = { partNumber: number; start: number; end: number };

/** How the transfer retries what can be retried. */
export type RetryPolicy = {
  /** Tries in all, the first included. */
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  sleep: (delayMs: number) => Promise<void>;
};

/**
 * Six tries, a second apart and doubling to sixteen: about half a minute in
 * all, which outlasts a dropped packet or Backblaze's own "please retry"
 * `503`, and is short enough that a file which will not go is reported while
 * the uploader is still looking. A lift or a tunnel the browser knows about
 * (`navigator.onLine` false) is not retried through this at all: it is waited
 * out, up to `OFFLINE_WAIT_CEILING_MS`. No jitter: at most two transfers per
 * browser share a link, so there is no herd to spread.
 */
export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 6,
  baseDelayMs: 1000,
  maxDelayMs: 16_000,
  sleep: (delayMs) => {
    return new Promise((settle) => {
      setTimeout(settle, delayMs);
    });
  },
};

/**
 * The slowest link a part is planned for, from the configuration
 * (`appConfig.upload.transferFloorBytesPerSecond`: 16 KiB a second, one bar
 * of signal), so the client and the server agree on what "too slow" means.
 *
 * **It is a floor on the estimate, not a guess at the speed.** A part's
 * remaining URL lifetime is judged against the time it needs at the measured
 * rate, and before anything has been measured, or when the measured rate is
 * slower still, at this one. At this rate a 16 MiB part needs about 26
 * minutes with the margin below, inside the hour a fresh URL lives
 * (`presignTtlSeconds`), so a re-presign always yields a URL the part can
 * use and the check can never ask for a new URL on every part.
 */
export const FLOOR_BYTES_PER_SECOND =
  appConfig.upload.transferFloorBytesPerSecond;

/** Headroom on an estimate: half again, plus ten seconds of latency. */
const LIFETIME_SAFETY_FACTOR = 1.5;
const LIFETIME_MARGIN_MS = 10_000;

/**
 * Every part's number and byte range, from the file's size and the part size.
 *
 * Every part is `partSizeBytes` long except the last, which takes what is
 * left. An empty file has no parts (it is refused at manifest anyway).
 */
export function getPartRangesFromSize(
  options: Readonly<{ byteSize: number; partSizeBytes: number }>,
): PartRange[] {
  const partCount = Math.ceil(options.byteSize / options.partSizeBytes);
  return Array.from({ length: partCount }, (_unused, index) => {
    const start = index * options.partSizeBytes;
    return {
      partNumber: index + 1,
      start,
      end: Math.min(start + options.partSizeBytes, options.byteSize),
    };
  });
}

/**
 * How long a URL must still live for one part to be sent on it.
 *
 * @param options.partBytes The part's size.
 * @param options.measuredBytesPerSecond The rate so far, or null before any.
 * @returns Milliseconds. Re-presign when the URL has less left than this.
 */
export function getRequiredLifetimeMsFromRate(
  options: Readonly<{
    partBytes: number;
    measuredBytesPerSecond: number | null;
  }>,
): number {
  const bytesPerSecond = Math.max(
    options.measuredBytesPerSecond ?? FLOOR_BYTES_PER_SECOND,
    FLOOR_BYTES_PER_SECOND,
  );
  return Math.ceil(
    (options.partBytes / bytesPerSecond) * 1000 * LIFETIME_SAFETY_FACTOR +
      LIFETIME_MARGIN_MS,
  );
}

/**
 * How much of a presigned URL's life is left, judged on the browser's own
 * clock alone.
 *
 * The server signs every URL for `presignTtlSeconds` from the moment it
 * answers, so a URL received at `receivedAtMs` lives until that plus the TTL
 * (a little less, by the time the answer took to arrive, which the margin
 * `getRequiredLifetimeMsFromRate` adds absorbs). The server's own `expiresAt`
 * is deliberately not compared with this clock: a phone's clock minutes
 * fast would see every URL as already lapsed and re-presign before every
 * part.
 *
 * @param options.receivedAtMs When the presign answered, on this clock.
 * @param options.nowMs Now, on the same clock.
 * @returns Milliseconds, negative once the URL has lapsed.
 */
export function getRemainingLifetimeMsFromReceipt(
  options: Readonly<{
    receivedAtMs: number;
    nowMs: number;
    presignTtlSeconds?: number;
  }>,
): number {
  const { presignTtlSeconds = appConfig.upload.presignTtlSeconds } = options;
  return options.receivedAtMs + presignTtlSeconds * 1000 - options.nowMs;
}

/** Whether a fresh URL always outlives one part at the floor rate. */
export function isPartPlanFeasible(
  options: Readonly<{ partSizeBytes: number; presignTtlSeconds: number }> = {
    partSizeBytes: appConfig.upload.multipartPartSizeBytes,
    presignTtlSeconds: appConfig.upload.presignTtlSeconds,
  },
): boolean {
  const neededMs = getRequiredLifetimeMsFromRate({
    partBytes: options.partSizeBytes,
    measuredBytesPerSecond: null,
  });
  return neededMs < options.presignTtlSeconds * 1000;
}

/**
 * The longest one file's transfer waits, in all, for an offline browser to
 * come back: `appConfig.upload.offlineWaitCeilingMinutes`, well inside the
 * abandon grace, because nothing reaches the server while it waits.
 */
export const OFFLINE_WAIT_CEILING_MS =
  appConfig.upload.offlineWaitCeilingMinutes * 60_000;

/**
 * The longest one `429` is waited out for, whatever `retryAfterSeconds` says.
 * The upload routes count over a minute, so an honest answer is never longer.
 */
export const RATE_LIMIT_MAX_WAIT_MS = 60_000;

/**
 * The `429`s one file's transfer waits out before it gives up: ten, so ten
 * minutes at the very most. A `429` spends no try, because the server is
 * answering and asked only for a pause, so this is what keeps a server that
 * never stops refusing from holding a lane forever.
 */
export const RATE_LIMIT_MAX_WAITS = 10;

/**
 * The pause a `429` asks for: its `retryAfterSeconds`, never less than a
 * second and never more than `RATE_LIMIT_MAX_WAIT_MS`. A `429` with no figure
 * is waited out for the second.
 */
export function getRateLimitWaitMsFromRetryAfter(
  retryAfterSeconds: number | undefined,
): number {
  return Math.min(
    Math.max((retryAfterSeconds ?? 1) * 1000, 1000),
    RATE_LIMIT_MAX_WAIT_MS,
  );
}

/** The wait before try `attempt + 1`: doubling from the base, capped. */
export function getBackoffDelayMsFromAttempt(
  options: Readonly<{
    attempt: number;
    baseDelayMs: number;
    maxDelayMs: number;
  }>,
): number {
  return Math.min(
    options.baseDelayMs * 2 ** (options.attempt - 1),
    options.maxDelayMs,
  );
}
