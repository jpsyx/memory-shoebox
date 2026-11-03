# Daily digest implementation record

The feature is implemented on `feat/daily-digests`. Production has not been
changed. The one-time reset applies when migration `0022_daily_digests` runs
against a catalog during a later deployment.

## Delivered behavior

| Category             | Default      | Available choices            |
| -------------------- | ------------ | ---------------------------- |
| New photos/videos    | Daily digest | Off, Immediate, Daily digest |
| Comments and replies | Daily digest | Off, Immediate, Daily digest |
| Comment tags         | Immediate    | Off, Immediate, Daily digest |

Daily delivery combines overdue activity into one email around 9 a.m. in the
Shoebox timezone. Empty days send nothing. There is no weekly activity digest;
removal preferences and existing removal reminders remain unchanged. Every
existing member receives the requested defaults once, including previous
opt-outs. Later user preference changes survive restarts.

## Verification

- Final post-review `pnpm check` passed: formatting, lint, types, build, and
  5,714 tests (302 root, 370 shared, 64 email, 2,504 web, and 2,474 server).
  Seven existing server tests remain skipped.
- Four browser tests passed: persisted choices, bulk defaults, native keyboard
  typeahead, tag-link focus, mobile layout, and zoom/reflow behavior.
- Local HTML/plain-text email rendering and phone/desktop settings were inspected.
- All email checks used local databases and fake or recording delivery. No real
  emails, production updates, pushes, merges, or deployments were performed.

The regressions exercise migration of opt-outs and configuration-deferred mail,
strict account writes, atomic preference cancellation, mixed tag/comment modes,
permanent tag deduplication, daily timing, timezone edits, real midnight cutoffs
in Kathmandu and Santiago, overflow counts and Unicode excerpts, independent
SQLite connection races, transaction rollback, current visibility, rendering
races, retry membership revocation, exact request reuse, configuration recovery,
and preservation of stranded sending rows after provider intent.

## Independent review and fixes

One fresh-context review covered the whole branch. All three findings were
reproduced with failing tests before their fixes:

| Finding                                                           | Correction                                                                                  | Regression result                                                     |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Retry authorization could use membership changed during its reads | Final eligibility and cancellation now run in an immediate transaction before retry handoff | Two provider calls before the fix; one call and cancellation after it |
| Never-attempted configuration-deferred mail missed migration      | Safe conversion admits the two known pre-handoff configuration errors                       | Missing digest events before the fix; correct conversion afterward    |
| Tag-save copy hid reload guidance                                 | The field retains the supplied specific failure text                                        | Generic retry copy before the fix; reload guidance afterward          |

The reviewer declined to judge no behaviors and reported no deferred minor
findings. Additional recommended coverage for midnight boundaries and the
provider-intent crash state was added. No second review was requested; fixes are
verified by their red/green regressions and the final suite.

## Implementation decisions

These are the native execution rulings, in order:

| Decision                                                                                                           | Reason                                                             | Cost if wrong                                          |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------ |
| Reuse `EnqueueEmailInput` for activity routing                                                                     | Preserve current caller payloads and idempotency keys              | Internal interface adjustment; no HTTP contract change |
| Keep digest-prefixed tests directly in `test/mail`                                                                 | Match nearby queue tests                                           | Test-file organization only                            |
| Page recipients by 50 and event references by 500; retain source manifests and capped excerpts through aggregation | Keep the existing SQLite flow straightforward for a family catalog | Memory grows with unusually large outage backlogs      |
| Group tasks 3-8 in one commit after storage and template work                                                      | Avoid intermediate web/server incompatibility                      | A larger unit when bisecting                           |

The original implementation plan's checklists are retained as the planned
sequence. This record documents the completed behavior, actual verification,
file-layout substitution, and commit grouping.
