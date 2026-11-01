# Member Avatars Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let every active member choose, crop, replace, and remove their own private profile image.

**Architecture:** Use a bounded Fastify upload distinct from archive uploads, immutable B2 keys, and a database reservation before object writes. Publish with an expected-current-avatar check, and reuse the durable object-deletion drain for abandoned and replaced images.

**Tech Stack:** TypeScript, React, Mantine, TanStack Router/Query, Fastify 5, Kysely/SQLite, Backblaze B2, Zod, Vitest, and Playwright. Use the installed pnpm workspace versions; no framework migration.

**Spec:** [Approved scope](../specs/2026-10-31-comment-tagging-design.md) and [approved UI/UX shape](../specs/2026-10-31-comment-tagging-ux-shape.md). Read both before execution.

**Status:** Implementation, local recovery/resource acceptance, and final workspace/browser checks passed on 2026-10-31. Independent task/whole-branch review and consolidated artifact delivery remain pending in the [verification record](../verification/2026-10-31-comment-tagging.md). Native/assistive limits remain open. Deployment has not run.

## Global Constraints

- Apply the shared execution rules in the [plan index](2026-10-31-comment-tagging-plan.md#execution-rules).
- Accept one still JPEG, PNG, or WebP, at most 10 MiB and 50 megapixels; reject SVG, animation, corrupt bytes, and MIME mismatches.
- Apply orientation and the selected crop, emit 256-by-256 WebP, and retain neither the original nor metadata.
- Logical key: `avatars/<memberId>/<avatarId>.webp`; the existing B2 client adds its environment prefix.
- Every active member, including a viewer, can change only their own avatar. No archive item, upload count, photo tag, or upload email is created.
- Use initials for absent/failed images. Retain historical avatars when account access is removed.

## Review Focus

- Concurrent saves from two tabs: A1/A2 require expected-avatar fencing rather than last response wins.
- A crash after B2 PUT but before publication: A2 tests eventual cleanup without losing the old pointer.
- Orientation, extreme dimensions, animation, and lying MIME: A2 tests decoded bytes and resource limits.
- A removed account or stale signed image URL: A1/A3 test authorized renewal and initials fallback.
- Name save and photo save failing independently: A3 keeps both drafts and their own errors.

---

## File responsibilities and contracts

Server `avatars/` owns reservation, decoding, publication, and signing. Existing
`jobs/` owns cleanup scheduling; existing `b2/` remains the only bucket adapter.
Web `system/MemberAvatar/` owns rendering, while profile photo editing lives under
`surfaces/Account/AvatarEditor/` and is reused during profile completion.

### Task A1: Reservation, publication, and read contracts

**Files:** Create `packages/shared/src/avatars.ts`,
`packages/shared/test/avatars.test.ts`,
`apps/server/src/db/migrations/0020_member_avatars.ts`,
`apps/server/src/avatars/reserveMemberAvatar.ts`,
`apps/server/src/avatars/publishMemberAvatar.ts`,
`apps/server/src/avatars/readMemberAvatars.ts`,
`apps/server/src/routes/memberAvatars.ts`, and
`apps/server/test/avatars/avatarLifecycle.test.ts`.
Modify `packages/shared/src/dtos.ts`, `packages/shared/scripts/sharedExports.json`,
`apps/server/src/db/migrations/migrations.ts`, `db/types/identityAndAccess.types.ts`,
`db/types/db.types.ts`, `db/schemaManifest/identityAndAccess.ts`,
`db/schemaExpectations/identityAndAccess.ts`, `db/schemaExpectations/indexColumns.ts`,
`archive/readMemberRefs.ts`, `members/getMeDtoFromMemberId.ts`, and
`createApp/createApp.ts` under `apps/server/src`. Propagate the signing context in
these existing reader callers (also under `apps/server/src`):
`removals/makeRemovalRequestDtosFromRows.ts`, `items/videoReactionHelpers.ts`,
`items/readItemDetail/readItemDetailParts.ts`, `upload/readUploadSessionDetailHelpers.ts`,
`archive/readItemSummariesByDay.ts`, `items/readItemSummariesByIds/readItemSummaryParts.ts`,
`archive/readItemSummariesByItemIds/readItemSummariesByItemIds.ts`,
`routes/registerMemberRoutes.ts`, `routes/comments.ts`,
`routes/items/itemReactionRoutes.ts`, `routes/items/createItemCommentRoute.ts`,
`routes/auth.ts`, `setup/initializeShoebox.ts`, `routes/me.ts`, and
`routes/bootstrapRoutes.ts`. Update their existing tests/fixtures for the required
nullable field and batched signing, without adding per-comment queries.

**Interfaces:** Define the avatar-reference schema/type in `dtos.ts` above
`memberRefSchema`; `avatars.ts` imports it. This avoids a runtime schema cycle.
Produce `AvatarRef = { avatarId: string; url: string; issuedAt:
string; expiresAt: string }` with signed HTTP(S) URL and shared UUID/timestamp
schemas. Add required `MemberRef.avatar: AvatarRef | null` and use it on `/me`.
Produce `AvatarCrop = { centerX: number; centerY: number; zoom: number }`:
centers in [0,1] after orientation, zoom in [1,8].

| Endpoint                               | Request                                                                       | Result                                                    |
| -------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------- |
| `POST /api/me/avatar-uploads`          | `{ expectedAvatarId: UUID \| null, contentType, byteSize, crop: AvatarCrop }` | 201 `{ avatarId, expiresAt }`                             |
| `PUT /api/me/avatar-uploads/:avatarId` | Raw image bytes with matching Content-Type                                    | 200 `MeResponse` after publication                        |
| `DELETE /api/me/avatar`                | `{ expectedAvatarId: UUID \| null }`                                          | 200 `MeResponse`                                          |
| `GET /api/members/:memberId/avatar`    | Authenticated read; retained member allowed                                   | 200 `{ avatar: AvatarRef \| null }`; unknown ID also null |

Export `ReserveAvatarRequest` and `ReserveAvatarResponse` from `avatars.ts`,
inferred from schemas matching the POST request/result above.

Use `member_avatar_uploads(id PK, member_id FK, storage_key UNIQUE,
expected_avatar_id, crop_json, content_type, declared_byte_size, output_byte_size,
state, expires_at, created_at)` and nullable `members.avatar_id` referencing its
current row. States: `reserved`, `uploading`, `published`, `retired`.
Index `(state, expires_at)` and `member_id`; restrict deletion of referenced rows.
Reserve for ten minutes, allocate an immutable key, and capture the expected
pointer. Publish/remove in immediate transactions comparing that pointer;
`409 avatar_changed` preserves the newer current image. An owned upload replay
already published as current returns the canonical result without another PUT.
Another member's reservation and a missing one both return 404. Treat
`expected_avatar_id` as a snapshot value, not a foreign key that keeps retired
image rows alive.

Produce `reserveMemberAvatar(options: Readonly<{ database: Kysely<Database>;
memberId: string; body: ReserveAvatarRequest; now: string }>):
Promise<ReserveAvatarResponse>` and `publishMemberAvatar(options: Readonly<{
database: Kysely<Database>; memberId: string; avatarId: string; outputByteSize:
number; now: string }>): Promise<void>`. `readMemberAvatars(options: Readonly<{ database: DatabaseExecutor; b2: B2Client;
memberIds: readonly string[]; now: string }>): Promise<Map<string, AvatarRef>>`
batches metadata, then signs current keys via `b2.presignGet` with a one-hour TTL. Do not use
archive rendition IDs or add avatars to rendition-purpose schemas. Every renewed
reference reports the signature's actual expiry; no signed URL is stored in SQL.

- [x] **Red:** Test the HTTP envelopes, self-ownership, null/unknown reads, and atomic version checks:

```ts
expect(viewerReservation.statusCode).toBe(201);
expect(otherMembersPublicationError.statusCode).toBe(404);
expect(stalePublication.statusCode).toBe(409);
expect(currentAvatarId).toBe(newerAvatarId);
expect(publicAvatarRead.statusCode).toBe(401);
```

Pin rollback when cleanup enqueue fails and preservation of the current image
on a losing publication. Account removal must not queue the historical avatar.

- [x] **Run red:** `pnpm --filter @memory-shoebox/shared test test/avatars.test.ts`; `pnpm --filter @memory-shoebox/server test test/avatars/avatarLifecycle.test.ts`.
- [x] **Green:** Implement schemas, migration, lifecycle actions, signing reader, and JSON routes. A2 supplies the binary PUT handler. Extend `readMemberRefs` to take `{ database, b2, now }` and `getMeDtoFromMemberId` to also require `b2` and `now`; propagate those through their existing callers. Hydrate avatars in the central readers, use null for missing-member fallbacks, and regenerate shared exports.
- [x] **Verify:** Rerun focused tests plus server schema tests and type checks. Update `docs/member-profiles.md`, `docs/shared.md`, and `docs/server.md`.
- [x] **Commit:** `feat: add private avatar ownership and lifecycle`.

### Task A2: Bounded image processing and crash-safe cleanup

**Files:** Create `apps/server/src/avatars/makeAvatarImageFromBytes.ts`,
`apps/server/src/avatars/uploadMemberAvatar.ts`,
`apps/server/src/jobs/runAvatarReservationSweep.ts`,
`apps/server/test/avatars/avatarImage.test.ts`,
`apps/server/test/avatars/avatarUpload.test.ts`, and
`apps/server/test/jobs/avatarReservationSweep.test.ts`.
Modify `apps/server/src/routes/memberAvatars.ts`,
`apps/server/src/http/rateLimit/rateLimit.constants.ts`,
`apps/server/src/upload/isStorageKeyInUse.ts`,
`apps/server/src/jobs/runObjectDeletionDrain.ts`, and
`apps/server/src/jobs/createJobRegistry.ts`,
`apps/server/src/http/ApiError.ts`, and `apps/server/src/http/registerErrorHandler.ts`.

**Interfaces:** Consume A1. Produce `makeAvatarImageFromBytes(options: Readonly<{
bytes: Uint8Array; contentType: string; crop: AvatarCrop }>): Promise<Uint8Array>`
and `uploadMemberAvatar(options: Readonly<{ database: Kysely<Database>; b2:
B2Client; memberId: string; avatarId: string; bytes: Uint8Array; now: string }>):
Promise<void>`. Keep transport parsing outside the pure transform.

Register a route-scoped raw buffer parser and 10 MiB limit, leaving JSON and
archive endpoints unchanged. Validate actual bytes against the declared image
format, reject animation via decoded page count, and enforce Sharp's pixel limit
before raster allocation. Orient first. Crop a square with side
`floor(min(orientedWidth, orientedHeight) / zoom)`, clamping the requested center
so the square stays within the image; reject invalid crop numbers before decode.
Resize to 256 square WebP with metadata omitted. Use a single active avatar
processing slot, no unbounded waiting queue, and `503 avatar_busy` for contention;
limit each member to three upload attempts per five minutes with Retry-After.

Reserve before B2 PUT, atomically move `reserved -> uploading`, and fence all
publication by ID, state, ownership, expiry, and current pointer. Never hold a DB
transaction over decode or B2 I/O. An expired/crashed upload is irreversibly
retired; a late writer cannot publish. Retire and enqueue cleanup on rejection,
replacement, removal, or failure. Extend `isStorageKeyInUse` for current pointers
and live reservations. Sweep expiry hourly and on startup through the existing
job lifecycle. Reuse the deletion drain's late-PUT/retry strategy; a request that
finishes after retirement must enqueue deletion again, even if an earlier delete
saw 404. Do not delete an object still referenced by a published pointer.

- [x] **Red:** Use tiny generated fixtures plus forged metadata/headers and the existing fake B2 seam:

```ts
expect(metadata).toMatchObject({ format: "webp", width: 256, height: 256 });
expect(metadata.exif).toBeUndefined();
expect(animatedUpload.statusCode).toBe(400);
expect(oversizeUpload.statusCode).toBe(413);
expect(await isStorageKeyInUse({ database, storageKey: currentKey })).toBe(
  true,
);
expect(await fakeBucket.has(abandonedKey)).toBe(false);
```

Also pin rotated crop placement, 50-megapixel boundary, malformed/HEIC/SVG input,
one processing slot, decode/PUT failure, crash-after-PUT recovery, expired upload
replay, late-PUT deletion retry, and test/production-prefix isolation. Normalize Fastify's 413 at the existing error handler to `{ error:
"avatar_too_large", message: "Choose a photo smaller than 10 MB." }` for this
route only; add 413 to `ApiErrorStatus` for that typed response.

- [x] **Run red:** `pnpm --filter @memory-shoebox/server test test/avatars test/jobs/avatarReservationSweep.test.ts test/jobs/runObjectDeletionDrain`.
- [x] **Green:** Implement transform, route, lifecycle, and sweep. Use installed Sharp; no new image library. Do not log image bytes, original metadata, or signed URLs.
- [x] **Verify:** Rerun tests. V2 separately measures the maximum accepted decode in the target runtime before shipping; do not assert resource safety from unit fixtures alone. Document this explicit small-upload exception in `docs/architecture.md` and storage cleanup in `docs/member-profiles.md`.
- [x] **Commit:** `feat: process avatars and recover abandoned uploads`.

### Task A3: Shared avatar and accessible crop controls

**Files:** Create `apps/web/src/api/avatars/avatars.ts` and its test,
`apps/web/src/system/MemberAvatar/MemberAvatar.tsx` and its test,
`apps/web/src/surfaces/Account/AvatarEditor/AvatarEditor.tsx`,
`apps/web/src/surfaces/Account/AvatarEditor/AvatarCropDialog/AvatarCropDialog.tsx`,
`apps/web/src/surfaces/Account/AvatarEditor/avatarCropHelpers/avatarCropHelpers.ts`,
and colocated tests for each of the three editor files.
Modify `surfaces/Account/YouSheet/YouSheet.tsx`,
`surfaces/ProfileCompletion/ProfileCompletion.tsx`,
`surfaces/Item/ItemConversation/ItemComment/ItemComment.tsx`,
`surfaces/Item/ItemConversation/ItemComposer/ItemComposer.tsx`,
`surfaces/Item/VideoConversation/VideoReply/VideoReply.tsx`,
`system/Talk/CommentRow/CommentView.tsx`, and
`api/me/privateQueryHelpers.ts` under `apps/web/src`.

**Interfaces:** Produce `MemberAvatar({ member, size }: Readonly<{ member:
MemberRef; size: number }>): ReactNode` and `AvatarEditor({ me, onSaved }:
Readonly<{ me: MeDto; onSaved: (response: MeResponse) => void }>): ReactNode`.
Use one own-account mutation flow for reserve/PUT/remove with query-cache
reconciliation. Crop preview and A2 use the same normalized center/zoom geometry.
Names and avatar saves are independent. On conflict, preserve the crop and offer
“Use latest photo” or “Save this photo instead”; the latter obtains the fresh
expected version before retrying, never overrides a future unknown version.

Use the approved add/change/remove row, confirmation, circular preview, zoom
slider, move arrows and Reset controls. Keyboard operation must not require
dragging. Failure keeps the old avatar and selected input. Revoke object URLs on
replacement/cancel/unmount. Refresh expired signed sources once through the
private query boundary; fall back to initials without retry loops or layout shift.
Tag picker and collection consume this component in later plans. Decorative
images have empty alt text. Use 30px in existing comments, 80px in account preview,
and the shape's 48px option rows later.

- [x] **Red:** Test decoded preview/crop mapping, keyboard controls, save/remove rollback, stale-version choices, account change during upload, and renewal:

```ts
expect(screen.getByRole("slider", { name: "Zoom" })).toHaveFocus();
expect(savedCrop.zoom).toBeGreaterThan(1);
expect(oldAvatar).toBeVisible(); // failed save retains the current image
expect(revokeObjectURL).toHaveBeenCalledWith(previousPreviewUrl);
expect(avatarRenewalCalls).toBe(1);
```

- [x] **Run red:** `pnpm --filter @memory-shoebox/web test src/api/avatars src/system/MemberAvatar src/surfaces/Account/AvatarEditor src/surfaces/ProfileCompletion`.
- [x] **Green:** Build the components using Mantine and incumbent tokens. Complete profile independently of optional photo processing; a successful name claim may proceed even if the avatar fails. Preserve explicit error/retry state.
- [x] **Verify:** Rerun tests and web type check; update `docs/member-profiles.md` and `docs/theater.md`. Browser crop/touch proof is V1.
- [x] **Commit:** `feat: add profile photo editing and comment avatars`.
