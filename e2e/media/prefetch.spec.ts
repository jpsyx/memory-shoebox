import { getSelectionTransfersFromLedger } from "../support/createFakeS3Server/getSelectionTransfersFromLedger.ts";
import { insertRemovalRequest } from "../../apps/server/test/helpers/seedHelpers/miscSeedHelpers.ts";
import {
  insertPerson,
  insertItemPerson,
} from "../../apps/server/test/helpers/seedHelpers/archiveSeedHelpers.ts";
import type { Locator } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { insertVisibilityRule } from "../../apps/server/test/helpers/seedHelpers/visibilitySeedHelpers.ts";
import type { MediaPreview, MediaSource } from "@memory-shoebox/shared";
import { test, expect } from "./media.fixtures.ts";
import { expectCurrentPhotoDecoded } from "./measurements.ts";
import {
  observeNativePhotoDecodes,
  getCompletedPhotoDecodeFromPage,
  observePendingMediaRequests,
  getSettledMediaLedger,
} from "./decodedPhotoEvidence.ts";

test("native image warming is reused by the normal viewer without a second media body", async ({
  page,
  catalog,
}) => {
  await page.goto("/api/media-evidence/session");
  const itemId = catalog.itemIds[1011]!;
  const offset = catalog.getTransfers().length;
  const source = await page.evaluate(async (id): Promise<MediaSource> => {
    const response = await fetch("/api/media/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ itemIds: [id], purpose: "speculative-preview" }),
    });
    if (!response.ok) {
      throw new Error(`Preview failed: ${response.status}`);
    }
    const { items } = (await response.json()) as { items: MediaPreview[] };
    const display = items[0]!.media.display!;
    const harnessUrl = "/api/media-evidence/image-loader.js";
    const { loadSpeculativeMedia } = await import(harnessUrl);
    const warmed = await loadSpeculativeMedia(
      { itemId: id, source: display, kind: "photo", rank: 0, decode: true },
      new AbortController().signal,
    );
    warmed.release();
    return display;
  }, itemId);
  expect(new URL(source.url).origin).not.toBe(catalog.origin);
  expect(new URL(source.url).searchParams.has("X-Amz-Signature")).toBe(true);
  const warmTransfers = catalog
    .getTransfers()
    .slice(offset)
    .filter((transfer) => {
      return transfer.objectId.includes(itemId);
    });
  expect(warmTransfers).toHaveLength(1);
  expect(warmTransfers[0]!.bodyBytes).toBe(21746);
  const displayOffset = catalog.getTransfers().length;
  await page.goto(`/items/${itemId}`);
  await expectCurrentPhotoDecoded(page);
  await expect(
    page.locator('[data-photo-surface="viewer"] img'),
  ).toHaveAttribute("src", source.url);
  const displayTransfers = catalog
    .getTransfers()
    .slice(displayOffset)
    .filter((transfer) => {
      return transfer.objectId.endsWith(`/${itemId}/display`);
    });
  expect(
    displayTransfers.reduce((bytes, transfer) => {
      return bytes + transfer.bodyBytes;
    }, 0),
  ).toBe(0);
  const allDisplayTransfers = catalog
    .getTransfers()
    .slice(offset)
    .filter((transfer) => {
      return transfer.objectId.endsWith(`/${itemId}/display`);
    });
  expect(
    allDisplayTransfers.reduce((bytes, transfer) => {
      return bytes + transfer.bodyBytes;
    }, 0),
  ).toBe(21746);
});

