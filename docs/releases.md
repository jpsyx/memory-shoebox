# Releases

Memory Shoebox deploys as one product. The root package and the four product
packages always share a version. `package.json` at the repository root is the
authoritative deployed version; do not manually bump individual packages.

## Version policy

The first automatic release is **1.0.0**. Every subsequent unreleased push to
`main` causes at least a patch release. The workflow reads every commit since
the previous stable `vX.Y.Z` tag and chooses the highest matching increment:

| Commit in the range                                                                                                 | Increment |
| ------------------------------------------------------------------------------------------------------------------- | --------- |
| Conventional Commit `!`, such as `feat(api)!: change contract`, or a `BREAKING CHANGE:` / `BREAKING-CHANGE:` footer | Major     |
| `feat:` or `feat(scope):`                                                                                           | Minor     |
| Everything else, including fixes, documentation, and nonconventional commits                                        | Patch     |

Release notes list every commit in that range. Preserve meaningful commit
messages when merging work so the automatic policy has the intended input.
No npm package publication or deployment is performed by this workflow.

## Checked publication

`.github/workflows/release.yml` runs on main pushes and can be rerun manually.
The queue serializes writers using `queue: max` and does not cancel an active
release. A run fetches current main, synchronizes all five manifests in a
`chore(release): vX.Y.Z` commit, and checks **that exact commit** with `pnpm check`
and a Docker production image build. The image uses a temporary empty web env
BuildKit secret (`web_env`) with its `WEB_ENV_DIGEST` cache argument. Browser
installation ensures PDF tests run in CI. No production credentials are needed.

A run may batch later pushes that reached main before it selected its candidate.
Queued runs whose triggering commit is already covered by a release repair any
missing publication and then exit without another bump. Release notes cover the
cumulative range, rather than promising one tag for each intermediate push.
GitHub currently queues up to 100 waiting runs; manual dispatch provides recovery
if a run is canceled when the queue is full.

After checks, the CLI verifies remote main still equals the selected source and
atomically pushes the version commit and annotated tag. It never force pushes.
The normal non-fast-forward rejection protects the final race after the remote
comparison. The GitHub Release targets the tag's exact version commit. Pushes
using the workflow's `GITHUB_TOKEN` do not recursively start Actions.

## Repository permissions and recovery

The release job requires `contents: write`; other jobs retain read permissions.
In repository **Settings → Actions → General → Workflow permissions**, ensure
repository or organization policy allows the job's requested write permission.
Main and `v*` tag rules must permit the Actions release identity to push the
version commit and create tags directly. In **Settings → Rules → Rulesets**, check
the rules targeting main and release tags, including required pull requests,
status checks, signed commits, restricted updates and tag creation. Configure a
supported bypass actor or adjust the release policy with an administrator.
Legacy branch protection is under **Settings → Branches**. Some policies cannot
be bypassed by the built-in token; this workflow fails safely rather than using
an undocumented token or overriding protection. Keep human pushes protected.

If checks fail, neither main nor the tag is published. If main advances during
checks or an atomic push is rejected, rerun the Release workflow from **Actions →
Release → Run workflow** (branch `main`) after resolving any policy restriction.
The next run fetches, recomputes and checks a new candidate. It does not reuse the
previous run's checks for newer code.

If the atomic push succeeds but the GitHub API fails, **do not delete the tag or
bump the manifests manually**. Rerun the failed workflow or dispatch Release on
main. Annotated automatic tags contain source/range metadata; the CLI validates
these tags against their version commits, then repairs missing GitHub Releases
before selecting any new version. An authorization or server failure is not
mistaken for a missing release. Tags outside main history are not release
baselines. Manually created stable tags can establish a baseline, but only
marked automatic tags participate in publication repair.

Run `pnpm exec vitest run scripts/release` locally to exercise the policy and
publication recovery against temporary bare Git repositories and a fake API.
The publication CLI refuses to run outside GitHub Actions. Tests never push to
GitHub or create real Releases.

References: [GitHub concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency),
[GitHub token](https://docs.github.com/en/actions/concepts/security/github_token),
[atomic Git push](https://git-scm.com/docs/git-push).
