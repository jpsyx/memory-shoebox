/**
 * A name as the archive compares it: composed (NFC), trimmed, lower-cased and
 * whitespace-collapsed, the rule `makeNormalisedNameFromName` applies on the
 * server.
 *
 * "Sofía" typed on one keyboard and on another can differ in how the accent
 * is encoded, and "mateo" and "Mateo" are the same boy, so both pairs are
 * one name here. The people field uses it to tell a name it already offers
 * from one being invented, and the item page to match a name to a person.
 *
 * `toLowerCase` rather than the server's `toLocaleLowerCase`: in a browser
 * the locale is the reader's, and a key that changed with it would not be
 * one key.
 */
export function makeNameKeyFromName(name: string): string {
  return name.normalize("NFC").trim().toLowerCase().replace(/\s+/g, " ");
}