test("an aborted native image settles only after its unavoidable transfer", async ({
  page,
  catalog,
}) => {
  await page.goto("/api/media-evidence/session");
  const itemId = catalog.itemIds[1013]!;
  const offset = catalog.getTransfers().length;
  const failureName = await page.evaluate(async (id) => {
    const response = await fetch("/api/media/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ itemIds: [id], purpose: "speculative-preview" }),
    });
    const { items } = (await response.json()) as { items: MediaPreview[] };
    const harnessUrl = "/api/media-evidence/image-loader.js";
    const { loadSpeculativeMedia } = await import(harnessUrl);
    const controller = new AbortController();
    const pending = loadSpeculativeMedia(
      {
        itemId: id,
        source: items[0]!.media.display!,
        kind: "photo",
        rank: 0,
        decode: true,
      },
      controller.signal,
    );
    controller.abort();
    try {
      await pending;
      return "unexpected-success";
    } catch (failure) {
      return failure instanceof Error ? failure.name : "unknown";
    }
  }, itemId);
  expect(failureName).toBe("AbortError");
  const transfers = catalog
    .getTransfers()
    .slice(offset)
    .filter((transfer) => {
      return transfer.objectId.endsWith(`/${itemId}/display`);
    });
  expect(transfers).toHaveLength(1);
  expect(transfers[0]!.bodyBytes).toBe(21746);
});

[1, 2].forEach((deviceScaleFactor) => {
  test.describe(`actual viewer DPR ${deviceScaleFactor}`, () => {
    test.use({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor,
      responsivePhotos: true,
    });
    test("warms the selected mobile candidate and reuses its bytes through reversal", async ({
      page,
      catalog,
    }) => {
      await page.goto("/api/media-evidence/session");
      const start = catalog.itemIds[1010]!;
      const target = catalog.itemIds[1011]!;
      const purpose = deviceScaleFactor === 1 ? "thumb" : "display";
      const detailReads: string[] = [];
      page.on("request", (request) => {
        if (/\/api\/items\/[^/]+$/.test(request.url())) {
          detailReads.push(new URL(request.url()).pathname);
        }
      });
      await page.goto(`/items/${start}`);
      await expectCurrentPhotoDecoded(page);
      await expect
        .poll(() => {
          return catalog.getTransfers().filter((transfer) => {
            return (
              transfer.objectId.endsWith(`/${target}/${purpose}`) &&
              transfer.bodyBytes > 0
            );
          }).length;
        })
        .toBe(1);
      expect(detailReads).toEqual([`/api/items/${start}`]);
      const offset = catalog.getTransfers().length;
      await page
        .getByRole("button", { name: "Next photo or video", exact: true })
        .click();
      await expect(page).toHaveURL(new RegExp(`/items/${target}$`));
      await expectCurrentPhotoDecoded(page);
      const selected = page.locator(
        '[data-photo-surface="viewer"] picture img',
      );
      const currentSrc = await selected.evaluate((image: HTMLImageElement) => {
        return image.currentSrc;
      });
      expect(new URL(currentSrc).pathname).toContain(`/${target}/${purpose}`);
      expect(
        catalog
          .getTransfers()
          .slice(offset)
          .filter((transfer) => {
            return transfer.objectId.endsWith(`/${target}/${purpose}`);
          })
          .reduce((bytes, transfer) => {
            return bytes + transfer.bodyBytes;
          }, 0),
      ).toBe(0);
      expect(detailReads).toEqual([
        `/api/items/${start}`,
        `/api/items/${target}`,
      ]);
      await page.keyboard.press("ArrowLeft");
      await expect(page).toHaveURL(new RegExp(`/items/${start}$`));
      await expectCurrentPhotoDecoded(page);
      await page.keyboard.press("ArrowRight");
      await expect(page).toHaveURL(new RegExp(`/items/${target}$`));
      await expectCurrentPhotoDecoded(page);
      expect(
        catalog.getTransfers().filter((transfer) => {
          return (
            transfer.objectId.endsWith(`/${target}/${purpose}`) &&
            transfer.bodyBytes > 0
          );
        }),
      ).toHaveLength(1);
    });
    test("fits an uncropped portrait and consumes the warmed portrait source", async ({
      page,
      catalog,
    }, testInfo) => {
      await page.goto("/api/media-evidence/session");
      await page.goto(`/items/${catalog.itemIds[1014]!}`);
      await expectCurrentPhotoDecoded(page);
      const target = catalog.itemIds[1015]!;
      await expect
        .poll(() => {
          return catalog.getTransfers().filter((transfer) => {
            return (
              transfer.objectId.endsWith(`/${target}/display`) &&
              transfer.bodyBytes > 0
            );
          }).length;
        })
        .toBe(1);
      const offset = catalog.getTransfers().length;
      await page.keyboard.press("ArrowRight");
      await expect(page).toHaveURL(new RegExp(`/items/${target}$`));
      await expectCurrentPhotoDecoded(page);
      const image = page.locator('[data-photo-surface="viewer"] picture img');
      const pixels = await image.evaluate((element: HTMLImageElement) => {
        return {
          currentSrc: element.currentSrc,
          width: element.naturalWidth,
          height: element.naturalHeight,
          fit: getComputedStyle(element).objectFit,
        };
      });
      await page.screenshot({
        path: testInfo.outputPath("portrait-decoded.png"),
        fullPage: true,
      });
      expect(pixels.width / pixels.height).toBeCloseTo(1067 / 1600, 2);
      expect(pixels.fit).toBe("contain");
      expect(new URL(pixels.currentSrc).pathname).toContain(
        `/${target}/display`,
      );
      expect(
        catalog
          .getTransfers()
          .slice(offset)
          .filter((transfer) => {
            return transfer.objectId.endsWith(`/${target}/display`);
          })
          .reduce((bytes, transfer) => {
            return bytes + transfer.bodyBytes;
          }, 0),
      ).toBe(0);
    });
  });
});

