# Burst selection, photo navigation, and readable upload progress

Status: approved design, implemented on `fix/burst-interactions`. See the plan execution notes for verification and implementation decisions.

## Intent and scope

Make choosing many family photos quick without losing existing ticks. Preserve the refrigerator-door visual identity while making every thumbnail overlay travel with its paper. Start photo enlargement as soon as destination geometry exists, independently of the high-resolution download. Warm likely destinations after a short hover. Show upload sizes in compact, magnitude-appropriate units instead of long byte counts.

Scope: timeline selection and bursts, shared Print/Polaroid composition, photo journey, media intent, and upload size labels. Shared component changes must preserve upload previews, ordinary timeline prints, item previews, and theater. No schema, production configuration, or new library is expected.

## Observed baseline before implementation

- `docs/PRODUCT.md` already calls these objects **bursts**. Groups refer to people/visibility, so use **Select full burst**.
- `BurstStack.tsx` treats the presence of selection frame data as both open state and an uncollapsible pin. `BurstFanHeader` disables Collapse for that pin.
- `BurstPhoto.tsx` places its menu beside Print, outside Print's transformed element. Its CSS forces a 3rem painted square. This explains the static, oversized control in the supplied screenshot.
- `Print` currently is a button and permits only non-interactive children. Adding another button inside it would produce invalid interactive nesting.
- `usePhotoArrival.ts` checks readiness and loaded pixels before arrival. `photoTransition.ts` explicitly waits for final pixels to commit. `docs/motion.md` documents the same behavior. This is a confirmed code-level delay mechanism; its exact contribution to the reported one-second delay still needs a browser trace.
- `useMediaIntent.ts` currently requests preview metadata and route code only. Native image warming, ownership transfer, byte budgets, and cancellation already exist elsewhere in the media subsystem.
- `UploadProgress.tsx` renders both confirmed and total bytes as raw locale-formatted integers. `UploadDraftOverview.tsx` already abbreviates sizes, but always in MB using a 1024 divisor.
- Bulk selection already resolves all pages of burst frames with active timeline filters. Its current maximum is 500 items.

## Approaches considered

| Approach                                                                                           | Benefits                                                  | Costs / risks                                                      |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------ |
| Patch each overlay and add local selection handlers                                                | Small initial changes                                     | Repeats the known animation bug; range and burst semantics diverge |
| Shared print composition plus one selection controller; extend existing motion and prefetch owners | Fixes the cause; preserves existing ownership and budgets | Requires careful migration of DOM selectors and animation refs     |
| Replace gallery and motion infrastructure                                                          | Broad freedom                                             | Unnecessary scope, dependencies, and regression risk               |

Recommendation: the second approach. Keep the existing paper flight and native-image scheduler, changing when they start and which element owns the visual transform.

## Selection behavior

### Full burst

In tick mode, a collapsed burst exposes a top-right Mantine Checkbox on hover or focus-within. Keep it visible when checked/indeterminate and on coarse-pointer devices. Its Mantine Tooltip and accessible label say **Select full burst**. The checkbox must not trigger expansion or navigation.

The expanded header places **Select full burst** immediately beside **Collapse**. Selecting does not collapse or expand the burst. A plain click on the collapsed photograph still expands it. Collapse remains enabled in tick mode, including while a frame read is pending; retained selected IDs and loaded frames do not force reopening.

Unchecked or partial activation adds all eligible frames. A fully checked checkbox may untick that burst only; use **Deselect full burst** for its label/tooltip then. The header button is an additive command: once all frames are selected it reads **Full burst selected** and is disabled. Both controls display partial/all states from the same resolved frame set. Before membership has loaded, do not claim the entire burst is selected.

Approved filter policy: preserve existing bulk-selection semantics and include only accessible frames matching active filters. With filters active, add visible helper copy, **Only photos matching your filters are included.** Never silently use unfiltered browsing caches. Without filters, every accessible frame is included, including frames not yet paginated into the fan.

Resolve membership and validate the final union before publishing. If the union exceeds 500, reject the whole operation, keep all prior ticks, and explain the limit. Failed reads leave the selection unchanged and permit retry. Collapse does not cancel an intentional selection operation, but leaving tick mode, changing filters, or changing member invalidates its publication epoch.

### Additive Shift-click

Use the user's explicit two-Shift-click rule, rather than a conventional plain-click anchor:

