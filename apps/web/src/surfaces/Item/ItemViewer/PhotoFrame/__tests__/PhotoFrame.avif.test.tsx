import { PhotoReadinessContext } from "@/media/PhotoReadinessContext";
import { makeMediaSource } from "@/surfaces/Timeline/timelineFixtures";
import { makeItemDetail } from "@/testing/itemFixtureHelpers";
import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { PhotoFrame } from "../PhotoFrame";

it("selects waiting AVIF originals and publishes neighbor readiness after the shared probe settles", async () => {
  const created = document.createElement.bind(document);
  const images: HTMLImageElement[] = [];
  vi.spyOn(document, "createElement").mockImplementation((tag, options) => {
    const element = created(tag, options);
    if (element instanceof HTMLImageElement) {
      images.push(element);
      Object.defineProperties(element, {
        naturalWidth: { value: 1 },
        naturalHeight: { value: 1 },
        decode: { value: async () => {} },
      });
    }
    return element;
  });
  const source = makeMediaSource({
    contentType: "image/avif",
    width: 900,
    height: 600,
    purpose: "original",
  });
  const media = {
    ...makeItemDetail().media,
    thumb: null,
    display: source,
    displayCandidates: [source],
  };
  const readiness = vi.fn();
  const view = render(
    <PhotoReadinessContext value={readiness}>
      <PhotoFrame media={media} itemId="first" />
      <PhotoFrame media={media} itemId="second" />
    </PhotoReadinessContext>,
  );
  expect(view.container.querySelectorAll("picture")).toHaveLength(0);
  const probe = images.find((image) => {
    return image.src.startsWith("data:image/avif;");
  })!;
  await act(async () => {
    fireEvent.load(probe);
  });
  await waitFor(() => {
    expect(view.container.querySelectorAll("picture img")).toHaveLength(2);
  });
  await act(async () => {
    view.container.querySelectorAll("picture img").forEach((image) => {
      fireEvent.load(image);
    });
  });
  expect(
    view.container.querySelectorAll('[data-photo-ready="true"]'),
  ).toHaveLength(2);
  for (const itemId of ["first", "second"]) {
    expect(readiness).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId,
        photosReady: true,
        viewport: expect.objectContaining({ supportsAvif: true }),
      }),
    );
  }
  view.unmount();
  vi.restoreAllMocks();
});
