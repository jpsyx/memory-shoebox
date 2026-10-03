import { makeNameKeyFromName } from "@/system/PeopleField/makeNameKeyFromName/makeNameKeyFromName";

/** A list of names as keys, in order, with the empty ones left out. */
function _keysOf(names: readonly string[]): string[] {
  return names.map(makeNameKeyFromName).filter((key) => {
    return key !== "";
  });
}

/**
 * Whether two lists of names say the same thing, compared as keys.
 *
 * A repeat typed with a comma leaves the list as it was, so it is no change
 * and nothing is saved. A repeat is still counted, though: two people on one
 * item can share a name, and taking one of them off is a change.
 */
export function isSameNameList(
  options: Readonly<{
    names: readonly string[];
    otherNames: readonly string[];
  }>,
): boolean {
  const keys = _keysOf(options.names);
  const otherKeys = _keysOf(options.otherNames);
  return (
    keys.length === otherKeys.length &&
    keys.every((key, index) => {
      return key === otherKeys[index];
    })
  );
}
