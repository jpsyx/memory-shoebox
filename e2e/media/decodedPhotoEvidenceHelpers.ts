import { expect, type Page } from "@playwright/test";
import type { MediaAcceptanceCatalog } from "../support/createMediaAcceptanceCatalog/createMediaAcceptanceCatalog.ts";
import type { FakeS3LedgerSnapshot } from "../support/createFakeS3Server/createFakeS3Server.types.ts";

type NativeDecode = {
  image: WeakRef<HTMLImageElement>;
  url: string;
  objectId: string;
  startedAtMs: number;
  completedAtMs: number | undefined;
  failed: boolean;
  wasConnected: boolean;
};
type ObservedWindow = typeof window & { nativeDecodeEvidence: NativeDecode[] };

/**
 * Test-only read observation returns the original native decode promise
 * unchanged.
 */
export async function observeNativePhotoDecodes(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const entries: NativeDecode[] = [];
    (window as ObservedWindow).nativeDecodeEvidence = entries;
    const nativeDecode = HTMLImageElement.prototype.decode;
    HTMLImageElement.prototype.decode = function () {
      const url = this.currentSrc || this.src;
      const entry: NativeDecode = {
        image: new WeakRef(this),
        url,
        objectId: new URL(url, location.href).pathname
          .split("/")
          .slice(2)
          .join("/"),
        startedAtMs: performance.now(),
        completedAtMs: undefined,
        failed: false,
        wasConnected: this.isConnected,
      };
      entries.push(entry);
      const promise = Reflect.apply(nativeDecode, this, []);
      void promise.then(
        () => {
          entry.completedAtMs = performance.now();
        },
        () => {
          entry.failed = true;
          entry.completedAtMs = performance.now();
        },
      );
      return promise;
    };
  });
}

/**
 * Requires a live exact native image whose off-DOM decode actually completed.
 */
export async function getCompletedPhotoDecodeFromPage({
  page,
  objectIds,
}: Readonly<{ page: Page; objectIds: readonly string[] }>): Promise<
  | {
      objectId: string;
      startedAtMs: number;
      completedAtMs: number;
    }
  | undefined
> {
  return page.evaluate((ids) => {
    const match = (window as ObservedWindow).nativeDecodeEvidence.findLast(
      (entry) => {
        const image = entry.image.deref();
        return (
          ids.includes(entry.objectId) &&
          !entry.wasConnected &&
          !entry.failed &&
          entry.completedAtMs !== undefined &&
          image !== undefined &&
          image.naturalWidth > 0 &&
          image.naturalHeight > 0 &&
          (image.currentSrc || image.src) === entry.url
        );
      },
    );
    return match === undefined
      ? undefined
      : {
          objectId: match.objectId,
          startedAtMs: match.startedAtMs,
          completedAtMs: match.completedAtMs!,
        };
  }, objectIds);
}

/**
 * Tracks all page-owned API and media requests without persisting bearer URLs.
 */
export function observePendingMediaRequests(page: Page): () => number {
  const pending = new Set<import("@playwright/test").Request>();
  page.on("request", (request) => {
    if (["image", "media", "fetch", "xhr"].includes(request.resourceType())) {
      pending.add(request);
    }
  });
  const finished = (request: import("@playwright/test").Request) => {
    pending.delete(request);
  };
  page.on("requestfinished", finished);
  page.on("requestfailed", finished);
  return () => {
    return pending.size;
  };
}

async function _getPendingDecodes(page: Page): Promise<number> {
  return page.evaluate(() => {
    return (window as ObservedWindow).nativeDecodeEvidence.filter((entry) => {
      return entry.completedAtMs === undefined;
    }).length;
  });
}

/**
 * Drains known work, then requires another full dwell with unchanged counters.
 */
export async function getSettledMediaLedger(
  options: Readonly<{
    page: Page;
    catalog: MediaAcceptanceCatalog;
    pendingRequests: () => number;
  }>,
): Promise<FakeS3LedgerSnapshot> {
  const { page, catalog, pendingRequests } = options;
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    await expect
      .poll(
        async () => {
          return {
            browser: pendingRequests(),
            bucket: catalog.getLedger().activeRequests,
            decode: await _getPendingDecodes(page),
          };
        },
        { timeout: Math.max(1, deadline - Date.now()) },
      )
      .toEqual({ browser: 0, bucket: 0, decode: 0 });
    const before = catalog.getLedger();
    await page.waitForTimeout(300);
    const after = catalog.getLedger();
    if (
      before.sequence === after.sequence &&
      before.bodyBytes === after.bodyBytes &&
      after.activeRequests === 0 &&
      pendingRequests() === 0 &&
      (await _getPendingDecodes(page)) === 0
    ) {
      return after;
    }
  }
  throw new Error("Media producers did not reach a full-dwell quiet boundary");
}
