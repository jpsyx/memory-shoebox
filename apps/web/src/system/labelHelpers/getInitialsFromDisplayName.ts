/** Initials are derived from the member's actual display name. */
export function getInitialsFromDisplayName(displayName: string): string {
  return displayName
    .trim()
    .split(/\s+/u)
    .slice(0, 2)
    .map((name) => {
      return Array.from(name)[0] ?? "";
    })
    .join("")
    .toLocaleUpperCase();
}
