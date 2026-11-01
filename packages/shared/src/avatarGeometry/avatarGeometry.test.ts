import { expect, it } from "vitest";
import { getExtractionFromAvatarCrop } from "./avatarGeometry.ts";
it("uses the same floored odd-dimension fractional zoom square and clamps edges", () => {
  expect(
    getExtractionFromAvatarCrop({
      width: 101,
      height: 57,
      crop: { centerX: 0.71, centerY: 0.36, zoom: 1.7 },
    }),
  ).toEqual({ left: 55, top: 4, width: 33, height: 33 });
  expect(
    getExtractionFromAvatarCrop({
      width: 101,
      height: 57,
      crop: { centerX: 1, centerY: 0, zoom: 1.7 },
    }),
  ).toEqual({ left: 68, top: 0, width: 33, height: 33 });
});

it("keeps a one-pixel extraction at maximum zoom on small images", () => {
  expect(
    getExtractionFromAvatarCrop({
      width: 4,
      height: 4,
      crop: { centerX: 1, centerY: 1, zoom: 8 },
    }),
  ).toEqual({ left: 3, top: 3, width: 1, height: 1 });
});
