/**
 * Fields the contract documents as a person's own words, reproduced verbatim.
 *
 * A comment body may legitimately say "see you on 14 September", and a removal
 * reason may name a date. Scanning them would be scanning the message rather
 * than the metadata.
 *
 * The match is on the last segment of the path with any array index stripped,
 * so `comments[0].body` and `body[1]` are both a person's own words. It is
 * deliberately not every ancestor: a field named `reason` holding an object
 * would otherwise exempt the whole subtree under it, and only the string the
 * contract calls somebody's words is meant to be exempt.
 */
const VERBATIM_FIELDS = ["body", "reason", "declineReason"];

/**
 * A storage key: a path with a media extension on the end.
 *
 * `apis/upload.md` mints every key as `uploads/<sessionId>/<fileId>/<purpose>`
 * with the extension the declared type implies, so requiring an extension
 * costs nothing against the keys this product actually makes. A hypothetical
 * extensionless key is not caught, and could not be: it is indistinguishable
 * from an id with a slash in it.
 *
 * The end is a boundary rather than end-of-string, so a key carrying a query
 * string (`.../original.jpg?X-Amz-Expires=900`) is still a key.
 */
const STORAGE_KEY =
  /[\w.-]+\/[\w./-]*\.(?:jpe?g|png|heic|heif|webp|gif|mp4|mov|webm|m4v)(?![\w-])/i;

/**
 * An IPv4 address, or IPv6 in its full or its compressed form.
 *
 * The compressed branches want the `::` that every short IPv6 carries. They
 * start on a word boundary and refuse a `::` preceded by a word character, so
 * a scope operator such as `std::vector` is not an address.
 *
 * `1.2.3.4` is a valid address and also a plausible version string, and
 * nothing in the syntax separates the two. The guard reports it. No payload in
 * this product carries a version, and the rule it defends (`data-models.md`
 * § Privacy: no address in any form) is worth one false positive. A long
 * colon-separated hex run reports for the same reason, so a MAC address does
 * too, which is the wanted answer: it is a device identifier.
 */
const IP_ADDRESS =
  /\b\d{1,3}(?:\.\d{1,3}){3}\b|\b(?:[0-9a-f]{1,4}:){3,7}[0-9a-f]{1,4}\b|\b[0-9a-f]{1,4}(?::[0-9a-f]{1,4})*::(?:[0-9a-f]{1,4}(?::[0-9a-f]{1,4})*)?|(?<![\w:])::[0-9a-f]{1,4}\b/i;

/** The twelve month names, for the formatted-date branches. */
const MONTH =
  "(?:January|February|March|April|May|June|July|August|September|October|November|December)";

/** The seven weekday names, for the formatted-date branches. */
const WEEKDAY = "(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)";

/**
 * A formatted or a relative date.
 *
 * Every month and weekday branch wants a number or a relative word beside the
 * name, and that is the whole reason this guard is usable. "May" is a person,
 * "Sunday" is a Shoebox, and "August at the grandparents'" is a milestone: a
 * bare name is a name. "14 September 2026" is a date. The cost is that a bare
 * month label in a payload field goes unreported, which is the right trade:
 * a guard that flags somebody's name is a guard that gets deleted.
 *
 * ISO is not a formatted date and must stay clean, so the hyphenated numeric
 * branch wants a one or two digit first component: `14/09/2026` and
 * `2026/09/14` are renderings, while `2026-09-14` and
 * `2026-09-27T10:00:00.000Z` are instants and pass.
 */
