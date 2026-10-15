import { getSelectionTransfersFromLedger } from "../../support/createFakeS3Server/getSelectionTransfersFromLedger/getSelectionTransfersFromLedger.ts";

import { writeFile } from "node:fs/promises";

import { expect, test } from "../media.fixtures.ts";

import { expectCurrentPhotoDecoded } from "../measurements.ts";

import {
  getCompletedPhotoDecodeFromPage,
  getSettledMediaLedger,
  observeNativePhotoDecodes,
  observePendingMediaRequests,
} from "../decodedPhotoEvidence.ts";

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
        if (url.origin === catalog.origin && url.pathname.startsWith("/api/")) {
          apiRequests.push({
            method: request.method(),
            path: url.pathname,
            body: request.postDataJSON(),
          });
        }
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
