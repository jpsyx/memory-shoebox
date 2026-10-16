import { expect, type Page } from "@playwright/test";

/** Actual source admission and native intersection at the capture boundary. */
export type ControlledVisualImage = {
  alt: string;
  source: string | undefined;
  currentSource: string;
  owner: string;
  isIntersecting: boolean;
  decoded: boolean;
};

/** Runs in the browser, with no source assignment or observer substitution. */
export async function getControlledVisualImagesFromDocument(): Promise<
  ControlledVisualImage[]
> {
  await document.fonts.ready;
  const images = Array.from(document.images);
  const owners = images.map((image) => {
    return (
      image.closest("a[href^='/items/'],button[data-photo-surface='pile']") ??
      image
    );
  });
  const entries = await new Promise<Map<Element, boolean>>((fulfill) => {
    const intersections = new Map<Element, boolean>();
    if (!owners.length) {
      return fulfill(intersections);
    }
    const observer = new IntersectionObserver(
      (observations) => {
        observations.forEach((entry) => {
          intersections.set(
            entry.target,
            entry.isIntersecting && entry.intersectionRatio > 0,
          );
        });
        if (
          owners.every((owner) => {
            return intersections.has(owner);
          })
        ) {
          observer.disconnect();
          fulfill(intersections);
        }
      },
      { root: null, rootMargin: "0px", threshold: 0 },
    );
    owners.forEach((owner) => {
      return observer.observe(owner);
    });
  });
  return Promise.all(
    images.map(async (image, index) => {
      const owner = owners[index]!;
      const source = image.getAttribute("src") ?? undefined;
      if (source) {
        await image.decode();
      }
      return {
        alt: image.alt,
        source,
        currentSource: image.currentSrc,
        owner:
          owner.getAttribute("data-item-id") ??
          owner.getAttribute("href") ??
          owner.tagName,
        isIntersecting: entries.get(owner) === true,
        decoded:
          Boolean(source) &&
          image.isConnected &&
          owner.isConnected &&
          image.getAttribute("src") === source &&
          image.currentSrc === image.src &&
          image.complete &&
          image.naturalWidth > 0,
      };
    }),
  );
}

/**
 * Requires exact fixture identity and pixels for entered or admitted previews.
 */
export async function waitForControlledVisualMedia({
  page,
  imageCount,
}: Readonly<{ page: Page; imageCount: number }>): Promise<
  ControlledVisualImage[]
> {
  let images: ControlledVisualImage[] = [];
  await expect
    .poll(async () => {
      images = await page.evaluate(getControlledVisualImagesFromDocument);
      return (
        images.length === imageCount &&
        images.every((image) => {
          return (
            image.alt === "Family at home" &&
            (image.source
              ? image.source ===
                  "https://visual-media.invalid/highChair-thumb.jpg" &&
                image.decoded
              : !image.isIntersecting && image.currentSource === "")
          );
        })
      );
    })
    .toBe(true);
  return images;
}
