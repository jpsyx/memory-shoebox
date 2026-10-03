/**
 * The type each accepted extension implies, for a `File` whose browser left
 * `type` empty. Chrome does that for HEIC on some platforms, and the server
 * refuses an empty type, so without this an iPhone's own photograph would be
 * refused as `unsupported_type`. It widens nothing: the server still checks
 * the declared type against `appConfig.upload.acceptedContentTypes`.
 */
const CONTENT_TYPE_BY_EXTENSION: ReadonlyMap<string, string> = new Map([
  ["heic", "image/heic"],
  ["heif", "image/heif"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["png", "image/png"],
  ["webp", "image/webp"],
  ["gif", "image/gif"],
  ["mov", "video/quicktime"],
  ["mp4", "video/mp4"],
]);

/**
 * What a file with no type and no extension we know is declared as, and what
 * a browser that cannot tell reports: both mean "no usable type".
 */
const UNKNOWN_CONTENT_TYPE = "application/octet-stream";

/**
 * The content type a picked file is declared with.
 *
 * The browser's own `File.type`, lowercased, and only when it is empty, or the
 * generic octet stream a browser reports when it cannot tell, the type its
 * extension implies. The engine routes a file to the image or the video path
 * by this same value, so the two can never disagree.
 */
export function getDeclaredContentTypeFromFile(
  file: Readonly<Pick<File, "name" | "type">>,
): string {
  const browserType = file.type.toLowerCase();
  if (browserType !== "" && browserType !== UNKNOWN_CONTENT_TYPE) {
    return browserType;
  }
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return CONTENT_TYPE_BY_EXTENSION.get(extension) ?? UNKNOWN_CONTENT_TYPE;
}
