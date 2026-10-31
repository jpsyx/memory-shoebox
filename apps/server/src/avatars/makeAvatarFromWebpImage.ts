import sharp, { type Sharp, type OutputInfo, type Raw } from "sharp";
import type { getExtractionFromAvatarCrop } from "@memory-shoebox/shared";

type Square = ReturnType<typeof getExtractionFromAvatarCrop>;
type Geometry = { width: number; height: number; square: Square };

// Preserve original integer edges. Only the enclosing read window is rounded.
function _getReducedGeometryFromCrop({
  width,
  height,
  square,
}: Readonly<Geometry>) {
  const scale = Math.min(
    1,
    256 / square.width,
    Math.sqrt(12_000_000 / (width * height)),
  );
  const reducedWidth = Math.floor(width * scale);
  const reducedHeight = Math.floor(height * scale);
  // Decoder raster allocation is bounded independently of crop zoom/aspect.
  if (reducedWidth * reducedHeight > 12_000_000) {
    throw new Error("Avatar intermediate exceeds its decode budget");
  }
  const scaleX = reducedWidth / width;
  const scaleY = reducedHeight / height;
  const left = square.left * scaleX;
  const top = square.top * scaleY;
  const cropWidth = square.width * scaleX;
  const cropHeight = square.height * scaleY;
  const windowLeft = Math.max(0, Math.floor(left) - 2);
  const windowTop = Math.max(0, Math.floor(top) - 2);
  return {
    reducedWidth,
    reducedHeight,
    cropWidth,
    cropHeight,
    offsetX: left - windowLeft,
    offsetY: top - windowTop,
    window: {
      left: windowLeft,
      top: windowTop,
      width:
        Math.min(reducedWidth, Math.ceil(left + cropWidth) + 2) - windowLeft,
      height:
        Math.min(reducedHeight, Math.ceil(top + cropHeight) + 2) - windowTop,
    },
  };
}

/** Shrinks WebP during decode, then samples the original crop's exact edges. */
export async function makeAvatarFromWebpImage(
  options: Readonly<Geometry & { image: Sharp; orientation: number }>,
): Promise<Buffer> {
  const geometry = _getReducedGeometryFromCrop(
    _getEncodedGeometryFromCrop(options),
  );
  const { data, info } = await options.image
    .resize(geometry.reducedWidth, geometry.reducedHeight, { fit: "fill" })
    .extract(geometry.window)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const scaleX = 256 / geometry.cropWidth;
  const scaleY = 256 / geometry.cropHeight;
  const transformed = await sharp(data, { raw: _getRawInputFromOutput(info) })
    .affine([scaleX, 0, 0, scaleY], {
      idx: 0.5 - geometry.offsetX,
      idy: 0.5 - geometry.offsetY,
      odx: -0.5,
      ody: -0.5,
      interpolator: sharp.interpolators.bicubic,
    })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const square = await sharp(transformed.data, {
    raw: _getRawInputFromOutput(transformed.info),
  })
    .extract({ left: 0, top: 0, width: 256, height: 256 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return _makeOrientedAvatarFromSquare(square, options.orientation);
}

function _getEncodedGeometryFromCrop(
  options: Readonly<Geometry & { orientation: number }>,
): Geometry {
  const { square, orientation } = options;
  const width = orientation >= 5 ? options.height : options.width;
  const height = orientation >= 5 ? options.width : options.height;
  const left = [2, 3].includes(orientation)
    ? width - square.left - square.width
    : [7, 8].includes(orientation)
      ? width - square.top - square.width
      : orientation >= 5
        ? square.top
        : square.left;
  const top = [3, 4].includes(orientation)
    ? height - square.top - square.height
    : [6, 7].includes(orientation)
      ? height - square.left - square.height
      : orientation >= 5
        ? square.left
        : square.top;
  return { width, height, square: { ...square, left, top } };
}

function _makeOrientedAvatarFromSquare(
  square: Readonly<{ data: Buffer; info: OutputInfo }>,
  orientation: number,
): Promise<Buffer> {
  // Explicit Sharp flop precedes rotation; EXIF's mirrored cases account for it.
  const angles = [0, 0, 0, 180, 180, 270, 90, 90, 270];
  return sharp(square.data, { raw: _getRawInputFromOutput(square.info) })
    .flop([2, 4, 5, 7].includes(orientation))
    .rotate(angles[orientation] ?? 0)
    .webp()
    .toBuffer();
}

// OutputInfo describes pipeline premultiplication, not the returned raw bytes.
function _getRawInputFromOutput(info: Readonly<OutputInfo>): Raw {
  return { width: info.width, height: info.height, channels: info.channels };
}
