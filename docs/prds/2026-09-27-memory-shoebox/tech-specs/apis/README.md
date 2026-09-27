# The API contract

Every route Memory Shoebox needs, derived from the seventeen surfaces in
[`design-spec.md`](../../design-spec.md) and the schema in [`data-models.md`](../data-models.md).
Written so that a future agent can build either half against it without
re-deriving anything.

**Read [`conventions.md`](conventions.md) first.** It is binding on every route
here and it wins wherever a slice disagrees with it: paths, the envelope,
pagination, field naming, the frozen DTOs, the error shape and the absolute
404-never-403 rule, the visibility predicate, who may change an item, the auth
middleware, rate limits, the six background jobs, and `SETTING_DEFINITIONS`.

## The slices

| Slice                               | What it covers                                        | Surfaces   |
| ----------------------------------- | ----------------------------------------------------- | ---------- |
| [auth](auth.md)                     | Sign in, sessions, and a member's own account         | 1, 9       |
| [timeline](timeline.md)             | Reading the archive: the pile, filters, the directory | 2, 5, 6, 7 |
| [items](items.md)                   | One item: comments, reactions, edits, deletion        | 3, 4       |
| [upload](upload.md)                 | The upload session, from manifest to settled          | 8          |
| [removals](removals.md)             | Removal requests, from asking to settled              | 10, 15     |
| [administration](administration.md) | Members, invitations, groups, Shoebox settings        | 11, 12, 13 |
| [milestones](milestones.md)         | Milestones, attachment and reconciliation             | 14         |
| [notifications](notifications.md)   | The email contract, presence and audit                | 16, 17     |

## Every route, by path

77 routes. Sorted by path, so a duplicate would sit on the line below
its twin. There are none.

