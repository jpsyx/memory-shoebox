import { expect, it } from "vitest";
import { avatarFileError, getPreviewFromAvatarCrop } from "./avatarCropHelpers";
it("maps the exact integer server square to the circular preview", () => {
  expect(
    getPreviewFromAvatarCrop({
      width: 101,
      height: 57,
      crop: { centerX: 0.71, centerY: 0.36, zoom: 1.7 },
      size: 264,
    }),
  ).toEqual({ width: 808, height: 456, left: -440, top: -32 });
});
it("checks supported MIME and the byte limit before decoding", () => {
  expect(
    avatarFileError(new File(["x"], "bad.svg", { type: "image/svg+xml" })),
  ).toBe("Choose a JPEG, PNG, or WebP photo.");
  expect(
    avatarFileError(
      new File([new Uint8Array(10485761)], "big.png", { type: "image/png" }),
    ),
  ).toBe("Choose a photo smaller than 10 MB.");
});
