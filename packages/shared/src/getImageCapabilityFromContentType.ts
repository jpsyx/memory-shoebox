/** Maps admitted browser image types to their explicit decode capability. */
export function getImageCapabilityFromContentType(
  contentType: string,
): "baseline" | "webp" | "avif" | "unsupported" {
  if (["image/jpeg", "image/png", "image/gif"].includes(contentType)) {
    return "baseline";
  }
  if (contentType === "image/webp") {
    return "webp";
  }
  if (contentType === "image/avif") {
    return "avif";
  }
  return "unsupported";
}
