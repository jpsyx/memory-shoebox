/** The chosen public name, or a neutral label that discloses no address. */
export function getDisplayNameFromMember(options: {
  storedDisplayName: string | undefined;
  email: string;
}): string {
  return options.storedDisplayName?.trim() || "Member";
}
