/**
 * `"`, `\`, and every control character (0x00-0x1F, 0x7F), CR and LF included.
 *
 * A `"` or `\` would escape the quoted string `filename=""` sits inside. A
 * control character is worse than a formatting glitch: this server never
 * emits `Content-Disposition` itself, Backblaze does, when it serves the
 * signed URL this builds. Backblaze decodes `response-content-disposition`
 * off the query string and writes the decoded bytes back as a literal
 * response header, so a raw CR/LF here is a header-splitting primitive
 * against whatever reads that download, not merely against this process.
 */
// The control characters are exactly what this pattern exists to find.
// eslint-disable-next-line no-control-regex
const UNSAFE_FILENAME_CHARACTERS = /["\\\x00-\x1f\x7f]/gu;

/**
 * The four characters RFC 5987's `ext-value` forbids that
 * `encodeURIComponent` leaves unescaped.
 */
const UNENCODED_EXT_VALUE_CHARACTERS = /['()*]/gu;

/**
 * An ASCII fallback for `filename=""`, RFC 6266's plain, unencoded parameter.
 *
 * Some clients still read `filename` as they would have in 1999: literal
 * bytes, no charset. A family member's "Cumpleaños.jpg" cannot survive that
 * unmodified, so the real name travels on `filename*` below and this exists
 * only for a client old enough to ignore it.
 */
function _asciiDownloadFilename(filename: string): string {
  return filename
    .replaceAll(UNSAFE_FILENAME_CHARACTERS, "")
    .replaceAll(/[^\x20-\x7e]/gu, "_");
}

/**
 * Percent-encodes one filename for RFC 5987/8187's `ext-value`, the form
 * `filename*` takes, which is what lets "Cumpleaños.jpg" survive intact for
 * every client that reads it.
 *
 * `encodeURIComponent` already turns `"`, `\`, control characters, and every
 * non-ASCII code point into percent-escapes over their UTF-8 bytes; the only
 * gap is `' ( ) *`, which it leaves raw because they are legal in a URI
 * component even though none of the four is a legal `attr-char`.
 */
function _encodeExtValueFilename(filename: string): string {
  return encodeURIComponent(filename).replaceAll(
    UNENCODED_EXT_VALUE_CHARACTERS,
    (character) => {
      return `%${character.charCodeAt(0).toString(16).toUpperCase()}`;
    },
  );
}

/**
 * Builds a `Content-Disposition` value safe to sign into
 * `ResponseContentDisposition`.
 *
 * Carries both parameters on purpose: `filename` for a client that has never
 * heard of `filename*`, and `filename*` for the name as it was actually
 * typed. A compliant client prefers `filename*` when both are present
 * (RFC 6266 §5), so the ASCII fallback is never what a modern browser shows.
 *
 * @param filename The name the download should be saved under.
 */
export function makeDownloadDispositionFromFilename(filename: string): string {
  const asciiFallback = _asciiDownloadFilename(filename);
  const extValue = _encodeExtValueFilename(filename);
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${extValue}`;
}
