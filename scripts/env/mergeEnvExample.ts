/**
 * A line that sets a variable: `KEY=`, `KEY=value`, or either indented.
 *
 * The first character after any indent must start an identifier, which is what
 * keeps a commented-out `# KEY=value` from counting as a key that is set. That
 * matters both ways round: a commented example line should still be brought
 * across as prose, and a commented local line should not be mistaken for a
 * value somebody has filled in.
 */
const KEY_LINE = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/;

/** A comment line, which is how every explanation in these files is written. */
const COMMENT_LINE = /^\s*#/;

/** How wide the section dividers in `.env.example` run. */
const DIVIDER_WIDTH = 74;

/** One variable, with the comment lines that explain it. */
export type EnvKeyBlock = {
  name: string;
  /** The comments directly above it, then the key line itself, last. */
  lines: string[];
};

/** A merged file, and what the merge brought into it. */
export type EnvMergeResult = {
  /** The new contents. Identical to the old ones when nothing was added. */
  contents: string;
  /** The keys brought across, in the order the example declares them. */
  addedKeys: string[];
};

/**
 * Every variable in an environment file, each with its own explanation.
 *
 * **A blank line ends a comment block.** Comments directly above a key belong
 * to that key and travel with it; a note separated from it by a blank line
 * belongs to the file, which is why the header of `.env.example` is not
 * dragged along every time one key is added.
 *
 * @param contents A whole `.env` style file.
 * @returns One block per key that the file sets, in declaration order.
 */
export function getKeyBlocksFromEnv(contents: string): EnvKeyBlock[] {
  const blocks: EnvKeyBlock[] = [];
  let comments: string[] = [];

  contents.split("\n").forEach((line) => {
    const keyMatch = KEY_LINE.exec(line);
    if (keyMatch !== null) {
      blocks.push({ name: keyMatch[1] ?? "", lines: [...comments, line] });
      comments = [];
      return;
    }
    comments = COMMENT_LINE.test(line) ? [...comments, line] : [];
  });

  return blocks;
}

/** A section divider in the same shape the example files already use. */
function _divider(text: string): string {
  return `# --- ${text} `.padEnd(DIVIDER_WIDTH, "-");
}

/**
 * Adds whatever the example has gained, and changes nothing that is there.
 *
 * **Values are never touched, and neither is the order of what is already in
 * the file.** New blocks are appended under a divider saying where they came
 * from, rather than being threaded into the example's own positions: a merge
 * that rewrote the file would risk a filled-in secret for the sake of tidiness,
 * and appending is the one shape that cannot.
 *
 * Idempotent, because a key is looked up by name: merging twice adds nothing
 * the second time.
 *
 * @param options.example The committed template, with every key.
 * @param options.local The file somebody has been filling in, possibly empty.
 * @param options.exampleLabel The example's path, named in the divider.
 * @returns The merged contents and the keys that were added.
 */
export function makeMergedEnvFromExample(
  options: Readonly<{ example: string; local: string; exampleLabel: string }>,
): EnvMergeResult {
  const alreadySet = new Set(
    getKeyBlocksFromEnv(options.local).map((block) => {
      return block.name;
    }),
  );
  const missing = getKeyBlocksFromEnv(options.example).filter((block) => {
    return !alreadySet.has(block.name);
  });

  if (missing.length === 0) {
    return { contents: options.local, addedKeys: [] };
  }

  const blocks = missing
    .map((block) => {
      return block.lines.join("\n");
    })
    .join("\n\n");
  const heading = _divider(
    `Added by pnpm reset-env from ${options.exampleLabel}`,
  );
  const existing = options.local.replace(/\s*$/, "");
  const preamble = existing === "" ? "" : `${existing}\n\n`;

  return {
    contents: `${preamble}${heading}\n\n${blocks}\n`,
    addedKeys: missing.map((block) => {
      return block.name;
    }),
  };
}
