import {
  getExtractionFromAvatarCrop,
  type AvatarCrop,
} from "@memory-shoebox/shared";
import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";

/** Maps oriented decoded dimensions to the server's exact integer square. */
export function getPreviewFromAvatarCrop(
  options: Readonly<{
    width: number;
    height: number;
    crop: AvatarCrop;
    size: number;
  }>,
): { left: number; top: number; width: number; height: number } {
  const extraction = getExtractionFromAvatarCrop(options);
  const scale = options.size / extraction.width;
  return {
    width: options.width * scale,
    height: options.height * scale,
    left: -extraction.left * scale,
    top: -extraction.top * scale,
  };
}

/** Checks a chosen file before allocating an image decoder. */
export function avatarFileError(file: File): string | undefined {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    return "Choose a JPEG, PNG, or WebP photo.";
  }
  if (file.size > 10 * 1024 * 1024) {
    return "Choose a photo smaller than 10 MB.";
  }
  return undefined;
}

/** Turns bounded upload failures into actionable photo copy. */
export function avatarFailure(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.code === "avatar_changed") {
      return "Your photo changed in another window.";
    }
    if (error.code === "avatar_too_large") {
      return "Choose a photo smaller than 10 MB.";
    }
    if (error.code === "avatar_invalid_image") {
      return "We couldn't open that photo. Choose another.";
    }
    if (error.status === 401) {
      return "Sign in again to save your photo.";
    }
  }
  return "Couldn't save your photo. Try again.";
}

/** Reads browser-oriented dimensions without retaining an original elsewhere. */
export function getDimensionsFromAvatarUrl(
  url: string,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      if (!image.naturalWidth || !image.naturalHeight) {
        reject(new Error("invalid"));
        return;
      }
      if (image.naturalWidth * image.naturalHeight > 50_000_000) {
        reject(new Error("dimensions"));
        return;
      }
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      return reject(new Error("invalid"));
    };
    image.src = url;
  });
}
