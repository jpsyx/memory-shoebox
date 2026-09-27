#!/usr/bin/env sh
# Restores the locked agent skills after `pnpm install`.
#
# The skip check lives in this shell wrapper rather than inside the TypeScript
# CLI because the CLI runs through `tsx`, which is a dev dependency. A
# production install (`pnpm install --prod`, which the Docker image runs) has
# no `tsx` on disk, so the hook has to decide whether to skip *before* it tries
# to run anything. The variables and their meaning match `_findSkipReason` in
# syncSkills.ts: set but neither empty nor "false".
set -e

_is_enabled() {
  [ -n "$1" ] && [ "$1" != "false" ]
}

if _is_enabled "$CI" || _is_enabled "$SKIP_SKILLS_INSTALL"; then
  exit 0
fi

tsx scripts/skills/SkillsCli.ts install --quiet

# Skills this repository writes itself. No manager knows about them, and
# `npx skills` owns `.agents/skills/`, so this has to run after it.
exec sh scripts/skills/install-local-skills.sh