test("walks burst edges and mixed media without speculating video bytes", async ({
  page,
  catalog,
}) => {
  await page.goto("/api/media-evidence/session");
  await page.goto(`/items/${catalog.itemIds[2]!}`);
  await expectCurrentPhotoDecoded(page);
  await Array.from({ length: 6 }).reduce(async (previous, _unused, index) => {
    await previous;
    await page.keyboard.press("ArrowRight");
    await expect(page).toHaveURL(
      new RegExp(`/items/${catalog.itemIds[index + 3]!}$`),
    );
    await expectCurrentPhotoDecoded(page);
  }, Promise.resolve());
  await page.goto(`/items/${catalog.itemIds[30]!}`);
  await expectCurrentPhotoDecoded(page);
  const videoId = catalog.itemIds[31]!;
  await expect
    .poll(() => {
      return catalog.getTransfers().filter((transfer) => {
        return (
          transfer.objectId.endsWith(`/${videoId}/poster`) &&
          transfer.bodyBytes > 0
        );
      }).length;
    })
    .toBe(1);
  expect(
    catalog.getTransfers().filter((transfer) => {
      return (
        transfer.objectId.includes(videoId) &&
        /\/(original|video_mp4|video_webm)$/.test(transfer.objectId)
      );
    }),
  ).toHaveLength(0);
  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(new RegExp(`/items/${videoId}$`));
  const video = page.locator("video");
  await expect(video).toBeVisible();
  await page.getByRole("button", { name: "Play video", exact: true }).click();
  await expect
    .poll(() => {
      return video.evaluate((element: HTMLVideoElement) => {
        return element.readyState >= 2;
      });
    })
    .toBe(true);
  await video.evaluate((element: HTMLVideoElement) => {
    return element.pause();
  });
  const target = catalog.itemIds[32]!;
  await expect
    .poll(() => {
      return catalog.getTransfers().filter((transfer) => {
        return transfer.objectId.includes(target) && transfer.bodyBytes > 0;
      }).length;
    })
    .toBeGreaterThan(0);
  expect(
    catalog.getTransfers().filter((transfer) => {
      return transfer.objectId.endsWith(`/${videoId}/original`);
    }),
  ).toHaveLength(0);
  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(new RegExp(`/items/${videoId}$`));
  await page
    .getByRole("button", { name: "Next photo or video", exact: true })
    .focus();
  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(new RegExp(`/items/${target}$`));
  await expectCurrentPhotoDecoded(page);
});