| Method   | Path                                                     | Slice                               |
| -------- | -------------------------------------------------------- | ----------------------------------- |
| `GET`    | `/api/activity`                                          | [notifications](notifications.md)   |
| `POST`   | `/api/auth/session`                                      | [auth](auth.md)                     |
| `DELETE` | `/api/auth/session`                                      | [auth](auth.md)                     |
| `POST`   | `/api/auth/sign-in-codes`                                | [auth](auth.md)                     |
| `POST`   | `/api/auth/sign-in-codes/resend`                         | [auth](auth.md)                     |
| `GET`    | `/api/bursts/:burstId/frames`                            | [items](items.md)                   |
| `PATCH`  | `/api/comments/:commentId`                               | [items](items.md)                   |
| `DELETE` | `/api/comments/:commentId`                               | [items](items.md)                   |
| `PUT`    | `/api/comments/:commentId/reaction`                      | [items](items.md)                   |
| `DELETE` | `/api/comments/:commentId/reaction`                      | [items](items.md)                   |
| `GET`    | `/api/filters/facets`                                    | [timeline](timeline.md)             |
| `GET`    | `/api/groups`                                            | [administration](administration.md) |
| `POST`   | `/api/groups`                                            | [administration](administration.md) |
| `PATCH`  | `/api/groups/:groupId`                                   | [administration](administration.md) |
| `DELETE` | `/api/groups/:groupId`                                   | [administration](administration.md) |
| `PUT`    | `/api/groups/:groupId/members`                           | [administration](administration.md) |
| `GET`    | `/api/groups/:groupId/usage`                             | [administration](administration.md) |
| `GET`    | `/api/items/:itemId`                                     | [items](items.md)                   |
| `PATCH`  | `/api/items/:itemId`                                     | [items](items.md)                   |
| `DELETE` | `/api/items/:itemId`                                     | [items](items.md)                   |
| `POST`   | `/api/items/:itemId/capture-date`                        | [items](items.md)                   |
| `POST`   | `/api/items/:itemId/comments`                            | [items](items.md)                   |
| `PUT`    | `/api/items/:itemId/people`                              | [items](items.md)                   |
| `PUT`    | `/api/items/:itemId/reaction`                            | [items](items.md)                   |
| `DELETE` | `/api/items/:itemId/reaction`                            | [items](items.md)                   |
| `GET`    | `/api/items/:itemId/removal-requests`                    | [removals](removals.md)             |
| `POST`   | `/api/items/:itemId/removal-requests`                    | [removals](removals.md)             |
| `PUT`    | `/api/items/:itemId/tags`                                | [items](items.md)                   |
| `GET`    | `/api/items/:itemId/viewers`                             | [notifications](notifications.md)   |
| `PATCH`  | `/api/items/:itemId/visibility`                          | [items](items.md)                   |
| `POST`   | `/api/items/seen`                                        | [timeline](timeline.md)             |
| `POST`   | `/api/items/visibility`                                  | [items](items.md)                   |
| `GET`    | `/api/mail/health`                                       | [notifications](notifications.md)   |
| `GET`    | `/api/me`                                                | [auth](auth.md)                     |
| `PATCH`  | `/api/me`                                                | [auth](auth.md)                     |
| `GET`    | `/api/me/sessions`                                       | [auth](auth.md)                     |
| `DELETE` | `/api/me/sessions/:sessionId`                            | [auth](auth.md)                     |
| `GET`    | `/api/member-suggestions`                                | [administration](administration.md) |
| `GET`    | `/api/members`                                           | [administration](administration.md) |
| `POST`   | `/api/members`                                           | [administration](administration.md) |
| `PATCH`  | `/api/members/:memberId`                                 | [administration](administration.md) |
| `DELETE` | `/api/members/:memberId`                                 | [administration](administration.md) |
| `DELETE` | `/api/members/:memberId/invitation`                      | [administration](administration.md) |
| `POST`   | `/api/members/:memberId/invitation/resend`               | [administration](administration.md) |
| `DELETE` | `/api/members/:memberId/sessions/:sessionId`             | [administration](administration.md) |
| `GET`    | `/api/milestones`                                        | [milestones](milestones.md)         |
| `POST`   | `/api/milestones`                                        | [milestones](milestones.md)         |
| `GET`    | `/api/milestones/:milestoneId`                           | [milestones](milestones.md)         |
| `PATCH`  | `/api/milestones/:milestoneId`                           | [milestones](milestones.md)         |
| `DELETE` | `/api/milestones/:milestoneId`                           | [milestones](milestones.md)         |
| `GET`    | `/api/milestones/:milestoneId/candidates`                | [milestones](milestones.md)         |
| `PATCH`  | `/api/milestones/:milestoneId/items`                     | [milestones](milestones.md)         |
| `GET`    | `/api/milestones/:milestoneId/mismatches`                | [milestones](milestones.md)         |
| `POST`   | `/api/milestones/:milestoneId/reconcile`                 | [milestones](milestones.md)         |
| `GET`    | `/api/people`                                            | [timeline](timeline.md)             |
| `GET`    | `/api/presence`                                          | [notifications](notifications.md)   |
| `GET`    | `/api/removal-requests`                                  | [removals](removals.md)             |
| `POST`   | `/api/removal-requests/:requestId/decline`               | [removals](removals.md)             |
| `POST`   | `/api/removal-requests/:requestId/withdraw`              | [removals](removals.md)             |
| `GET`    | `/api/settings`                                          | [administration](administration.md) |
| `PATCH`  | `/api/settings`                                          | [administration](administration.md) |
| `GET`    | `/api/tags`                                              | [timeline](timeline.md)             |
| `GET`    | `/api/timeline`                                          | [timeline](timeline.md)             |
| `GET`    | `/api/timeline/rail`                                     | [timeline](timeline.md)             |
| `POST`   | `/api/upload-sessions`                                   | [upload](upload.md)                 |
| `GET`    | `/api/upload-sessions/:sessionId`                        | [upload](upload.md)                 |
| `DELETE` | `/api/upload-sessions/:sessionId`                        | [upload](upload.md)                 |
| `POST`   | `/api/upload-sessions/:sessionId/commit`                 | [upload](upload.md)                 |
| `POST`   | `/api/upload-sessions/:sessionId/edits`                  | [upload](upload.md)                 |
| `DELETE` | `/api/upload-sessions/:sessionId/edits/:editId`          | [upload](upload.md)                 |
| `POST`   | `/api/upload-sessions/:sessionId/files/:fileId/complete` | [upload](upload.md)                 |
| `POST`   | `/api/upload-sessions/:sessionId/files/:fileId/presign`  | [upload](upload.md)                 |
| `POST`   | `/api/upload-sessions/:sessionId/files/:fileId/retry`    | [upload](upload.md)                 |
| `PUT`    | `/api/upload-sessions/:sessionId/manifest`               | [upload](upload.md)                 |
| `PATCH`  | `/api/upload-sessions/:sessionId/visibility`             | [upload](upload.md)                 |
| `GET`    | `/api/upload-sessions/current`                           | [upload](upload.md)                 |
| `POST`   | `/api/visibility-rules/resolve`                          | [items](items.md)                   |

