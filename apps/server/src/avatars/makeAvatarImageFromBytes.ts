import sharp from "sharp";
import { avatarCropSchema, type AvatarCrop } from "@memory-shoebox/shared";
import { ApiError } from "../http/ApiError.ts";

/** The only accepted original byte budget, checked before Sharp sees input. */
export const AVATAR_BYTE_LIMIT = 10 * 1024 * 1024;
const PIXEL_LIMIT = 50_000_000;
const FORMATS: Readonly<Record<string, string>> = {
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
};

function _invalidImage(): ApiError {
  return new ApiError({
    statusCode: 400,
    code: "avatar_invalid_image",
    message: "Choose a still JPEG, PNG, or WebP photo up to 50 megapixels.",
  });
}

function _getExtractionFromCrop(
  width: number,
  height: number,
  crop: AvatarCrop,
) {
  const side = Math.floor(Math.min(width, height) / crop.zoom);
  return {
    left: Math.max(
      0,
      Math.min(width - side, Math.floor(crop.centerX * width - side / 2)),
    ),
    top: Math.max(
      0,
      Math.min(height - side, Math.floor(crop.centerY * height - side / 2)),
    ),
    width: side,
    height: side,
  };
}

/** Decodes one bounded still image, orients/crops it and strips all metadata. */
export async function makeAvatarImageFromBytes(
  options: Readonly<{
    bytes: Uint8Array;
    contentType: string;
    crop: AvatarCrop;
  }>,
): Promise<Uint8Array> {
  _assertByteLimit(options.bytes);
  const crop = avatarCropSchema.safeParse(options.crop);
  if (!crop.success || FORMATS[options.contentType] === undefined) {
    throw _invalidImage();
  }
  try {
    const image = sharp(options.bytes, {
      limitInputPixels: PIXEL_LIMIT,
      failOn: "warning",
    });
    const metadata = await image.metadata();
    if (
      metadata.format !== FORMATS[options.contentType] ||
      (metadata.pages ?? 1) !== 1 ||
      (metadata.format === "png" && _hasPngAnimation(options.bytes)) ||
      !metadata.width ||
      !metadata.height
    ) {
      throw _invalidImage();
    }
    const swapsAxes = (metadata.orientation ?? 1) >= 5;
    const width = swapsAxes ? metadata.height : metadata.width;
    const height = swapsAxes ? metadata.width : metadata.height;
    return await image
      .autoOrient()
      .extract(_getExtractionFromCrop(width, height, crop.data))
      .resize(256, 256)
      .webp()
      .toBuffer();
  } catch {
    throw _invalidImage();
  }
}

// libvips exposes only APNG's default still, so page count alone is insufficient.
// Walk chunk boundaries, never search compressed data for an animation marker.
function _hasPngAnimation(bytes: Uint8Array): boolean {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  while (offset + 12 <= bytes.byteLength) {
    const length = view.getUint32(offset);
    const type = view.getUint32(offset + 4);
    if (offset + length + 12 > bytes.byteLength) {
      throw _invalidImage();
    }
    if (type === 0x6163544c) {
      return true;
    } // acTL
    if (type === 0x49454e44) {
      return false;
    } // IEND
    offset += length + 12;
  }
  throw _invalidImage();
}

function _assertByteLimit(bytes: Uint8Array): void {
  if (bytes.byteLength > AVATAR_BYTE_LIMIT) {
    throw new ApiError({
      statusCode: 413,
      code: "avatar_too_large",
      message: "Choose a photo smaller than 10 MB.",
    });
  }
}