test.describe("direct video candidate boundary", () => {
  test.use({
    viewport: { width: 450, height: 844 },
    deviceScaleFactor: 1,
    responsivePhotos: true,
  });
  test("promotes and consumes the exact photo candidate warmed from a directly opened video", async ({
    page,
    catalog,
  }) => {
    await page.goto("/api/media-evidence/session");
    const videoId = catalog.itemIds[31]!;
    const target = catalog.itemIds[32]!;
    await page.goto(`/items/${videoId}`);
    const video = page.locator("video");
    await expect(video).toBeVisible();
    await page.getByRole("button", { name: "Play video", exact: true }).click();
    await expect
      .poll(() => {
        return video.evaluate((element: HTMLVideoElement) => {
          return element.readyState >= 2;
        });
      })
      .toBe(true);
    await video.evaluate((element: HTMLVideoElement) => {
      element.pause();
    });
    await expect
      .poll(() => {
        return catalog.getTransfers().filter((transfer) => {
          return (
            transfer.objectId.endsWith(`/${target}/thumb`) &&
            transfer.bodyBytes > 0
          );
        }).length;
      })
      .toBe(1);
    expect(
      catalog.getTransfers().filter((transfer) => {
        return transfer.objectId.endsWith(`/${target}/display`);
      }),
    ).toHaveLength(0);
    const offset = catalog.getTransfers().length;
    await page
      .getByRole("button", { name: "Next photo or video", exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`/items/${target}$`));
    await expectCurrentPhotoDecoded(page);
    const currentSrc = await page
      .locator('[data-photo-surface="viewer"] picture img')
      .evaluate((image: HTMLImageElement) => {
        return image.currentSrc;
      });
    expect(new URL(currentSrc).pathname).toContain(`/${target}/thumb`);
    expect(
      catalog
        .getTransfers()
        .slice(offset)
        .filter((transfer) => {
          return transfer.objectId.includes(target);
        })
        .reduce((total, transfer) => {
          return total + transfer.bodyBytes;
        }, 0),
    ).toBe(0);
  });
});

