/**
 * Platform tokens, most specific first: an iPhone claims "like Mac OS X", an
 * Android user agent also contains "Linux", and a Chromebook's "CrOS" comes
 * with "X11", which the later `Linux` entry would otherwise match.
 */
const PLATFORMS = [
  { pattern: /iPhone/, label: "iPhone" },
  { pattern: /iPad/, label: "iPad" },
  { pattern: /Android/, label: "Android" },
  { pattern: /CrOS/, label: "Chromebook" },
  { pattern: /Macintosh|Mac OS X/, label: "Mac" },
  { pattern: /Windows/, label: "Windows" },
  { pattern: /Linux|X11/, label: "Linux" },
] as const;

/**
 * Browser tokens, most specific first.
 *
 * The order is the whole of this parser's cleverness. Edge sends `Edg/` and
 * also `Chrome/` and `Safari/`; Samsung Internet sends `SamsungBrowser/` and
 * both of those; Opera sends `OPR/` or `Opera` and also `Chrome/` and
 * `Safari/`; Chrome sends `Safari/`; and on iOS, Chrome and Firefox send
 * `CriOS/` and `FxiOS/` while still claiming Safari.
 */
const BROWSERS = [
  { pattern: /Edg[A-Za-z]*\//, label: "Edge" },
  { pattern: /SamsungBrowser\//, label: "Samsung Internet" },
  { pattern: /OPR\/|Opera/, label: "Opera" },
  { pattern: /FxiOS\/|Firefox\//, label: "Firefox" },
  { pattern: /CriOS\/|Chrome\//, label: "Chrome" },
  { pattern: /Safari\//, label: "Safari" },
] as const;

/** Long enough to recognise an unparsed client, short enough for a table. */
const MAX_RAW_LABEL_LENGTH = 80;

/** What a row says when there was no `User-Agent` header at all. */
const UNKNOWN_DEVICE_LABEL = "Unknown device";

/** The first label whose pattern the string matches, or undefined. */
function _getLabelFromPatterns(options: {
  userAgent: string;
  patterns: ReadonlyArray<{ pattern: RegExp; label: string }>;
}): string | undefined {
  return options.patterns.find((candidate) => {
    return candidate.pattern.test(options.userAgent);
  })?.label;
}

/**
 * Turns a `User-Agent` into the stored `device_label`, e.g. "iPhone, Safari".
 *
 * Parsed once at sign-in and stored on the row, so that an upgraded parser
 * never relabels a device somebody already recognises
 * (`data-models.md` § `sessions`). The raw string is stored beside it as the
 * fallback and is never serialised in any payload.
 *
 * Hand-rolled rather than a dependency: the output is two tokens, it has a
 * stored fallback when it is wrong, and its only job is to be recognisable to
 * the person holding the device. No IP address and no location: a device row
 * is a label and two timestamps, and that is the whole of it (Decision 6).
 *
 * @param userAgent The header, or undefined when none was sent.
 * @returns "iPhone, Safari", one half of it, the truncated raw string, or
 *   "Unknown device". Never an empty string: the column is `NOT NULL`.
 */
export function getDeviceLabelFromUserAgent(
  userAgent: string | undefined,
): string {
  const raw = (userAgent ?? "").trim();
  if (raw === "") {
    return UNKNOWN_DEVICE_LABEL;
  }

  const platform = _getLabelFromPatterns({
    userAgent: raw,
    patterns: PLATFORMS,
  });
  const browser = _getLabelFromPatterns({ userAgent: raw, patterns: BROWSERS });

  if (platform !== undefined && browser !== undefined) {
    return `${platform}, ${browser}`;
  }
  return platform ?? browser ?? raw.slice(0, MAX_RAW_LABEL_LENGTH);
}
