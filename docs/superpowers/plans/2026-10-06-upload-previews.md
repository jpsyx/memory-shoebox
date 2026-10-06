# Upload previews repair plan

> Use executing-plans to implement and verify this bounded repair.

**Goal:** Valid selected JPEG, HEIC and MOV files show draft previews on their first selection, including a cold development server.

**Architecture:** Keep the existing browser-owned originals, viewport preview queue and media worker. Prebundle worker-only dependencies before selection so Vite cannot reload away the originals. Reuse a small JPEG original when the upload derivative policy correctly skips its thumbnail. Distinguish pending preparation, missing originals and real decode failures.

**Tech stack:** React, Vite, browser image/video decoders, libheif, Playwright and Vitest.

**Scope:** Upload preview queue, print fallback state, Vite dependency optimization, their tests and docs/web.md. No catalog or server contract changes. Work in fix/upload-previews, then merge to main and remove the branch and worktree as authorized.

## Verification and implementation

1. Add isolated production and cold-development browser tests using real JPEG, HEIC, MP4 and MOV files, and a small JPEG. Assert each image decodes; the cold development page must not reload or ask for the files again. Watch the cold-development and small-JPEG cases fail before implementing.
2. Cover the small-JPEG queue fallback and initial print state with focused tests. Watch them fail. Include an actual failed decode to preserve its fallback.
3. Prebundle hash-wasm and the libheif glue in development; retain lazy worker loading. Use the original small JPEG only after a successful decode whose derivative plan needs no thumbnail. Show preparation copy before an attempt, and file re-selection copy when the original is absent.
4. Update the preview documentation, run focused tests and the full pnpm check, capture browser evidence, and obtain a fresh code review.
5. Commit, merge the verified branch to main, verify the merge and remove owned temporary files, processes, worktree and branch.
