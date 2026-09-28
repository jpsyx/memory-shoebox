/**
 * The name the rest of the product shows for a member.
 *
 * Decision 1: `members.display_name` is set by whoever invited them and is
 * correctable by the member, and it **falls back to the email local part**
 * when it is null. The raw column travels beside this in `MeDto` as
 * `storedDisplayName`, so the account form can show the fallback as a
 * placeholder rather than as text somebody appears to have typed.
 *
 * @param options.storedDisplayName The raw `display_name` column.
 * @param options.email The member's address.
 */
export function getDisplayNameFromMember(options: {
  storedDisplayName: string | null;
  email: string;
}): string {
  const stored = options.storedDisplayName?.trim() ?? "";
  if (stored !== "") {
    return stored;
  }
  const [localPart] = options.email.split("@");
  return localPart === undefined || localPart === ""
    ? options.email
    : localPart;
}
