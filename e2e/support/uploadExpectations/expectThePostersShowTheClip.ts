import { expect, type Page } from "@playwright/test";

import { uploadSessionDetailSchema } from "@memory-shoebox/shared";

import { H264_NAMES } from "./uploadExpectations.constants.ts";

/**
 * How far apart a poster's darkest and brightest pixel must be, out of 255.
 *
 * FFmpeg's test pattern spans most of the range; a uniform black or white
 * frame, which is what a poster drawn before the frame was ready looks like,
 * spans almost none.
 */
const MIN_POSTER_LUMINANCE_SPAN = 64;

/**
 * The span between a picture's darkest and brightest pixel, 0 to 255,
 * decoded by the browser under test.
 *
 * Decoded there because Node has no image decoder, and handed the bytes
 * rather than a URL so that no CORS rule of the stand-in's is part of the
 * check. Drawn at 64 px square first: the span of a test pattern survives the
 * downscale, and a uniform frame stays uniform.
 */
async function _getLuminanceSpanFromPicture(options: {
  page: Page;
  bytes: Buffer;
}): Promise<number> {
  return options.page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (character) => {
      return character.charCodeAt(0);
    });
    const bitmap = await createImageBitmap(new Blob([bytes]));
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext("2d");
    if (context === null) {
      throw new Error("No 2D canvas to read the poster with");
    }
    context.drawImage(bitmap, 0, 0, 64, 64);
    const { data } = context.getImageData(0, 0, 64, 64);
    const luminances = Array.from({ length: data.length / 4 }, (_, pixel) => {
      const [red = 0, green = 0, blue = 0] = data.subarray(
        pixel * 4,
        pixel * 4 + 3,
      );
      return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    });
    return Math.max(...luminances) - Math.min(...luminances);
  }, options.bytes.toString("base64"));
}

/**
 * Both H.264 posters are a frame of the clip, not a blank one.
 *
 * The engine skips a poster rather than store a black one, so a poster that
 * is there must show the picture. Read the way the product reads it, through
 * the signed URL the batch's detail hands out.
 *
 * @param options.page A page in the uploader's context, in the browser that
 *   drew the posters.
 * @param options.sessionId The batch.
 */
export async function expectThePostersShowTheClip(
  options: Readonly<{
    page: Page;
    sessionId: string;
  }>,
): Promise<void> {
  const response = await options.page.request.get(
    `/api/upload-sessions/${options.sessionId}`,
  );
  expect(response.status()).toBe(200);
  const detail = uploadSessionDetailSchema.parse(await response.json());
  await Promise.all(
    H264_NAMES.map(async (name) => {
      const posterUrl = detail.files.find((file) => {
        return file.originalFilename === name;
      })?.media?.poster?.url;
      expect(posterUrl, name).toBeDefined();
      const poster = await fetch(posterUrl ?? "");
      expect(poster.status, name).toBe(200);
      const span = await _getLuminanceSpanFromPicture({
        page: options.page,
        bytes: Buffer.from(await poster.arrayBuffer()),
      });
      expect(span, name).toBeGreaterThan(MIN_POSTER_LUMINANCE_SPAN);
    }),
  );
}
