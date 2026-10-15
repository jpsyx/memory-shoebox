import { expect, type ElementHandle, type Page } from "@playwright/test";
import type { FakeS3Request } from "../createFakeS3Server/createFakeS3Server.types.ts";

/** Exact landed previews and the request checkpoint owned by this reopen. */
export type UploadResumeMediaOptions = {
  page: Page;
  landed: ReadonlyArray<{
    fileId: string;
    originalFilename: string;
    source: string;
  }>;
  reopenLogOffset: number;
  readRequests: () => Promise<FakeS3Request[]>;
};
type OwnedPreview = { image: ElementHandle<HTMLImageElement>; source: string };

async function _decodeOwnedPreviews(
  options: UploadResumeMediaOptions,
  previews: OwnedPreview[],
): Promise<void> {
  for (const file of options.landed) {
    expect(
      decodeURIComponent(new URL(file.source).pathname).split("/"),
    ).toContain(file.fileId);
    const preview = options.page.getByRole("img", {
      name: file.originalFilename,
      exact: true,
    });
    await expect(preview).toHaveCount(1);
    await preview.scrollIntoViewIfNeeded();
    await expect(preview).toBeInViewport();
    await expect(preview).toHaveAttribute("src", file.source);
    const image =
      (await preview.elementHandle()) as ElementHandle<HTMLImageElement> | null;
    if (image === null) {
      throw new Error("Owned upload preview disappeared");
    }
    previews.push({ image, source: file.source });
    expect(
      await image.evaluate(async (node, source) => {
        await node.decode();
        return (
          node.isConnected &&
          node.src === source &&
          node.currentSrc === source &&
          node.complete &&
          node.naturalWidth > 0
        );
      }, file.source),
    ).toBe(true);
  }
}

async function _getSettledRequestCount(
  options: UploadResumeMediaOptions,
): Promise<number> {
  let log: FakeS3Request[] = [];
  let hydration: FakeS3Request[] = [];
  await expect
    .poll(async () => {
      log = await options.readRequests();
      hydration = log.slice(options.reopenLogOffset).filter((request) => {
        return options.landed.some((file) => {
          return request.key.split("/").includes(file.fileId);
        });
      });
      return hydration.every((request) => {
        return request.status !== null;
      });
    })
    .toBe(true);
  expect(
    hydration.every((request) => {
      return request.method === "GET" && request.operation === "GetObject";
    }),
  ).toBe(true);
  return log.length;
}

/** Native decode and terminal exact-landed requests precede the resume watermark. */
export async function waitForUploadResumeMedia(
  options: UploadResumeMediaOptions,
): Promise<number> {
  expect(options.landed).toHaveLength(2);
  const previews: OwnedPreview[] = [];
  try {
    await _decodeOwnedPreviews(options, previews);
    const requestCount = await _getSettledRequestCount(options);
    for (const { image, source } of previews) {
      expect(
        await image.evaluate((node, expected) => {
          return (
            node.isConnected &&
            node.src === expected &&
            node.currentSrc === expected &&
            node.complete &&
            node.naturalWidth > 0
          );
        }, source),
      ).toBe(true);
    }
    return requestCount;
  } finally {
    await Promise.all(
      previews.map(({ image }) => {
        return image.dispose();
      }),
    );
  }
}
