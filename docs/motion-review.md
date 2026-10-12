# Motion review: a family shoebox brought to life

Reviewed 12 October 2026. The direction is warm, tactile and expressive: a
photograph feels like an object being picked up, a burst opens like a handful
of prints, and a small reaction feels personal. The existing enamel, crooked
paper, uncropped pictures and restrained palette already give the app an
identity. Motion should make that identity tangible.

## Strongest opportunities

| Priority | Moment                   | Review finding                                                                                                     | Direction and status                                                                                                                                                               |
| -------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | Timeline photo to viewer | Navigation disconnects a small crooked print from its large counterpart.                                           | **Implemented:** a 560ms paper flight connects the two positions and resting angles after the destination image loads. Navigation and loading proceed immediately.                 |
| 1        | Viewer back to timeline  | Returning loses the sense of putting a particular photograph back.                                                 | **Implemented:** the in-app back link stages the reverse flight when the matching print is visible. Browser history and scroll restoration remain responsible for the destination. |
| 1        | Opening a burst          | The original fan has a single 320ms block entrance; the individual photographs do not tell the story of unfolding. | **Implemented:** individual prints unfold from the cover, with a bounded stagger and neighboring prints settling around the changed footprint.                                     |
| 1        | Closing a burst          | The fan disappears abruptly.                                                                                       | **Implemented:** prints gather for 220ms before collapse, then keyboard focus returns to the cover. Selection-pinned fans remain open.                                             |
| 1        | Tidy / Messy preview     | The same photographs jump between compositions.                                                                    | **Implemented:** native named snapshots carry each miniature print to its new position over 480ms. Saving retains its existing semantics.                                          |
| 2        | Adding upload files      | A new set of prints appears without weight or arrival.                                                             | **Implemented:** new upload holders settle onto the page over 560ms. This runs on insertion, not every progress update.                                                            |
| 2        | Local image decoding     | A filename placeholder abruptly becomes a photograph.                                                              | **Implemented:** the ready preview develops through a 460ms opacity reveal.                                                                                                        |
| 2        | Finished upload          | Completion deserves a moment of arrival, but counts must remain truthful.                                          | **Implemented:** the existing outcome sheet settles into place, then its confirmed counts appear. No invented progress or counting animation.                                      |
| 2        | Selecting photographs    | The tick appears without a tactile acknowledgement.                                                                | **Implemented:** the selection mark stamps down in 300ms; the selection toolbar enters in 260ms. The photo's hit area stays fixed.                                                 |
| 2        | Photo reaction           | Selection is conveyed mostly by a static outline.                                                                  | **Implemented:** the selected emoji blooms and settles in 480ms, independently of its button.                                                                                      |
| 2        | Conversation             | A thread or reply form appears abruptly.                                                                           | **Implemented:** mounted thread groups and reply forms enter with a small upward settle. Existing threads also receive this brief entrance when the conversation mounts.           |

## Remaining app-wide opportunities

These are recommendations, not claims that every surface needs more animation.

