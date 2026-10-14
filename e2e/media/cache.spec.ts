import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import type { Page } from "@playwright/test";
import { test, expect } from "./media.fixtures.ts";
import {
  measureMediaNavigation,
  expectCurrentPhotoDecoded,
} from "./measurements.ts";
import type { MediaAcceptanceCatalog } from "../support/createMediaAcceptanceCatalog.ts";

const ARTIFACT_PATH: string = "tmp/media-loading/baseline.json";

async function _writeBaseline(
  measurement: Record<string, unknown>,
): Promise<void> {
  await mkdir("tmp/media-loading", { recursive: true });
  await writeFile("tmp/media-loading/.gitignore", "*\n");
  let previous: { runs: Array<Record<string, unknown>> } = { runs: [] };
  try {
    previous = JSON.parse(
      await readFile(ARTIFACT_PATH, "utf8"),
    ) as typeof previous;
  } catch (failure) {
    if (
      !(
        failure instanceof Error &&
        "code" in failure &&
        failure.code === "ENOENT"
      )
    ) {
      throw failure;
    }
  }
  await writeFile(
    ARTIFACT_PATH,
    `${JSON.stringify({ ...previous, runs: [...previous.runs, measurement] }, null, 2)}\n`,
  );
}

async function _waitForSigningTick(page: Page): Promise<void> {
  const source = await page
    .locator('[data-photo-surface="viewer"] img')
    .getAttribute("src");
  const stamp = new URL(source!).searchParams.get("X-Amz-Date")!;
  const signedAt = Date.parse(
    `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T${stamp.slice(9, 11)}:${stamp.slice(11, 13)}:${stamp.slice(13, 15)}Z`,
  );
  await page.waitForFunction((instant) => {
    return Date.now() >= instant + 1100;
  }, signedAt);
}

async function _measureReload(options: {
  page: Page;
  catalog: MediaAcceptanceCatalog;
  isHard: boolean;
}): Promise<{
  elapsedMs: number;
  transfers: ReturnType<MediaAcceptanceCatalog["getTransfers"]>;
}> {
  const { page, catalog, isHard } = options;
  await _waitForSigningTick(page);
  const transferOffset = catalog.getTransfers().length;
  const started = performance.now();
  if (isHard) {
    const session = await page.context().newCDPSession(page);
    const navigation = page.waitForEvent("domcontentloaded");
    await session.send("Page.reload", { ignoreCache: true });
    await navigation;
    await session.detach();
  } else {
    await page.reload();
  }
  await expectCurrentPhotoDecoded(page);
  return {
    elapsedMs: performance.now() - started,
    transfers: catalog.getTransfers().slice(transferOffset),
  };
}

async function _measureFreshCache(options: {
  page: Page;
  catalog: MediaAcceptanceCatalog;
}): Promise<Record<string, unknown>> {
  const { page, catalog } = options;
  const context = await page
    .context()
    .browser()!
    .newContext({ baseURL: catalog.origin });
  const transferOffset = catalog.getTransfers().length;
  const started = performance.now();
  try {
    await context.addCookies(await page.context().cookies());
    const freshPage = await context.newPage();
    await freshPage.goto("/items/10000000-0000-4000-8000-000000000001");
    await expectCurrentPhotoDecoded(freshPage);
    return {
      elapsedMs: performance.now() - started,
      transfers: catalog.getTransfers().slice(transferOffset),
    };
  } finally {
    await context.close();
  }
}

function _watchTimelineResponses(page: Page): {
  responses: Array<{ days: number; items: number }>;
  stop: () => void;
} {
  const responses: Array<{ days: number; items: number }> = [];
  const onResponse = async (
    response: import("@playwright/test").Response,
  ): Promise<void> => {
    if (new URL(response.url()).pathname === "/api/timeline" && response.ok()) {
      const body = (await response.json()) as {
        days: Array<{ items: unknown[] }>;
      };
      responses.push({
        days: body.days.length,
        items: body.days.reduce((total, day) => {
          return total + day.items.length;
        }, 0),
      });
    }
  };
  page.on("response", onResponse);
  return {
    responses,
    stop: () => {
      page.off("response", onResponse);
    },
  };
}