test("a warmed photo is hidden when the actual selection loses visibility", async ({
  page,
  catalog,
}) => {
  const start = catalog.itemIds[1010]!;
  const target = catalog.itemIds[1011]!;
  const otherMember = await catalog.database
    .selectFrom("members")
    .select("id")
    .where("id", "!=", catalog.memberId)
    .executeTakeFirstOrThrow();
  await catalog.database
    .updateTable("members")
    .set({ role: "viewer" })
    .where("id", "=", catalog.memberId)
    .execute();
  await page.goto("/api/media-evidence/session");
  await page.goto(`/items/${start}`);
  await expectCurrentPhotoDecoded(page);
  await expect
    .poll(() => {
      return catalog.getTransfers().filter((transfer) => {
        return (
          transfer.objectId.endsWith(`/${target}/display`) &&
          transfer.bodyBytes > 0
        );
      }).length;
    })
    .toBe(1);
  const ruleId = await insertVisibilityRule(catalog.database, { mode: "only" });
  await catalog.database
    .updateTable("items")
    .set({ uploaded_by: otherMember.id, visibility_rule_id: ruleId })
    .where("id", "=", target)
    .execute();
  const selectionResponse = page.waitForResponse((response) => {
    return new URL(response.url()).pathname === `/api/items/${target}`;
  });
  await page
    .getByRole("button", { name: "Next photo or video", exact: true })
    .click();
  expect((await selectionResponse).status()).toBe(404);
  await expect(
    page.getByText("This one is not here.", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(`[data-photo-item="${target}"]`)).toHaveCount(0);
  const opened = await catalog.database
    .selectFrom("item_views")
    .select("open_count")
    .where("member_id", "=", catalog.memberId)
    .where("item_id", "=", target)
    .execute();
  expect(opened).toEqual([]);
});

for (const mode of ["alternating", "forward"] as const) {
  test(
    mode === "alternating"
      ? "thirty alternating warm-cache transitions reuse display bodies and count only actual opens"
      : "thirty distinct forward selections consume no new prefetched photo bodies and count only actual opens",
    async ({ page, catalog, browserName }, testInfo) => {
      await observeNativePhotoDecodes(page);
      const pendingRequests = observePendingMediaRequests(page);
      const firstId = catalog.itemIds[1010]!;
      const secondId = catalog.itemIds[1011]!;
      await page.goto("/api/media-evidence/session");
      const apiRequests: Array<{
        method: string;
        path: string;
        body: unknown;
      }> = [];
      page.on("request", (request) => {
        const url = new URL(request.url());
        if (url.origin === catalog.origin && url.pathname.startsWith("/api/"))
          apiRequests.push({
            method: request.method(),
            path: url.pathname,
            body: request.postDataJSON(),
          });
      });
      await page.goto(`/items/${firstId}`);
      await expectCurrentPhotoDecoded(page);
      const transitions: Array<{
        milliseconds: number;
        bodyBytes: number;
        itemId: string;
        requestStartWatermark: number;
        sequenceAtSelection: number;
        activeRequestIds: number[];
        nativeDecode: Awaited<
          ReturnType<typeof getCompletedPhotoDecodeFromPage>
        >;
        preconditionWaitMs: number;
        actualDwellMs: number;
      }> = [];
      for (let index = 0; index < 30; index += 1) {
        const target =
          mode === "forward"
            ? catalog.itemIds[1011 + index]!
            : index % 2 === 0
              ? secondId
              : firstId;
        // This separate scenario grants the product its specified 250 ms dwell.
        const dwellStarted = performance.now();
        await page.waitForTimeout(300);
        const afterDwell = performance.now();
        await expect
          .poll(() => {
            return catalog.getTransfers().filter((transfer) => {
              return (
                transfer.objectId.endsWith(`/${target}/display`) &&
                transfer.bodyBytes > 0
              );
            }).length;
          })
          .toBe(1);
        const objectIds = catalog.getObjectIdsForItem(target);
        let nativeDecode: Awaited<
          ReturnType<typeof getCompletedPhotoDecodeFromPage>
        >;
        if (mode === "forward" || index === 0) {
          await expect
            .poll(async () => {
              nativeDecode = await getCompletedPhotoDecodeFromPage(
                page,
                objectIds,
              );
              return nativeDecode !== undefined;
            })
            .toBe(true);
        }
        const preconditionWaitMs = performance.now() - afterDwell;
        const beforeSelection = catalog.getLedger();
        const started = performance.now();
        await page
          .getByRole("button", {
            name: `${mode === "forward" || index % 2 === 0 ? "Next" : "Previous"} photo or video`,
            exact: true,
          })
          .click();
        await expect(page).toHaveURL(new RegExp(`/items/${target}$`));
        await expectCurrentPhotoDecoded(page);
        const milliseconds = performance.now() - started;
        transitions.push({
          milliseconds,
          bodyBytes: 0,
          requestStartWatermark: beforeSelection.nextRequestId,
          sequenceAtSelection: beforeSelection.sequence,
          activeRequestIds: beforeSelection.requests
            .filter((request) => {
              return (
                objectIds.includes(request.objectId) &&
                request.terminal === null
              );
            })
            .map((request) => {
              return request.requestId;
            }),
          nativeDecode,
          preconditionWaitMs,
          actualDwellMs: started - dwellStarted,
          itemId: target,
        });
      }
      const opened = await catalog.database
        .selectFrom("item_views")
        .select(({ fn }) => {
          return fn.sum<number>("open_count").as("total");
        })
        .where("member_id", "=", catalog.memberId)
        .executeTakeFirstOrThrow();
      const openDelta = Number(opened.total ?? 0);
      const actualSelections = 31;
      expect(openDelta).toBe(actualSelections);
      await page.waitForTimeout(300);
      const inAppLedger = await getSettledMediaLedger({
        page,
        catalog,
        pendingRequests,
      });
      await page.close();
      await expect
        .poll(() => {
          return catalog.getLedger().activeRequests;
        })
        .toBe(0);
      const finalLedger = catalog.getLedger();
      const attributedTransitions = transitions.map((transition, index) => {
        const nextSelectionWatermark =
          transitions[index + 1]?.requestStartWatermark ??
          finalLedger.nextRequestId;
        return {
          ...transition,
          nextSelectionWatermark,
          ...getSelectionTransfersFromLedger({
            ...transition,
            ledger: finalLedger,
            objectIds: catalog.getObjectIdsForItem(transition.itemId),
            nextSelectionWatermark,
          }),
        };
      });
      const transfers = catalog.getTransfers();
      const speculativeOriginalVideoBytes = transfers
        .filter((transfer) => {
          return /\/(original|video_mp4|video_webm)$/.test(transfer.objectId);
        })
        .reduce((total, transfer) => {
          return total + transfer.bodyBytes;
        }, 0);
      expect(speculativeOriginalVideoBytes).toBe(0);
      const selectedIds = new Set([
        firstId,
        ...transitions.map((transition) => {
          return transition.itemId;
        }),
      ]);
      expect(selectedIds.size).toBe(mode === "forward" ? 31 : 2);
      const consumedPhotoBytes = transfers
        .filter((transfer) => {
          return [...selectedIds].some((id) => {
            return transfer.objectId.endsWith(`/${id}/display`);
          });
        })
        .reduce((total, transfer) => {
          return total + transfer.bodyBytes;
        }, 0);
      const coldSelectedPhotoBytes = transfers
        .filter((transfer) => {
          return transfer.objectId.endsWith(`/${firstId}/display`);
        })
        .reduce((total, transfer) => {
          return total + transfer.bodyBytes;
        }, 0);
      const consumedPrefetchPhotoBytes =
        consumedPhotoBytes - coldSelectedPhotoBytes;
      expect(consumedPrefetchPhotoBytes).toBeGreaterThan(0);
      const unconsumedPhotoBytes = transfers
        .filter((transfer) => {
          return (
            transfer.objectId.endsWith("/display") &&
            ![...selectedIds].some((id) => {
              return transfer.objectId.includes(id);
            })
          );
        })
        .reduce((total, transfer) => {
          return total + transfer.bodyBytes;
        }, 0);
      await writeFile(
        testInfo.outputPath(
          mode === "forward" ? "forward-dwell-warm.json" : "dwell-warm.json",
        ),
        JSON.stringify(
          {
            browserName,
            mode,
            uniqueSelectedPhotos: selectedIds.size,
            dwellMs: 300,
            transitions: attributedTransitions,
            protocol:
              "completed-native-forward-and-first-alternating-handoff; bounded-start-windows-and-final-drained-all-representations",
            inAppLedger,
            finalLedger,
            cleanupBodyBytes: finalLedger.bodyBytes - inAppLedger.bodyBytes,
            finalItemThumbnailRequests: finalLedger.requests.filter(
              (request) => {
                return request.objectId.endsWith(
                  `/${transitions.at(-1)!.itemId}/thumb`,
                );
              },
            ),
            openDelta,
            actualSelections,
            speculativeOriginalVideoBytes,
            coldSelectedPhotoBytes,
            consumedPrefetchPhotoBytes,
            consumedPhotoBytes,
            unconsumedPhotoBytes,
            apiRequests,
            transfers,
          },
          null,
          2,
        ),
      );
      attributedTransitions.forEach((transition, index) => {
        expect(transition.displayBodyBytes).toBe(0);
        if (mode === "forward" || index === 0) {
          expect(transition.nativeDecode).toBeDefined();
          expect(
            transition.bodyBytes,
            `all selected representations of ${transition.itemId}`,
          ).toBe(0);
        }
        expect(transition.activeBodyBytesAfterSelection).toBe(0);
      });
      expect(finalLedger.activeRequests).toBe(0);
      expect(finalLedger.bodyBytes).toBe(
        transfers.reduce((total, transfer) => {
          return total + transfer.bodyBytes;
        }, 0),
      );
    },
  );
}

test("selected optimized video loads metadata without playing or reading its original, then records uninterrupted playback", async ({
  page,
  catalog,
  browserName,
}, testInfo) => {
  const itemId = catalog.itemIds[31]!;
  await page.goto("/api/media-evidence/session");
  await page.goto(`/items/${itemId}`);
  const video = page.locator("video");
  await expect(video).toHaveAttribute("preload", "metadata");
  await expect
    .poll(() => {
      return video.evaluate((element: HTMLVideoElement) => {
        return element.readyState;
      });
    })
    .toBeGreaterThanOrEqual(1);
  expect(
    await video.evaluate((element: HTMLVideoElement) => {
      return {
        paused: element.paused,
        time: element.currentTime,
      };
    }),
  ).toEqual({ paused: true, time: 0 });
  const metadataTransfers = [...catalog.getTransfers()];
  await video.evaluate((element: HTMLVideoElement) => {
    element.muted = true;
    element.dataset.waitingEvents = "0";
    element.addEventListener("waiting", () => {
      if (element.currentTime > 0)
        element.dataset.waitingEvents = String(
          Number(element.dataset.waitingEvents) + 1,
        );
    });
  });
  const started = performance.now();
  await page.getByRole("button", { name: "Play video", exact: true }).click();
  await expect
    .poll(() => {
      return video.evaluate((element: HTMLVideoElement) => {
        return !element.paused && element.currentTime > 0;
      });
    })
    .toBe(true);
  const startupMs = performance.now() - started;
  await expect
    .poll(
      () => {
        return video.evaluate((element: HTMLVideoElement) => {
          return element.ended;
        });
      },
      {
        timeout: 20000,
      },
    )
    .toBe(true);
  const rebufferEvents = await video.evaluate((element: HTMLVideoElement) => {
    return Number(element.dataset.waitingEvents);
  });
  expect(rebufferEvents).toBe(0);
  const originalBytes = catalog
    .getTransfers()
    .filter((transfer) => {
      return transfer.objectId.endsWith(`/${itemId}/original`);
    })
    .reduce((total, transfer) => {
      return total + transfer.bodyBytes;
    }, 0);
  expect(originalBytes).toBe(0);
  const opened = await catalog.database
    .selectFrom("item_views")
    .select("open_count")
    .where("member_id", "=", catalog.memberId)
    .where("item_id", "=", itemId)
    .executeTakeFirstOrThrow();
  expect(opened.open_count).toBe(1);
  await writeFile(
    testInfo.outputPath("video-playback.json"),
    JSON.stringify(
      {
        browserName,
        startupMs,
        rebufferEvents,
        originalBytes,
        openCount: opened.open_count,
        metadataTransfers,
        transfers: catalog.getTransfers(),
        speculativeVideoMetadataEnabled: false,
      },
      null,
      2,
    ),
  );
});

test("every internal viewer entry preserves SPA navigation and exactly one actual open", async ({
  page,
  catalog,
}) => {
  let actualSelections = 0;
  let documentRequests = 0;
  const openCount = async () => {
    const row = await catalog.database
      .selectFrom("item_views")
      .select(({ fn }) => {
        return fn.sum<number>("open_count").as("total");
      })
      .where("member_id", "=", catalog.memberId)
      .executeTakeFirstOrThrow();
    return Number(row.total ?? 0);
  };
  page.on("request", (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame())
      documentRequests += 1;
  });
  const select = async (control: Locator, itemId: string) => {
    await control.scrollIntoViewIfNeeded();
    await control.hover();
    expect(await openCount()).toBe(actualSelections);
    documentRequests = 0;
    await control.click();
    await expect(page).toHaveURL(new RegExp(`/items/${itemId}$`));
    await expectCurrentPhotoDecoded(page);
    actualSelections += 1;
    await expect.poll(openCount).toBe(actualSelections);
    expect(documentRequests).toBe(0);
  };
  await page.goto("/api/media-evidence/session");
  const print = page.locator("button[data-item-id]").first();
  await select(print, (await print.getAttribute("data-item-id"))!);
  await page.goto("/");
  await page.locator("[data-burst-id] button").first().click();
  const frame = page.locator("[data-fan-row] button[data-item-id]").first();
  const frameId = (await frame.getAttribute("data-item-id"))!;
  await select(frame, frameId);
  const siblingId = catalog.itemIds[catalog.itemIds.indexOf(frameId) + 1]!;
  await select(page.locator(`nav a[href="/items/${siblingId}"]`), siblingId);
  const followingId = catalog.itemIds[catalog.itemIds.indexOf(siblingId) + 1]!;
  await select(
    page.getByRole("button", { name: "Next photo or video", exact: true }),
    followingId,
  );
  await select(
    page.getByRole("button", { name: "Previous photo or video", exact: true }),
    siblingId,
  );
  await page
    .getByRole("button", { name: "More photo details", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Who opened this", exact: true })
    .click();
  await expect(
    page.getByRole("img", {
      name: `Measurement memory ${catalog.itemIds.indexOf(siblingId) + 1}`,
      exact: true,
    }),
  ).toBeVisible();
  await select(
    page.getByRole("link", { name: "Open this item", exact: true }),
    siblingId,
  );
  const coldId = catalog.itemIds[1015]!;
  await page.goto(`/presence?itemId=${coldId}`);
  await expect(
    page.getByRole("img", { name: "Measurement memory 1016", exact: true }),
  ).toHaveCount(0);
  await select(
    page.getByRole("link", { name: "Open this item", exact: true }),
    coldId,
  );
  const personId = await insertPerson(catalog.database, {
    displayName: "Entry point member",
    member_id: catalog.memberId,
  });
  await insertItemPerson(catalog.database, { itemId: coldId, personId });
  await page.goto(`/items/${coldId}/removal`);
  await select(
    page.getByRole("link", { name: "Back to the photo", exact: true }),
    coldId,
  );
  await page.goto(`/items/${coldId}/removal`);
  await select(
    page.getByRole("link", { name: "Never mind", exact: true }),
    coldId,
  );
  const requester = await catalog.database
    .selectFrom("members")
    .select("id")
    .where("id", "!=", catalog.memberId)
    .executeTakeFirstOrThrow();
  await insertRemovalRequest(catalog.database, {
    requestedByMemberId: requester.id,
    itemUploaderMemberId: catalog.memberId,
    item_id: coldId,
    state: "open",
    resolved_at: null,
    resolved_by_member_id: null,
    decline_reason: null,
  });
  await page.goto("/removal-requests");
  await select(
    page.getByRole("link", { name: "Open the photograph", exact: true }),
    coldId,
  );
  await page.goBack();
  await page
    .getByRole("button", { name: "Keep it, and say why", exact: true })
    .click();
  await select(
    page.getByRole("link", {
      name: "Change who can see it instead",
      exact: true,
    }),
    coldId,
  );
  expect(actualSelections).toBe(11);
  expect(await openCount()).toBe(actualSelections);
});