| Surface or state                          | Existing behavior and opportunity                                                            | Recommendation                                                                                                                                                                                               |
| ----------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Timeline filtering and search results     | A changed query can replace much of the pile.                                                | Next high-value pass: preserve surviving print identities and settle only changed results once data is ready. Keep empty/error results immediate. Scope snapshots to the visible pile, not the full archive. |
| Day jump and archive navigation           | A jump is an explicit request to travel in time. Long smooth scrolling would become a delay. | Keep the jump immediate; briefly reveal the destination date and nearest photographs. Avoid flying across years of pictures.                                                                                 |
| Infinite archive loading                  | The archive's uncropped images already provide visual rhythm.                                | Keep scroll-driven content immediately readable. Avoid repeated reveal animations on every image and an ever-growing stagger.                                                                                |
| Milestones inline in the timeline         | The dated band is editorial and intentionally distinct from photos.                          | A short ink-line reveal would make a newly created milestone feel placed between the photos. Animate insertion rather than every scroll past it.                                                             |
| Milestone creation and editing            | Forms have clear validation and save states.                                                 | A successful save could return a small note to the matching timeline date. Leave validation text and failed saves immediate.                                                                                 |
| Video viewer                              | Existing video reactions rise for about 1.5 seconds; playback has its own visual activity.   | Preserve the current reaction language and playback controls. A future poster-to-player handoff must preserve playback position and avoid animating decoded video frames.                                    |
| Burst sibling strip                       | Frame navigation changes the selected image and position within a set.                       | A short directional photo handoff is a strong follow-up. Keep keyboard repeat usable; cancel the outgoing transition on the next input.                                                                      |
| Item details drawer                       | Mantine already supplies a roughly 240ms transition and focus management.                    | Retain it. A slight stagger of metadata could be added later, without postponing the first actionable control.                                                                                               |
| Reaction popovers                         | Mantine already animates their arrival; video reactions already express delight.             | Preserve dismissal and focus behavior. The new selected emoji response supplies the extra personality.                                                                                                       |
| Comments, replies and edits               | Newly mounted notes now settle; in-place edits do not require a spatial transition.          | Future refinement: distinguish initial history from newly sent notes, and animate reply insertion independently. Never replay the full thread on polling.                                                    |
| Upload classification and burst grouping  | Files gain dates, labels and group membership as information arrives.                        | Next high-value upload pass: animate regrouping by file identity. Do not remount previews or restart decoding to obtain motion.                                                                              |
| Upload progress, retries and cancellation | Accurate bytes, failures and resumability matter more than spectacle.                        | Keep progress truthful and cancellation immediate. A completed file could receive a quiet ink acknowledgement; failed files should stay stable and readable.                                                 |
| People directory                          | Portraits and names offer a human entry into the archive.                                    | A small stagger on a deliberate first visit could feel like arranging family portraits. No perpetual floating or pointer-following tilt.                                                                     |
| Person detail and editing                 | Identity and tagged photos should remain the focus.                                          | A future portrait-to-person transition could echo the photo journey. Keep edit forms steady.                                                                                                                 |
| Sign-in email to code stage               | The next step replaces the current form.                                                     | A brief horizontal paper handoff could explain forward/back progression while focus moves immediately to the code field. Avoid animating each typed digit.                                                   |
| First setup and joining                   | These are unusually meaningful entry points into the family space.                           | A one-time opening-sheet sequence after confirmed completion is appropriate. Do not delay setup, invite validation or errors.                                                                                |
| Account and preferences                   | These are practical, recurring controls.                                                     | Keep ordinary form changes quiet. The arrangement preview is the expressive exception because it directly demonstrates the setting.                                                                          |
| Members, groups and invitations           | Roles, access and invitation state are consequential.                                        | Small inserted-row transitions only. No celebratory motion for removal, privilege changes or email sends.                                                                                                    |
| Presence, item viewers and Changes        | These are factual records rather than social engagement surfaces.                            | Keep stable row positions and immediate reads. Avoid animated counters, pulsing activity or attention-seeking updates.                                                                                       |
| Removal requests and destructive dialogs  | Deliberation and recovery need steady controls.                                              | Preserve Mantine's existing dialog transitions. No disappearance before the server confirms success.                                                                                                         |
| Empty, loading and failure states         | They explain availability and recovery.                                                      | Calm, brief opacity changes are enough. Avoid looping decorative motion or artificial loading delays.                                                                                                        |

## Motion language

Use asymmetric easing, `cubic-bezier(0.16, 1, 0.3, 1)`, for paper settling.
Large expressive actions take roughly half a second; exits are shorter.
Small marks can have a controlled overshoot. Do not put an elastic spring on
every control. Preserve the seeded angles and real photo proportions at rest.
The photo is always the principal visual object; no ambient glitter, floating
background or new decorative color system is needed.

Reduced-motion preferences are independent of computer speed. Photo flights
and arrangement travel become immediate; burst transitions become a short
opacity change. CSS movement uses the existing reduced-motion guard, with brief
opacity-only exceptions for preview development and the upload receipt.

## React Bits decision

Reviewed [React Bits installation](https://reactbits.dev/get-started/installation),
[Card Spread](https://pro.reactbits.dev/docs/components/card-spread),
[Modal Cards](https://pro.reactbits.dev/docs/components/modal-cards),
[Frame Scrub](https://pro.reactbits.dev/docs/components/frame-scrub), and
[Dappled Light](https://pro.reactbits.dev/docs/components/dappled-light).
Card Spread and Modal Cards are the closest conceptual fits, but the existing
pile, routes, permissions and uncropped media need their own choreography.
Frame Scrub and ambient light would be decorative additions rather than a
better expression of an existing action.

This pass uses original CSS and browser animation APIs, with no added runtime
dependency and no license key use. The
[Pro license](https://pro.reactbits.dev/license) restricts redistribution of
component source, including in open-source repositories. The free collection's
[license](https://github.com/DavidHDev/react-bits/blob/main/LICENSE.md) includes
the Commons Clause as well as MIT terms. Copying a component into this
AGPL repository therefore requires checking the particular redistribution
terms; the implementation here avoids that dependency entirely.

## Review coverage and limits

The review covered route and component source throughout the web app, and
baseline browser views at 1280px and 390px: timeline, photo, video, find,
people, milestones, upload, account, settings, members, groups, presence,
viewers, changes, removal flows and sign-in. The baseline captured 36 route
views and nine interaction states with no recorded browser errors.
First-run setup, invitation acceptance and completed transfers were reviewed
in source; the configured archive redirects setup/join entry points.

Browser verification uses the repository's isolated acceptance catalog,
fictional cartoon media, fake storage and disabled email delivery. It does not
exercise production storage or contact family members. Implementation details
and fallback behavior are in [motion.md](motion.md).
