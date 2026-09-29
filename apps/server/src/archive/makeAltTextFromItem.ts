/**
 * The one formatted date any payload in this contract carries.
 *
 * It is unavoidable: a screen reader needs prose, not an ISO timestamp. The
 * locale is not negotiable per reader, because the string is composed
 * server-side and the reader's own locale cannot reach it, and the product
 * ships one language (`items.md` Ruling 4). Formatters are expensive to build
 * and there are at most a handful of zones in play, so they are kept.
 */
const formatters = new Map<string, Intl.DateTimeFormat>();

function _formatterFor(timezone: string): Intl.DateTimeFormat {
  const existing = formatters.get(timezone);
  if (existing !== undefined) {
    return existing;
  }
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  formatters.set(timezone, formatter);
  return formatter;
}

/** "Mateo", "Mateo and Papá", "Mateo, Papá and Mamá". */
function _joinNames(names: readonly string[]): string {
  const last = names[names.length - 1] ?? "";
  return names.length < 2
    ? last
    : `${names.slice(0, -1).join(", ")} and ${last}`;
}

/**
 * The alt text one item is served with. Never null, always composed here.
 *
 * `items.alt_text` wins outright when somebody has typed a real description.
 * Otherwise it is the people in tagging order and then the capture date:
 * "Mateo, Papá and Mamá, 14 September 2026", or the date alone when nobody is
 * tagged (Decision 9).
 *
 * @param options.altTextOverride `items.alt_text`, usually null.
 * @param options.personNames The people tagged, in `tagged_at` order.
 * @param options.capturedAt The instant the shutter fired.
 * @param options.timezone The `shoebox.timezone` setting.
 */
export function makeAltTextFromItem(options: {
  altTextOverride: string | null;
  personNames: readonly string[];
  capturedAt: string;
  timezone: string;
}): string {
  const override = options.altTextOverride?.trim() ?? "";
  if (override !== "") {
    return override;
  }

  const day = _formatterFor(options.timezone).format(
    new Date(options.capturedAt),
  );
  return options.personNames.length === 0
    ? day
    : `${_joinNames(options.personNames)}, ${day}`;
}
