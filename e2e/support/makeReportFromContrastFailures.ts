import type { ContrastFailure } from "./getContrastFailuresFromPage/getContrastFailuresFromPage.ts";

/**
 * The failures, as something somebody can act on from CI output alone.
 *
 * **A bare "contrast failed" would make this test worse than no test**: the
 * run that catches a regression is usually not the run somebody is watching,
 * and a reader who has to reproduce it locally before they know what broke
 * will disable it instead. So every line carries the words on screen, the two
 * colours as painted, the ratio, and what it needed.
 *
 * @param options.where Which view was swept, in the words the spec uses.
 * @param options.failures What the sweep found, which must not be empty.
 * @returns The message to fail with.
 */
export function makeReportFromContrastFailures(options: {
  where: string;
  failures: readonly ContrastFailure[];
}): string {
  const { where, failures } = options;
  const lines = failures.map((failure) => {
    return (
      `  ${failure.ratio}:1 needs ${failure.required}:1 ` +
      `(${failure.fontSizePx}px, weight ${failure.fontWeight})\n` +
      `    ${failure.color} on ${failure.background}\n` +
      `    "${failure.text}"\n` +
      `    ${failure.selector}`
    );
  });
  return (
    `${failures.length} element${failures.length === 1 ? "" : "s"} ` +
    `below WCAG AA on ${where}:\n${lines.join("\n")}`
  );
}
