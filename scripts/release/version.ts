/** Stable SemVer versions supported by the synchronized product manifests. */
export const VERSION_PATTERN: RegExp =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/** Select the automatic version from every commit in the released range. */
export function getVersionFromCommits(options: {
  previousVersion?: string;
  messages: string[];
}): string {
  const { previousVersion, messages } = options;
  if (previousVersion === undefined) {
    return "1.0.0";
  }
  if (!VERSION_PATTERN.test(previousVersion)) {
    throw new Error(`Unsupported release version: ${previousVersion}`);
  }
  const [major = 0, minor = 0, patch = 0] = previousVersion
    .split(".")
    .map(Number);
  const hasBreakingChange = messages.some((message) => {
    return (
      /^[a-z]+(?:\([^\r\n]+\))?!:/.test(message) ||
      /^BREAKING[ -]CHANGE:\s/m.test(message)
    );
  });
  if (hasBreakingChange) {
    return `${major + 1}.0.0`;
  }
  if (
    messages.some((message) => {
      return /^feat(?:\([^\r\n]+\))?:/.test(message);
    })
  ) {
    return `${major}.${minor + 1}.0`;
  }
  return `${major}.${minor}.${patch + 1}`;
}
