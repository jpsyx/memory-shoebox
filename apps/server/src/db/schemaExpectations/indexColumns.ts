import type { IndexColumn } from "../introspect.ts";

/**
 * One index's columns, written the way `data-models.md` writes them.
 *
 * `indexColumns("captured_on desc", "visibility_rule_id", "id")` transcribes
 * the document's `(captured_on DESC, visibility_rule_id, id)` one for one. A
 * bare name is ascending, which is both SQLite's default and what the
 * document's silence means.
 *
 * A helper rather than sixty-three hand-written object literals, because what
 * a reader checks against the document is the tuple, and an object per column
 * buries it. Anything other than an exact `" desc"` suffix throws while this
 * module loads, so a mistyped direction is a test that cannot start rather
 * than a column quietly asserting ascending.
 */
export function indexColumns(
  ...declarations: readonly string[]
): readonly IndexColumn[] {
  return declarations.map((declaration) => {
    const [name, keyword, ...rest] = declaration.split(" ");
    if (name === undefined || name === "" || rest.length > 0) {
      throw new Error(`Unreadable index column: "${declaration}"`);
    }
    if (keyword === undefined) {
      return { name, direction: "asc" } satisfies IndexColumn;
    }
    if (keyword !== "desc") {
      throw new Error(`Unknown index column direction: "${declaration}"`);
    }
    return { name, direction: "desc" } satisfies IndexColumn;
  });
}
