# Comment Tags, Notifications, and Return Journeys Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let members select explicit @ tags, follow them to member collections, and receive one eligible notification.

**Architecture:** Persist plain text plus validated UTF-16 ranges and immutable label snapshots. Reuse the transactional outbox and shared conversation components, extending their draft model rather than adding a second editor or notification pipeline.

**Tech Stack:** TypeScript, React, Mantine, TanStack Router/Query, Fastify 5, Kysely/SQLite, Backblaze B2, Zod, Vitest, and Playwright. Use the installed pnpm workspace versions; no framework migration.

**Spec:** [Approved scope](../specs/2026-10-31-comment-tagging-design.md) and [approved UI/UX shape](../specs/2026-10-31-comment-tagging-ux-shape.md). Read both before execution.

**Status:** Prepared for implementation review on 2026-10-31. No implementation or passing feature tests are claimed.

## Global Constraints

- Apply the shared execution rules in the [plan index](2026-10-31-comment-tagging-plan.md#execution-rules).
- A selected result is the only way to create a new tag. Plain typing or plain-text paste never creates one.
- Keep the 4,000-character comment limit and existing author-only edit, moment, and one-level reply rules.
- Active, named members who can see the item are eligible; self-tagging is allowed without self-email.
- Email setting: “Somebody tags you in a comment.” Description: “An email when someone uses @ to get your attention.” Default on, independently controlled.
- Email link: `/items/<itemId>?comment=<commentId>`. No singular `/item/` path, no avatar attachment, no push inbox.
- Persist drafts only for the current signed-in tab lifetime; retire them on account change/access loss. No reload/tab-close recovery promise.

## Review Focus

- Emoji, trimming, and IME alter offsets: T1/T4 test UTF-16 boundaries and atomic text/range history.
- A renamed/removed target and old client edits: T2 tests snapshots, retained occurrences, and reload-required refusal.
- Opt-out, access loss, and parent deletion after enqueue: T3 tests cancellation immediately before delivery.
- Tag removal/re-add after queue scrubbing: T3 tests lifetime deduplication independent of outbox retention.
- Navigation/sign-out during edits or pending sends: T5 tests return restoration and account-safe retirement.

---

## File responsibilities

Shared `commentTags/` owns transport types and text/range normalization. Server
`commentTags/` owns eligibility, validation, and occurrence writes. Existing
comment routes own transactional orchestration; mail policy stays in `items/`
and the delivery gate in `mail/`. Web `system/CommentTagInputField/` owns the
textarea/list, while draft history and route lifetime have separate pure helpers.

### Task T1: Range contracts and persistence

**Files:** Create `packages/shared/src/commentTags/commentTags.ts`, its colocated
test, `apps/server/src/db/migrations/0021_comment_tags.ts`, and
`apps/server/test/schema/commentTagsMigration.test.ts`. Modify
`packages/shared/src/comments.ts`, `packages/shared/src/dtos.ts`,
`packages/shared/src/auth.ts`, `packages/shared/src/email/email.ts`,
`packages/shared/scripts/sharedExports.json`, and server `db/migrations/migrations.ts`,
`db/types/{catalog,identityAndAccess,operations,db}.types.ts`,
`db/schemaManifest/{catalog,identityAndAccess,operations}.ts`,
`db/schemaExpectations/{identityAndAccess,operations,indexColumns}.ts`, and
`db/schemaExpectations/catalog/catalog.constants.ts`,
`db/schemaExpectations/catalog/catalogIndexes.constants.ts`,
`members/getMeDtoFromMemberId.ts`, `routes/me.ts`,
`items/readCommentThread.ts`, and `routes/items/createItemCommentRoute.ts` under
`apps/server/src`. Extend existing comment and preference fixtures as part of
these required response-shape changes.

**Interfaces:** Define tag schemas/types in `dtos.ts` above `commentDtoSchema`.
The `commentTags` helper imports them; `dtos.ts` never imports the helper, avoiding
a runtime Zod schema cycle. Produce `CommentTagInput = { memberId: string; start: number;
end: number; tagId?: string }` and `CommentTag = { tagId: string; memberId:
string; start: number; end: number; label: string }`. The label snapshot excludes the leading `@`. The optional existing tag
ID lets edits retain a particular historical occurrence without treating a new
copy as retained. IDs never originate from typed names. `CommentDto.commentTags`
is always an array. New creates default missing `commentTags` to []; updates
preserve omission as undefined for T2's legacy-edit check.

Produce `makeNormalizedCommentFromDraft(options: Readonly<{ body: string;
commentTags: readonly CommentTagInput[] }>): { body: string; commentTags:
CommentTagInput[] }`. Validate raw bounds/order/non-overlap before trimming,
subtract the removed leading UTF-16 length from both bounds, and reject a range
that touches removed whitespace or splits a surrogate pair. Range includes `@`;
end is exclusive. Reject non-integer/negative/out-of-body bounds and duplicate
retained tag IDs. No HTML conversion. The shared comment schemas normalize the
text and ranges together instead of separately applying `.trim()` to the body.

Schema: `comment_tags(id PK, comment_id FK comments ON DELETE CASCADE,
member_id FK members, start_offset, end_offset, label_snapshot)` with integer
checks `start_offset >= 0 AND end_offset > start_offset`, unique
`(comment_id, start_offset)` and indexes on `comment_id` and `member_id`.
The server validates cross-row overlap and body bounds. Add
`comment_tag_notifications(comment_id FK comments ON DELETE CASCADE, member_id
FK members, scheduled_at, PRIMARY KEY(comment_id, member_id))` as the permanent
per-comment scheduling ledger. This survives tag removal and outbox scrubbing.
Add `members.notify_on_comment_tag INTEGER NOT NULL DEFAULT 1 CHECK (... IN (0,1))`
and extend outbound email kind constraints with `comment_tag`, preserving rows,
indexes, sender snapshots, IDs, and migration integrity checks.

`NotifyPreferences.onCommentTag` is required in responses. The update-specific
notify schema permits omission of only this new field, preserving its stored
value for older four-boolean payloads. Existing four fields retain their contract.
Do not `.default(true)` this field on a PATCH input.

- [ ] **Red:** Pin UTF-16 normalization and update compatibility:

```ts
expect(
  makeNormalizedCommentFromDraft({
    body: "  \u{1F600} @Jorge  ",
    commentTags: [{ memberId, start: 5, end: 11 }],
  }),
).toEqual({
  body: "\u{1F600} @Jorge",
  commentTags: [{ memberId, start: 3, end: 9 }],
});
expect(createCommentRequestSchema.parse({ body: "Hello" }).commentTags).toEqual(
  [],
);
expect(
  updateCommentRequestSchema.parse({ body: "Hello" }).commentTags,
).toBeUndefined();
```

Add invalid overlap/surrogate/trim cases, 4,000/4,001 limits, legacy migration,
FK cascade, duplicate ledger refusal, and preservation of existing outbox rows.

- [ ] **Run red:** `pnpm --filter @memory-shoebox/shared test src/commentTags test/comments.test.ts test/auth.test.ts`; `pnpm --filter @memory-shoebox/server test test/schema/commentTagsMigration.test.ts`.
- [ ] **Green:** Implement normalization, schemas, migration, manifests, and generated exports. Keep empty tags on all existing comment DTO producers until T2 connects persisted reads. Wire the new preference through `members/getMeDtoFromMemberId.ts` and `routes/me.ts` now: select/return the stored boolean and update it only when the PATCH field is supplied. Update existing fixtures for the required response fields; T3 owns its UI and email behavior.
- [ ] **Verify:** Rerun focused tests and server migration/schema checks. Update `docs/shared.md` and create `docs/comment-tagging.md` with offset and compatibility rules.
- [ ] **Commit:** `feat: define persisted comment tags and notification preferences`.

### Task T2: Eligible-member lookup and transactional tag writes

**Files:** Create `apps/server/src/commentTags/readCommentTagCandidates.ts`,
`apps/server/src/commentTags/validateCommentTags.ts`,
`apps/server/src/commentTags/replaceCommentTags.ts`,
`apps/server/src/routes/items/commentTagCandidatesRoute.ts`,
`apps/server/test/routes/comments/commentTags.test.ts`, and
`apps/server/test/routes/comments/commentTagCandidates.test.ts`.
Modify `apps/server/src/routes/items/createItemCommentRoute.ts`,
`apps/server/src/routes/comments.ts`, `apps/server/src/routes/items/items.ts`, and
`apps/server/src/items/readCommentThread.ts`. Add candidate request/response
schemas to the shared comment-tags module.

**Interfaces:** `GET /api/items/:itemId/comment-tag-candidates?q=<name>` returns
`{ members: MemberRef[] }` with no pagination for the small family directory.
`q` defaults empty and is capped at 80 characters. Validate the caller's item
access first, then return active completed members who can see it. Use the real
visibility predicate for each candidate, including uploader/admin behavior;
never use photo tags to grant eligibility. Query names by the N1 normalization.
Sort exact, prefix, then substring matches; within each group normalized name
and member ID give a stable order. Empty query is alphabetical.

Produce `readCommentTagCandidates(options: Readonly<{ database: DatabaseExecutor;
viewer: Viewer; item: VisibleItem; b2: B2Client; query: string; now: string }>):
Promise<MemberRef[]>`. Produce `validateCommentTags(options: Readonly<{ database: DatabaseExecutor;
viewer: Viewer; item: VisibleItem; body: string; commentTags: readonly
CommentTagInput[]; existingTags: readonly CommentTag[] }>): Promise<CommentTag[]>`
and `replaceCommentTags(options: Readonly<{ transaction: DatabaseExecutor;
commentId: string; tags: readonly CommentTag[] }>): Promise<void>`.
New occurrences require current name equality (`body.slice(start,end) ===
"@" + currentDisplayName`) and current eligibility. Existing tag IDs must belong
to this comment, appear once, retain member and label, and match their text; they
may shift offsets and retain a now-ineligible identity. New duplicates still
require eligibility. Preserve label snapshots and IDs across unrelated edits.

Return recoverable 409 codes `comment_tag_stale`, `comment_tag_unavailable`, or
`comment_tags_reload_required`; use existing `details.fieldErrors` keys such as `commentTags.0` to identify
the affected tag positions, never emails or hidden reasons. Schema errors use existing field errors. On a tagged
stored comment, omitted update tags cause reload-required; explicit [] removes
all. Create with supplied retained IDs is invalid. Write comment and ranges in
one immediate transaction; batch-read all occurrences for a thread without N+1.
T3 wires outbox reconciliation into these same transactions.

- [ ] **Red:** Exercise real create/update routes, candidate privacy, and rollback:

```ts
expect(candidates.members.map((member) => member.memberId)).toEqual(
  eligibleIds,
);
expect(JSON.stringify(candidates)).not.toContain("email");
expect(renamedTarget.json().error).toBe("comment_tag_stale");
expect(oldClientEdit.json().error).toBe("comment_tags_reload_required");
expect(retainedRemovedTag.statusCode).toBe(200);
expect(newRemovedTag.json().error).toBe("comment_tag_unavailable");
```

Test same-name ad-hoc exclusion, incomplete profiles, hidden/missing item parity,
self-selection, repeated member tags, forged retained IDs, concurrent rename,
non-author edit, immutable moment/reply parent, and rollback after tag insertion.

- [ ] **Run red:** `pnpm --filter @memory-shoebox/server test test/routes/comments test/items/readCommentThread.test.ts`.
- [ ] **Green:** Implement lookup and occurrence actions inside the existing create/edit transactions. Treat stored label as authoritative for retained tags; never resolve historical text to a different member by name. Keep current comment permission behavior.
- [ ] **Verify:** Rerun tests; update `docs/comment-tagging.md`, `docs/server.md`, and `docs/video-conversations.md`.
- [ ] **Commit:** `feat: validate member tags in comment writes`.

### Task T3: Email preference, recipient arbitration, and last delivery gate

**Files:** Create `packages/emails/src/templates/CommentTagEmail.tsx`,
`packages/emails/test/CommentTagEmail.test.tsx`,
`apps/server/src/mail/checkCommentTagDelivery.ts`,
`apps/server/src/items/reconcileCommentTagEmails.ts`,
`apps/server/test/items/commentTagEmails.test.ts`, and
`apps/server/test/mail/commentTagDelivery.test.ts`.
Modify `packages/shared/src/email/email.ts`, `packages/emails/src/index.ts`,
`apps/server/src/mail/templates/emailTemplates.constants.ts`,
`apps/server/src/mail/deliverQueuedEmail.ts`,
`apps/server/src/items/enqueueCommentEmails.ts`,
`apps/server/src/routes/comments.ts`,
`apps/server/src/routes/items/createItemCommentRoute.ts`,
`apps/server/src/routes/me.ts`,
`apps/server/src/members/getMeDtoFromMemberId.ts`, and
web `surfaces/Account/{notifyKinds.ts,NotifyBulkButtons.tsx,NotifySwitches.tsx}`.
Extend `apps/web/src/surfaces/Account/EmailSheet/EmailSheet.test.tsx`.

**Interfaces:** Add `CommentTagEmailPayload = EmailCommon & { authorDisplayName:
string; body: string; atSeconds: number | null; itemCapturedOn: string;
itemUrl: string }`, its schema, template, and `comment_tag` registry entries.
The payload freezes human-readable text at queue time; DB trigger/recipient IDs
remain on outbox columns, not visible copy. Subject is “Ana tagged you in a
comment.” CTA is “View comment”. Include the capture date, optional moment,
notification reason, and existing account preference link. HTML and plain text
carry equivalent content; no image, hidden preheader, or raw object key.

`reconcileCommentTagEmails(options: Readonly<{ transaction: DatabaseExecutor;
viewer: Viewer; item: VisibleItem; commentId: string; body: string; atSeconds:
number | null; previousTags: readonly CommentTag[]; tags: readonly CommentTag[];
isCreate: boolean; now: string }>): Promise<void>` owns lifetime ledger inserts
and tag-mail cancellation. Insert ledger only when actually scheduling a tag
message; a failed-config queued/failed outbox row still counts as scheduled.
Use unique key `comment-tag:<commentId>:<memberId>`. Create arbitration chooses
at most one message per recipient: opted-in tag mail, otherwise existing generic
policy. Self never receives either. On edit, only newly added recipients with
no ledger row get tag mail; a prior generic message does not block that first
tag notification. Removing and re-adding never schedules again.

Cancel queued tag messages when their recipient disappears from the tag set.
Before parent deletion, collect the parent and cascading reply IDs, then cancel
all their queued generic/tag mail in the same transaction. Do not rewrite frozen
snapshots on ordinary word edits. Existing kind suppression stays unchanged.

`checkCommentTagDelivery(options: Readonly<{ database: DatabaseExecutor; row:
OutboundEmailRow }>): Promise<boolean>` checks current recipient status,
completion, preference, item visibility, comment existence, and current recipient
tag. Call after rendering and sender freezing, immediately before `sender.send`,
on every attempt. False transitions the claimed tag row to cancelled through
existing finalization without a provider call. Durable sender/idempotency rules
remain unchanged. Access changes after provider handoff cannot recall email.

- [ ] **Red:** Table-drive preference combinations and lifecycle transitions:

```ts
expect(queuedKindsForTaggedUploader).toEqual(["comment_tag"]);
expect(queuedKindsWithTagMailOff).toEqual(["comment"]);
expect(lifetimeTagMessages).toHaveLength(1);
expect(selfMessages).toHaveLength(0);
expect(sendAfterAccessLoss).not.toHaveBeenCalled();
expect(emailText).toContain(`/items/${itemId}?comment=${commentId}`);
```

Add old PATCH preference preservation, all-on/off includes five settings, duplicate
mentions, newly tagged edit, remove/re-add after outbox scrub, cancelled parent
replies, retry after opt-out, visibility revocation while renderer is paused,
removed recipient, failed database enqueue rollback, and local HTML/plain-text
snapshot assertions. A recording sender is mandatory.

- [ ] **Run red:** `pnpm --filter @memory-shoebox/emails test test/CommentTagEmail.test.tsx`; `pnpm --filter @memory-shoebox/server test test/items/commentTagEmails.test.ts test/mail/commentTagDelivery.test.ts`; run the web EmailSheet test.
- [ ] **Green:** Implement registry/copy and arbitration together. Add the preference to existing independent account saving and bulk buttons. Fix the canonical item path only for this new email flow; do not expand scope to rewriting unrelated legacy queued mail.
- [ ] **Verify:** Rerun targeted tests and existing outbox retry/suppression tests. Update `docs/mail.md`, `docs/emails.md`, and `docs/comment-tagging.md`.
- [ ] **Commit:** `feat: notify eligible comment-tag recipients once`.

### Task T4: One range-aware input and renderer across conversations

**Files:** Create `apps/web/src/system/CommentTagInputField/CommentTagInputField.tsx`
and its test, `apps/web/src/system/commentDraftHelpers/commentDraftHelpers.ts`
and its test, `apps/web/src/system/CommentTagText/CommentTagText.tsx` and its test,
and `apps/web/src/api/commentTagCandidates/commentTagCandidates.ts` and its test.
Modify `api/comments/comments.ts`,
`surfaces/Item/ItemConversation/ItemComposer/ItemComposer.tsx`,
`surfaces/Item/ItemConversation/useItemCommentDraft/useItemCommentDraft.ts`,
`surfaces/Item/ItemConversation/ItemCommentDraftProvider/ItemCommentDraftProvider.tsx`,
`surfaces/Item/ItemConversation/ItemComment/ItemComment.tsx`,
`surfaces/Item/VideoConversation/VideoReply/VideoReply.tsx`,
`surfaces/Item/VideoConversation/VideoMomentPreview/VideoMomentPreview.tsx`,
`system/Talk/CommentRow/CommentEditor/CommentEditor.tsx`,
`system/Talk/CommentRow/useCommentEditing.ts`, and
`system/Talk/CommentRow/CommentView.tsx` under `apps/web/src`.

**Interfaces:** `CommentDraft = { body: string; commentTags: CommentTagInput[] }`.
`CommentTagInputField` consumes `{ itemId, value: CommentDraft, onChange,
onSubmit, fieldRef, isSending, portalTarget? }`; callback is
`onChange(value: CommentDraft): void`; `onSubmit(): void`,
`fieldRef: RefObject<HTMLTextAreaElement | null>`, `isSending: boolean`, and
`portalTarget?: HTMLElement` complete the props contract. Produce
`makeCommentDraftFromEdit(options: Readonly<{ draft: CommentDraft; start: number;
end: number; text: string }>): CommentDraft` and
`makeCommentDraftFromMemberSelection(options: Readonly<{ draft: CommentDraft;
start: number; end: number; member: MemberRef }>): CommentDraft`.
The range reducer shifts unaffected later tags, drops any occurrence whose
interior is edited, and leaves affected text as plain text. Replacements spanning
a whole tag remove it. Insertion exactly before/after a range is outside it.
The selection action inserts `@Name` plus a trailing space. Do not recover tag
identity by diffing name strings. Undo/redo snapshots body, references, caret, and
selection together; plain paste adds no references.

Use a textarea and a noninteractive text mirror for selected-range styling.
Prototype wrapping, scroll, zoom, mobile IME, and undo in the first implementation
of this component before wiring other composers. Use Mantine Combobox for the
accessible list and existing portal/focus APIs. If those browser checks show the
mirror cannot stay aligned, fix or replace the implementation technique while
preserving these contracts; record the evidence before adding an editor dependency.

`@` opens at start/whitespace/opening punctuation, never inside an email address.
Show around five 48px avatar/name rows; scroll overflow. Initial selection is
highlighted but commits only on click/tap/Enter. Arrows navigate; Tab closes
without selection; Escape closes only the picker. Cmd/Ctrl+Enter with an open list
selects, not sends; a second shortcut may submit. IME composition never triggers
selection/submission. Support multiword names, a literal unmatched `@`, loading,
retry, and no-match states. Keep draft edits during in-flight lookup/post; stale
lookups cannot replace current suggestions. The picker holds the theater dock
open and portals within the fullscreen host. No automatic email-success claim.

`CommentTagText({ body, commentTags }: Readonly<{ body: string; commentTags:
readonly CommentTag[] }>): ReactNode` slices text into React text and real links.
Use snapshot wording, underlining, medium weight, restrained ink wash, and C2's
collection href. No `dangerouslySetInnerHTML`. A3 supplies author and picker
avatars. New draft selection creates no clickable link while editing.

- [ ] **Red:** Pin edit behavior and keyboard interaction:

```ts
expect(
  makeCommentDraftFromEdit({ draft, start: 3, end: 3, text: "Hi " })
    .commentTags[0].start,
).toBe(draft.commentTags[0].start + 3);
expect(
  makeCommentDraftFromEdit({
    draft,
    start: tag.start + 1,
    end: tag.start + 2,
    text: "x",
  }).commentTags,
).toEqual([]);
expect(send).not.toHaveBeenCalled(); // Enter/shortcut selected an open option
expect(
  screen.getByRole("link", { name: "Jorge, view photos and videos" }),
).toHaveAttribute("href", `/?member=${memberId}`);
```

Add selection-over-tags, copy/plain paste, undo/redo, emoji, trigger boundaries,
IME, spaces in names, stale lookup/name, unavailable target repair, 4,000-character
over-limit selection, and revised draft surviving a late successful send.

- [ ] **Run red:** `pnpm --filter @memory-shoebox/web test src/system/commentDraftHelpers src/system/CommentTagInputField src/system/CommentTagText src/api/commentTagCandidates`.
- [ ] **Green:** Implement the pure reducers and component, then wire main/reply/edit/Talk/moment previews through the shared input/renderer. Preserve pin capture and send authority in existing hooks. Use approved plain-text correction actions for stale or unavailable tags.
- [ ] **Verify:** Rerun tests and existing item/theater conversation tests. Update `docs/comment-tagging.md`, `docs/video-conversations.md`, and `docs/theater.md`. V1 supplies real-browser mirror/IME evidence, not jsdom claims.
- [ ] **Commit:** `feat: select and render member tags in conversations`.

### Task T5: Deep-link entry and session-owned return restoration

**Files:** Create `apps/web/src/session/ConversationJourneyProvider/ConversationJourneyProvider.tsx`
and its test, `apps/web/src/session/conversationJourneyHelpers/conversationJourneyHelpers.ts`
and its test, and `apps/web/src/surfaces/Item/CommentArrival/CommentArrival.tsx`
and its test. Modify `apps/web/src/routes/_app.tsx`,
`apps/web/src/routes/_app/items.$itemId.tsx`,
`apps/web/src/system/CommentTagText/CommentTagText.tsx`,
`apps/web/src/surfaces/Timeline/MemberCollectionHeader/MemberCollectionHeader.tsx`,
`apps/web/src/surfaces/Item/ItemConversation/ItemCommentDraftProvider/ItemCommentDraftProvider.tsx`,
main/reply/edit hooks from T4, and `apps/web/src/api/me/privateQueryHelpers.ts`.

**Interfaces:** Produce a provider keyed to the authenticated account/session
lifetime above item routes, with `readDraft`, `writeDraft`, `removeDraft`,
`rememberReturn`, `readReturn`, and `retireItem` actions. `DraftKey` is
`{ itemId, mode: "main" | "reply" | "edit", commentId?: string }`; reply/edit
require the appropriate parent/edited comment ID. `ConversationDraft` extends
T4's draft with revision, selectionStart/End, captured atSeconds, and hasStarted.
`ConversationReturn` holds source item href including validated search, scroll
container/offset, focused comment/editor key, and native/window theater intent.
The provider's actions are `readDraft(key: Readonly<DraftKey>):
ConversationDraft | undefined`, `writeDraft(key: Readonly<DraftKey>, value:
Readonly<Omit<ConversationDraft, "revision">>): void`, `removeDraft(key:
Readonly<DraftKey>, expectedRevision?: number): void`, `rememberReturn(value:
Readonly<ConversationReturn>): void`, `readReturn(): ConversationReturn |
undefined`, `retireItem(itemId: string): void`, and `clear(): void`. Increment
revision internally on each write; conditional remove is a no-op on a different
revision. Keep one active return journey in the tab; a new same-tab collection
entry replaces it. Do not put text in the URL, localStorage, or a cross-account
singleton.

Normal same-tab tag activation snapshots a return entry and navigates to the
clean member collection. Modified click/new tab keeps native link semantics and
creates no new-tab return promise. Back and “Back to comment” restore only after
current item authorization; denial retires all drafts/scroll for that item. Sign-
out, member/session replacement, and private-cache retirement clear all state.
Keep memory bounded to visited item drafts for this session, and avoid storing
server media URLs or comment data beyond the user's own draft/return metadata.
A successful post clears only its submitted revision. Reply/edit drafts get the
same guarantees as the main composer.

Validate item route `comment` as an optional UUID. After detail authorization,
locate it, reveal its reply parent/dock, scroll and focus a readable comment
container (`tabIndex=-1`), not a destructive action. Unknown/deleted comment on a
visible item shows “That comment is no longer available.” Invisible/missing item
uses existing refusal. Never autoplay/seek on email arrival; preserve comment
search through N4 sign-in/completion. Escape respects the innermost overlay and
native fullscreen behavior. Returning from collection does not auto-resume video.

- [ ] **Red:** Test main/reply/edit round trips and stale completion:

```ts
expect(restoredDraft).toEqual(draftBeforeLeaving);
expect(restoredScrollTop).toBe(scrollBeforeLeaving);
expect(memoryAfterAccountReplacement).toEqual([]);
expect(newerDraftAfterOldSend).toEqual(newerDraft);
expect(focusedCommentId).toBe(requestedCommentId);
expect(video.play).not.toHaveBeenCalled();
```

Add access loss, expired session followed by another login, deleted comment,
unknown ID, new-tab link, incomplete-profile redirect, and stale navigation
responses. Do not assert preservation across reload or tab close.

- [ ] **Run red:** `pnpm --filter @memory-shoebox/web test src/session/ConversationJourneyProvider src/session/conversationJourneyHelpers src/surfaces/Item/CommentArrival src/routes/-bootstrap-redirect.test.ts`.
- [ ] **Green:** Hoist ownership and adapt existing providers rather than keeping parallel memories. Wire deep-link arrival, parent expansion, focus, and same-tab return. Preserve the existing theater host and draft revision semantics.
- [ ] **Verify:** Rerun focused tests and all existing item/theater tests. Update `docs/theater.md`, `docs/video-conversations.md`, and `docs/comment-tagging.md` to replace the old route-visit-only draft statement.
- [ ] **Commit:** `feat: restore conversations after member collection visits`.
