# Upload progress and refresh recovery

## Outcome

An uploader can identify active, successful and unsuccessful photos by a thumbnail,
keep filenames as supporting detail, and resume the missing part of a batch in
place. Refreshing an armed upload must preserve originals when browser storage
permits it. Uploaded files must never be sent again by Resume.

## UI

Keep the existing bounded active progress list, with uncropped thumbnails beside
status, filename and progress. Use local previews for files on this device and
server media for completed files after reload. Missing and failed rows get the
same preview treatment. Continue preview generation during upload with the
existing one-at-a-time bounded preview queue. Preserve its viewport ownership.

A prominent Resume upload button sends retained waiting/sending files; Retry
upload retries retained failed files. Mixed states can use Resume upload. Disable
these actions while loading, checking or running and during ambiguous matching.
The action calls the existing retryMissingFiles controller API with eligible ids.
Do not offer successful, refused, cancelled or duplicate rows for retry. If any
missing original is unavailable locally, offer Choose files to resume, explain
that the entire original selection is safe, and keep available-file resume usable.
The missing count includes waiting and sending rows, not only failed rows.

## Refresh recovery

Add an injectable IndexedDB original store keyed by member, session and file id.
Keep the existing lightweight localStorage hint unchanged. Save pending originals
before transfer begins, and restore only originals corresponding to a fresh,
authorized server manifest. Never restore another member/session or replay edits.
Reconstruction preserves File name, type, lastModified and bytes. Do not store
signed media URLs. Do not start a transfer until the uploader presses Resume.

Delete retained originals once authoritative state is done, refused, cancelled or
an identified duplicate. Keep failed/waiting/sending originals across teardown.
Clear a batch on explicit reset/discard; ordinary destroy preserves recovery.
Prune records older than seven days on store access to bound abandoned storage.
Storage failure must not prevent upload, confirmation, recovery reads or cleanup;
show a concise notice when originals cannot be retained. Existing interrupted
uploads without stored files need one re-selection. Browser quota/eviction can
also require re-selection. No service worker, background uploading or server/API
contract changes are required.

## Validation

Use red/green tests for visible previews, bulk retry target selection, disabled
states, controller recreation with a shared original store, successful cleanup,
failed retention, unavailable storage, stale generations and member isolation.
Use a real browser to verify IndexedDB File round-trip across reload, row layout
at desktop/mobile widths, and resume without uploading already-completed rows.
Run pnpm check before completion. Keep all email verification fake/local.
