import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createFakeS3Server } from "../../support/createFakeS3Server/createFakeS3Server.ts";
import type { FakeS3Request } from "../../support/createFakeS3Server/createFakeS3Server.types.ts";
import { waitForUploadResumeMedia } from "../../support/waitForUploadResumeMedia.ts";

function _gate(): { promise: Promise<void>; release: () => void } {
  let release!: () => void;
  const promise = new Promise<void>((finish) => {
    release = finish;
  });
  return { promise, release };
}

(["decode", "terminal", "changed source", "rejected decode"] as const).forEach(
  (heldBoundary) => {
    test(`reopen barrier holds Resume until actual ${heldBoundary} completion`, async ({
      page,
    }) => {
      const validBody = await readFile(
        "e2e/fixtures/cartoon-media/web/burst_002-thumb.jpg",
      );
      const fileIds = ["owned-first", "owned-second"];
      const bucket = createFakeS3Server({
        bucketName: "owned-reopen",
        allowedOrigins: [],
        objects: new Map(
          fileIds.map((id) => {
            return [
              `uploads/session/${id}/thumb.jpg`,
              {
                body:
                  heldBoundary === "rejected decode" && id === fileIds[0]
                    ? Buffer.from("invalid JPEG")
                    : validBody,
                contentType: "image/jpeg",
                etag: '"owned"',
                lastModified: new Date(0).toUTCString(),
              },
            ];
          }),
        ),
      });
      const responseEntered = _gate();
      let releaseResponse = () => {};
      bucket.prependListener("request", (request, response) => {
        if (!request.url?.endsWith("?x-id=GetObject")) {
          return;
        }
        const end = response.end.bind(response);
        response.end = (...args: unknown[]) => {
          releaseResponse = () => {
            Reflect.apply(end, response, args);
          };
          responseEntered.release();
          return response;
        };
      });
      await new Promise<void>((finish) => {
        bucket.listen(0, "127.0.0.1", finish);
      });
      const address = bucket.address();
      if (address === null || typeof address === "string") {
        throw new Error("Expected owned loopback port");
      }
      const origin = `http://127.0.0.1:${address.port}`;
      const landed = fileIds.map((fileId) => {
        return {
          fileId,
          originalFilename: `${fileId}.jpg`,
          source: `${origin}/owned-reopen/uploads/session/${fileId}/thumb.jpg`,
        };
      });
      const readRequests = async (): Promise<FakeS3Request[]> => {
        return (
          (await (await fetch(`${origin}/__fake-s3/requests`)).json()) as {
            requests: FakeS3Request[];
          }
        ).requests;
      };
      const decodeEntered = _gate();
      await page.exposeFunction("reportOwnedDecode", decodeEntered.release);
      let heldRequest: Promise<ArrayBuffer> | undefined;
      let resumed = false;
      try {
        await page.setContent(
          `${landed
            .map((file) => {
              return `<img alt="${file.originalFilename}" src="${file.source}">`;
            })
            .join(
              "",
            )}<button onclick="this.dataset.resumed='true'">Resume upload</button>`,
        );
        if (heldBoundary === "decode" || heldBoundary === "changed source") {
          await page.evaluate(() => {
            const control = window as typeof window & {
              reportOwnedDecode: () => Promise<void>;
              releaseOwnedDecode: () => void;
            };
            const image = document.images[0]!;
            const decode = image.decode.bind(image);
            image.decode = async () => {
              await decode();
              await control.reportOwnedDecode();
              await new Promise<void>((finish) => {
                control.releaseOwnedDecode = finish;
              });
            };
          });
        } else if (heldBoundary === "terminal") {
          heldRequest = fetch(`${landed[0]!.source}?x-id=GetObject`).then(
            (response) => {
              return response.arrayBuffer();
            },
          );
          await responseEntered.promise;
          expect(
            (await readRequests()).filter((request) => {
              return request.status === null;
            }),
          ).toHaveLength(1);
        }
        const secondRead = _gate();
        let readCount = 0;
        const barrier = waitForUploadResumeMedia({
          page,
          landed,
          reopenLogOffset: 0,
          readRequests: async () => {
            const requests = await readRequests();
            readCount += 1;
            if (readCount === 2) {
              secondRead.release();
            }
            return requests;
          },
        }).then(async () => {
          await page
            .getByRole("button", { name: "Resume upload", exact: true })
            .click();
          resumed = true;
        });
        if (heldBoundary === "rejected decode") {
          await expect(barrier).rejects.toThrow();
          expect(resumed).toBe(false);
          return;
        }
        expect(
          await Promise.race([
            barrier.then(() => {
              return "resumed";
            }),
            (heldBoundary !== "terminal"
              ? decodeEntered.promise
              : secondRead.promise
            ).then(() => {
              return "waiting";
            }),
          ]),
        ).toBe("waiting");
        expect(resumed).toBe(false);
        await expect(
          page.getByRole("button", { name: "Resume upload" }),
        ).not.toHaveAttribute("data-resumed", "true");
        if (heldBoundary !== "terminal") {
          if (heldBoundary === "changed source") {
            await page.evaluate(() => {
              document.images[0]!.src += "?x-id=GetObject";
            });
          }
          await page.evaluate(() => {
            (
              window as typeof window & { releaseOwnedDecode: () => void }
            ).releaseOwnedDecode();
          });
        } else {
          releaseResponse();
          await heldRequest;
        }
        if (heldBoundary === "changed source") {
          await expect(barrier).rejects.toThrow();
          expect(resumed).toBe(false);
          return;
        }
        await barrier;
        await expect(
          page.getByRole("button", { name: "Resume upload" }),
        ).toHaveAttribute("data-resumed", "true");
        expect(
          (await readRequests()).every((request) => {
            return request.status !== null;
          }),
        ).toBe(true);
      } finally {
        releaseResponse();
        await heldRequest;
        await page.close();
        bucket.closeAllConnections();
        await new Promise<void>((finish, reject) => {
          bucket.close((error) => {
            if (error) {
              reject(error);
            } else {
              finish();
            }
          });
        });
      }
    });
  },
);
