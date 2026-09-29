/**
 * A name as `tags.name_normalized` holds it: trimmed, lowercased,
 * whitespace-collapsed, NFC.
 *
 * The column exists so that "Hospital" and "hospital" are one tag, and this is
 * the same rule applied to the search term and to a person's display name,
 * which has no normalised column of its own.
 *
 * `toLocaleLowerCase` rather than `toLowerCase`, and NFC before it, because
 * the vocabulary is a family's own words: "Sofía" and "Papá" have to fold the
 * way SQLite's ASCII-only `LIKE` would not. Accents are kept rather than
 * stripped, so "sofia" does not match "Sofía": folding case is what the
 * contract asks for, and stripping accents is a different decision that
 * nothing has made.
 *
 * @param name The name as somebody typed it.
 */
export function makeNormalisedNameFromName(name: string): string {
  return name.normalize("NFC").trim().toLocaleLowerCase().replace(/\s+/g, " ");
}
