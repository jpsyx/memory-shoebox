#!/usr/bin/env bash
#
# Installs this repository's own skills into every agent frontend.
#
# Skills in `skills/` are written here rather than vendored from somewhere
# else, so no skill manager knows about them: `npx skills` installs what is in
# `skills-lock.json`, and a locally authored skill is in neither the lock nor
# any registry. This script is what puts them where an agent will find them.
#
# It copies the real directory into `.agents/skills/<name>`, which is the
# cross-runtime location Codex, Cursor and OpenCode read natively, and then
# symlinks that into each frontend that wants its own directory. That is the
# same shape `npx skills` produces, so the two coexist and a frontend sees one
# consistent set.
#
# A copy rather than a symlink into `skills/`, because a symlink pointing
# outside the frontend directory confuses some runtimes. Re-run this after
# editing a skill; `pnpm skills` reports what is installed.

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_ROOT"

SOURCE_DIR="skills"

# Every frontend that reads a per-frontend skills directory. `.agents/skills`
# is not in this list because it holds the real copy the others point at.
FRONTEND_SKILL_DIRS=(
  ".claude/skills"
  ".cursor/skills"
  ".opencode/skill"
)

if [ ! -d "$SOURCE_DIR" ]; then
  echo "No $SOURCE_DIR directory: this project has no skills of its own."
  exit 0
fi

shopt -s nullglob
skill_paths=("$SOURCE_DIR"/*/)
shopt -u nullglob

if [ ${#skill_paths[@]} -eq 0 ]; then
  echo "No skills in $SOURCE_DIR."
  exit 0
fi

mkdir -p .agents/skills

for skill_path in "${skill_paths[@]}"; do
  name="$(basename "$skill_path")"

  if [ ! -f "$skill_path/SKILL.md" ]; then
    echo "  skip $name: no SKILL.md"
    continue
  fi

  # Replace rather than merge, so a file deleted from the source is deleted
  # from the install rather than lingering and being read as current.
  rm -rf ".agents/skills/$name"
  cp -R "$skill_path" ".agents/skills/$name"
  echo "  .agents/skills/$name"

  for frontend_dir in "${FRONTEND_SKILL_DIRS[@]}"; do
    # Only fan out to a frontend this project actually uses. Creating the
    # directory would tell a runtime to look somewhere nothing else writes.
    parent="$(dirname "$frontend_dir")"
    [ -d "$parent" ] || continue

    mkdir -p "$frontend_dir"
    rm -rf "${frontend_dir:?}/$name"

    # Relative, so it survives the repository being cloned anywhere, and
    # resolves the same inside a worktree as in the main checkout.
    depth="$(echo "$frontend_dir" | tr -cd '/' | wc -c | tr -d ' ')"
    prefix=""
    for _ in $(seq 0 "$depth"); do prefix="../$prefix"; done

    ln -s "${prefix}.agents/skills/$name" "$frontend_dir/$name"
    echo "  $frontend_dir/$name -> .agents/skills/$name"
  done
done

echo
echo "Done. Run 'pnpm skills' to see everything installed."
