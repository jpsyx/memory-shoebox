/**
 * A name as the archive compares it: trimmed, composed (NFC) and lower-cased.
 *
 * "Sofía" typed on one keyboard and on another can differ in how the accent
 * is encoded, and "mateo" and "Mateo" are the same boy, so both pairs are
 * one name here. The people field uses it to tell a name it already offers
 * from one being invented, and the item page to match a name to a person.
 */
export function makeNameKeyFromName(name: string): string {
  return name.trim().normalize("NFC").toLowerCase();
}