| Input                                                 | Result                                                                |
| ----------------------------------------------------- | --------------------------------------------------------------------- |
| Plain click A in tick mode                            | Toggle only A; discard any range anchor; preserve all other ticks     |
| First Shift-click B                                   | Add B (never toggle off); set B as anchor                             |
| Shift-click E                                         | Union existing selection with inclusive B through E                   |
| Further Shift-click H                                 | Union existing selection with inclusive B through H; keep B as anchor |
| Shift-click C after H                                 | Add B through C; do not remove anything previously added through H    |
| Plain click after only an anchor                      | Toggle that clicked item and discard the anchor; no range is formed   |
| Exit tick mode, clear selection, filter/member change | Discard anchor and invalidate stale reads                             |

Releasing Shift alone performs no action. A later plain click ends the sequence. Example: existing Z; Shift-click B; Shift-click E; Shift-click C results in Z plus B through E. A plain click X then toggles X only and ends the sequence.

Use timeline data order, never rendered DOM order. Virtualization must not omit records. The range spans loaded timeline entries between endpoints; resolve every page of each intervening burst. Do not fetch unrelated earlier/later timeline pages. Collapsed bursts act as blocks containing all eligible frames. An individual expanded-frame endpoint stops at that exact frame, while fully traversed bursts include every eligible frame. Reverse ranges behave identically. A Shift-click on a collapsed burst treats it as a block endpoint and selects its full eligible membership without expanding it. Its plain click remains expand.

Async range commands retain their anchor, endpoint and filter epoch. Serialize their reads and merge against the latest selection on commit, so rapid successive clicks are not dropped by the existing busy guard. A subsequent plain click invalidates pending range publication before applying its toggle. Do not globally disable unrelated selection clicks while a range resolves.

## Shared paper and overlay composition

Make a non-interactive paper root own scale, rotation, lift, z-index, motion identity, and geometry. Inside it, use a separately focusable main photo button and sibling overlay controls. Captions, marks and buttons are descendants of the same transformed root. Provide a named `overlays` slot instead of letting callers wrap Print in separately animated chrome. Keep ordinary non-interactive captions supported.

The main button owns selection/navigation semantics and aria-pressed. Overlay controls own their own actions; clicks never activate the photo. No nested buttons, checkboxes inside buttons, or duplicate tab stops for passive decoration. Mantine menus/tooltips may portal their floating content; their anchors remain inside the paper root and track its movement.

Migrate all affected selectors, observers and refs deliberately. `data-photo-surface` belongs to the geometry root; item identity remains available to the seen observer and focus restoration. The transition flight clones inert visual content only, excluding actionable overlays and focusable elements.

Use a small 28px painted options square with an 18px dots icon, paper background, ink foreground, and a quiet border. Retain a 48px target with transparent padding around the visual square, wholly within the thumbnail. Place it at the lower trailing corner with a 6px visual inset. Keep it visible but quiet, strengthen it on hover/focus, and preserve a clear focus ring. This separates touch accessibility from the current oversized painted button. Test overlap and stacking in dense fans. No new rounded, glass, or floating-card treatment.

## Motion thesis

Mode: Operate. The authored moment is a stack unfolding into its own photographs. Motion explains membership and position; it must not delay input.

- Open: 300ms movement, 12ms stagger capped at 60ms. First visible frames spread from the actual cover pose, preserving seeded rotation and complete overlay composition.
- Close: 200ms gathering toward the retained cover origin; neighboring layout settles within 300ms. Do not target whichever frame happens to be first after expansion.
- Keep the existing 16 animated-frame bound; remaining frames appear without a long stagger. Never put later frames behind a multi-second queue.
- A second expansion/collapse request retargets or safely completes the current transition. Stale completion cannot change newer state; controls cannot remain inert after cancellation.
- Reduced motion: 100-120ms opacity/state feedback, no spatial flight. Unsupported APIs: immediate state change.
- Preserve focus restoration and Escape collapse; selection checks travel with the complete paper.

## Immediate photo journey

Separate **layout ready** from **full-resolution pixels ready**. The first valid destination preview geometry starts the existing flight on the next animation frame; do not wait for network completion, image decode, or a fixed timer. Reserve destination geometry from known media dimensions and viewport so preview/detail replacement does not change the target box.