const FORMATTED_DATE = new RegExp(
  [
    // "14 September", "14th September 2026".
    `\\b\\d{1,2}(?:st|nd|rd|th)?\\s+${MONTH}\\b`,
    // "September 14", "September 2026", "September 14, 2026".
    `\\b${MONTH}\\s+\\d{1,4}\\b`,
    // "Sunday, 14 September", "Sunday 14".
    `\\b${WEEKDAY},?\\s+\\d{1,2}\\b`,
    // "last Sunday", "next Monday", "this Friday".
    `\\b(?:last|next|this)\\s+${WEEKDAY}\\b`,
    // "14/09/2026", "9-14-2026".
    `\\b\\d{1,2}[/-]\\d{1,2}[/-]\\d{2,4}\\b`,
    // "2026/09/14": ISO order, but slashes make it a rendering.
    `\\b\\d{4}/\\d{1,2}/\\d{1,2}\\b`,
    // "3 days ago", and "in 3 days" the other way round.
    `\\b\\d+\\s+(?:second|minute|hour|day|week|month|year)s?\\s+ago\\b`,
    `\\bin\\s+\\d+\\s+(?:second|minute|hour|day|week|month|year)s?\\b`,
    // "Today", "Yesterday", "Tomorrow".
    `\\b(?:Today|Yesterday|Tomorrow)\\b`,
  ].join("|"),
  "i",
);

/** One value that should not be in a payload, and why. */
export type ForbiddenPayloadValue = {
  path: string;
  value: string;
  reason: "storage_key" | "ip_address" | "formatted_date";
};

/** The last path segment, with any array indices taken off the end. */
function _fieldName(path: string): string {
  return (path.split(".").pop() ?? "").replace(/(?:\[\d+\])+$/, "");
}

/**
 * Walks a payload and reports anything `conventions.md` § Forbidden in any
 * payload rules out.
 *
 * Three of the six rules in that section are checkable mechanically: a raw
 * storage key, an IP address, and a formatted or relative date string. The
 * other three (a count served from a stored column, a `memberId` in the people
 * directory, a field distinguishing an empty archive from an invisible one)
 * are about where a number came from rather than what it looks like, and no
 * scanner can see that.
 *
 * It walks objects and arrays to any depth, and reports the path it found a
 * value at so a failure names the field rather than the payload.
 *
 * A URL is exempt from the storage-key rule: every payload carries one by
 * design, and it is a signed or absolute URL rather than a key.
 *
 * **This is a test helper and not a runtime check**, for a specific reason. A
 * scanner strict enough to catch "14 September 2026" also catches it inside a
 * comment body, which `CommentEmailPayload` carries verbatim by design, so a
 * runtime version would throw on a legitimate message. It runs over payloads
 * the templates build, and skips the fields the contract documents as
 * somebody's own words.
 *
 * @param payload Anything JSON-shaped. Numbers, booleans and null are ignored:
 *   every rule here is about the shape of a string.
 * @param path Where in the payload this value sits. Callers leave it empty.
 */
export function findForbiddenPayloadValues(
  payload: unknown,
  path = "",
): readonly ForbiddenPayloadValue[] {
  if (typeof payload === "string") {
    if (VERBATIM_FIELDS.includes(_fieldName(path))) {
      return [];
    }
    const isUrl = /^https?:\/\//i.test(payload);
    const found: Array<ForbiddenPayloadValue | undefined> = [
      !isUrl && STORAGE_KEY.test(payload)
        ? { path, value: payload, reason: "storage_key" }
        : undefined,
      !isUrl && IP_ADDRESS.test(payload)
        ? { path, value: payload, reason: "ip_address" }
        : undefined,
      FORMATTED_DATE.test(payload)
        ? { path, value: payload, reason: "formatted_date" }
        : undefined,
    ];
    return found.filter((entry) => {
      return entry !== undefined;
    });
  }

  if (Array.isArray(payload)) {
    return payload.flatMap((entry, index) => {
      return findForbiddenPayloadValues(entry, `${path}[${index}]`);
    });
  }

  if (typeof payload === "object" && payload !== null) {
    return Object.entries(payload).flatMap(([key, value]) => {
      return findForbiddenPayloadValues(
        value,
        path === "" ? key : `${path}.${key}`,
      );
    });
  }

  return [];
}