## What is settled here rather than in a slice

Eight documents were written in parallel against one conventions file. These
are the things no single slice could own, and they are in `conventions.md`:

- **The frozen DTOs.** Five slices needed an item shape; eight would have
  produced five. `MediaRef`, `ItemSummary`, `CommentDto` and the rest are
  defined once and composed, never widened inline.
- **404 versus 403**, which is one question and not two: 404 means you may not
  see it, 403 means you can see it and may not do it.
- **Who "uploader" means**, which the spec uses two ways. Destructive or
  access-changing actions belong to the item's uploader; additive ones are open
  to any uploader.
- **The auth middleware**, the visibility predicate, and the
  `visibilityGeneration` cache key that three slices touch from different
  sides.
- **The six background jobs.** None is HTTP and none belongs to a slice, but
  four slices depend on one.

## What the merge changed

Each slice was written blind to the others. Reconciling them changed five
things, all recorded where they were changed:

1. `PATCH /api/milestones/:milestoneId/items` was written as `PUT`. It applies
   a delta, and a replace would silently detach photographs the viewer cannot
   see.
2. 403 was defined as "role only", which was too narrow: a viewer who can see a
   photograph but is not tagged in it is refused by capability, not by role.
3. `201` on create was unspecified and three slices had chosen differently.
4. Two more background jobs were needed, both closing holes rather than tidying
   (see below).
5. `details` gained a third documented use, `attemptsRemaining`.

## Holes the slices found in the schema

Four, all fixed in `data-models.md` rather than worked around here. They are
listed because each was invisible until something had to be built against it:

- **A lapsed or revoked invitation left a signable account.** Decision 2
  removed the invitation token, which made the `members` row the only thing
  granting access, so `invitations` could no longer be the only thing closing
  it. Revoking now runs the member-removal transaction, and an hourly
  `invitation-lapse` job flips expired invitees. `status` alone now decides
  whether an address may sign in.
- **The sign-in code scrub was half a scrub.** The code is deliberately in the
  subject line so it reads off a lock screen, so scrubbing `payload_json` left
  the more exposed copy sitting beside the address it was sent to.
- **The weekly removal reminder fired within the hour.** Week zero is the week
  of the request, so the recipe needed `week_index >= 1`.
- **A pre-ingest date correction froze as though the file had said it**,
  breaking "revert to what the file said". `upload_files` now carries its own
  `original_captured_at`, and ingest copies that.

Two contradictions in the schema were also resolved: `capture_source` has no
`'manual'` member (the hand correction is `'uploader_set'` with
`reason = 'manual'`), and capture dates resolve in `shoebox.timezone`, not the
uploader's browser zone.