The source thumbnail remains the flight's pixels during movement. At arrival, reveal a destination thumbnail at the exact target size even if the large image is still loading. Once the exact selected image has decoded, replace/crossfade it in place (100ms opacity). If it decodes during flight, retain thumbnail flight pixels until arrival, then reveal the decoded destination once. Never restart enlargement on decode.

Keep one visible owner throughout: flight while moving, destination afterward. Preview replacement must transfer journey ownership instead of cancelling or replaying it. Keep identity, authorization, reduced-motion, scroll/resize interruption, navigation failure and stale-cleanup safeguards. An image failure leaves a correctly sized fallback and retry state, not an invisible destination. Existing 1.5-second expiry applies only to a missing usable destination, not to a slow high-resolution download.

Acceptance target: in the local browser fixture, motion starts within two animation frames after valid destination geometry is available even with display download/decode deliberately held for two seconds. Record click-to-geometry separately to detect route/data delays. If geometry is delayed by detail loading, use the seeded preview to mount the same reserved viewer geometry earlier. Zero network dependency is the requirement; absolute zero elapsed time is not a defensible browser guarantee.

## Hover image warming

After 100ms continuous pointer hover, warm the exact responsive display candidate the viewer would select. Pointer leave before 100ms cancels the timer and starts no image download. Focus uses the same dwell; pointer down can promote intent immediately without delaying the click. Keep this distinct from the existing 250ms neighbor dwell: never stack the two delays.

Reuse the existing native Image loader, member-scoped metadata, operation gate, scheduler deduplication and navigation promotion. One current hover candidate has priority over ordinary neighbor speculation, but foreground work always wins. Keep the existing limits: two speculative operations, 8 MiB encoded reservation, 32 MiB decoded reservation, and one retained decode. Warm the display rendition rather than the original. Do not prefetch an entire burst when its cover expands, and do not warm viewing images while tick mode owns clicks. Individual expanded photographs can warm their own destination outside tick mode.

Cancel queued intent on leave, blur, unmount, item/member/route changes. Native requests already started may still transfer bytes; retain reservations until settlement. Sign-out or denied authorization retires private ownership. Keep existing Save-Data, slow-2G/2G and hidden-tab protections. Reuse the same URL and request mode on click to allow cache reuse; promote in-flight ownership before navigation cleanup. No separate unbounded image cache.

## Readable upload sizes

Replace raw upload byte counts with abbreviated sizes selected independently for each value: B below 1024 bytes, KB below 1024 squared, MB below 1024 cubed, and GB thereafter. Preserve the existing upload draft's 1024-based convention and familiar KB/MB/GB labels. Show at most one decimal place, omit trailing `.0`, and retain the current `en-GB` number formatting. If rounding would display `1,024 KB` or `1,024 MB`, promote to the next unit so it reads `1 MB` or `1 GB`.

Examples: `0 B of 18 MB`, `640 KB of 18 MB`, `4.2 MB of 18 MB`, and `850 MB of 1.5 GB`. Keep the existing **confirmed up** wording and file count, since confirmed batch bytes have a different meaning from in-flight transfer bytes. Format the existing draft **To upload** total with the same helper so small and large uploads use consistent units. Do not add new byte counters to per-file rows.

This is presentation only: retain exact raw byte counts for progress percentages, transfer accounting and completion status. Rounded labels must never determine whether an upload is done. Test zero, KB/MB/GB thresholds, decimal precision, trailing-zero removal and rounding across unit boundaries. Check the text at mobile width with a multi-GB total.

## Validation and documentation

TDD for selection, async ownership, early flight and hover dwell. Browser tests prove actual transformed geometry, no nested controls, keyboard/touch behavior, no blank arrival, and network reuse. Use local synthetic media and fake email only. Desktop 1280px and mobile 390px, Chromium and WebKit, tidy/messy arrangements and reduced motion. One batched visual inspection and at most one confirmation after fixes.

Update `docs/motion.md`, `docs/media-loading.md`, and relevant selection documentation in `docs/architecture.md`; update the affected Print/burst sections of `DESIGN.md`. Update `docs/web.md` with the upload size-display convention. Existing reviews are historical evidence, not current behavior contracts. Impeccable's child-app context did not discover `docs/PRODUCT.md`; it was read directly. Do not repair unrelated context discovery as part of this task.
