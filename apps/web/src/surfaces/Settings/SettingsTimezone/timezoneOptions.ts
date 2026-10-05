/**
 * Full timezone choices from the browser's own IANA database, plus stored
 * aliases and UTC.
 */
export function getTimezoneOptionsFromCurrentZone(
  currentZone: string,
): string[] {
  return [
    ...new Set(["UTC", currentZone, ...Intl.supportedValuesOf("timeZone")]),
  ].sort();
}
