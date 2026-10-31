import type { AvatarCrop } from "../avatars.ts";
/** Gets the oriented integer square represented by a normalized avatar crop. */
export function getExtractionFromAvatarCrop(
  options: Readonly<{ width: number; height: number; crop: AvatarCrop }>,
): { left: number; top: number; width: number; height: number } {
  const { width, height, crop } = options;
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