async function _measureTimeline(options: {
  page: Page;
  catalog: MediaAcceptanceCatalog;
}): Promise<Record<string, unknown>> {
  const { page, catalog } = options;
  const { responses, stop } = _watchTimelineResponses(page);
  const transferOffset = catalog.getTransfers().length;
  const started = performance.now();
  await page.goto("/");
  await expect(page.locator('[id="day-2026-10-13"]')).toBeAttached();
  await expect(page.locator("[data-item-id], [data-burst-id]")).toHaveCount(
    992,
  );
  const firstDayMs = performance.now() - started;
  const firstDayNodes = await page.locator("img,video,canvas").count();
  await Array.from({ length: 6 }).reduce(async (prior) => {
    await prior;
    const dayCount = await page.locator('[id^="day-"]').count();
    await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
    });
    await expect
      .poll(() => {
        return page.locator('[id^="day-"]').count();
      })
      .toBeGreaterThan(dayCount);
  }, Promise.resolve());
  stop();
  return {
    firstDayMs,
    firstDayNodes,
    loadedDayCount: await page.locator('[id^="day-"]').count(),
    mediaNodesAfterScroll: await page.locator("img,video,canvas").count(),
    timelineResponses: responses,
    transfers: catalog.getTransfers().slice(transferOffset),
  };
}

test("reuses signed media on ordinary reload while recording cache, range and navigation evidence", async ({
  page,
  catalog,
  browserName,
}) => {
  await page.goto("/api/media-evidence/session");
  const count = await catalog.database
    .selectFrom("items")
    .select((expression) => {
      return expression.fn.countAll<number>().as("total");
    })
    .executeTakeFirstOrThrow();
  expect(count.total).toBe(5000);
  const day = await catalog.database
    .selectFrom("items")
    .select((expression) => {
      return expression.fn.countAll<number>().as("total");
    })
    .where("captured_on", "=", "2026-10-13")
    .executeTakeFirstOrThrow();
  expect(day.total).toBe(1000);
  const navigation = await measureMediaNavigation(page);
  expect(navigation.navigationMs).toHaveLength(30);
  expect(navigation.firstImageMs).toBeGreaterThan(0);
  expect(navigation.videoStartupMs).toBeGreaterThan(0);
  expect(navigation.maxMediaNodes).toBeGreaterThan(0);
  const navigationTransfers = catalog.getTransfers();
  const longTasksApiSupported = await page.evaluate(() => {
    return PerformanceObserver.supportedEntryTypes.includes("longtask");
  });
  expect(
    navigationTransfers.some((transfer) => {
      return (
        transfer.objectId.includes("/video_") &&
        [200, 206].includes(transfer.status)
      );
    }),
  ).toBe(true);
  const displaySource = await page
    .locator("video source")
    .first()
    .getAttribute("src");
  expect(new URL(displaySource!).origin).not.toBe(catalog.origin);
  expect(new URL(displaySource!).searchParams.has("X-Amz-Signature")).toBe(
    true,
  );
  await page.goto(`/items/${catalog.itemIds[1]}`);
  await expectCurrentPhotoDecoded(page);
  const ordinaryReload = await _measureReload({ page, catalog, isHard: false });
  const reloadBodyBytes = ordinaryReload.transfers.reduce((total, transfer) => {
    return total + transfer.bodyBytes;
  }, 0);
  const hardReload =
    browserName === "chromium"
      ? await _measureReload({ page, catalog, isHard: true })
      : {
          status: "unverified",
          reason: "Playwright has no portable WebKit hard-reload API",
        };
  const freshCacheRevisit =
    browserName === "webkit"
      ? await _measureFreshCache({ page, catalog })
      : undefined;
  const timeline = await _measureTimeline({ page, catalog });
  await _writeBaseline({
    recordedAt: new Date().toISOString(),
    revision: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    browserName,
    bucketTransport: { latencyMs: 25, bytesPerSecond: 1048576 },
    fixture: {
      items: 5000,
      largestDay: 1000,
      repeatedTransitions: 30,
      burstBoundaries: 2,
      videoSeconds: 10,
      photoFixtures: [
        { width: 400, height: 267, bodyBytes: 3809 },
        { width: 1600, height: 1067, bodyBytes: 21746 },
      ],
    },
    navigation,
    longTasksApiSupported,
    navigationTransfers,
    ordinaryReload,
    hardReload,
    freshCacheRevisit,
    timeline,
    limitations: [
      "Loopback measurements do not reproduce B2 latency or throughput",
      "Body bytes exclude response headers and count socket payloads queued before disconnect",
      ...(browserName === "webkit"
        ? ["Long Tasks API and genuine hard reload are unverified in WebKit"]
        : []),
    ],
  });
  expect(reloadBodyBytes).toBe(0);
});
