# Motion in the web app

The motion layer in `apps/web/src/system/motion/` extends the existing paper
metaphor. It is presentation-only: it does not fetch an item, mark it seen,
change permissions, save settings or create upload progress. See the
[app-wide review](motion-review.md) for the design decisions and future work.

## Photo journey

A decoded timeline print records its item identity, geometry, source surface
and intended route when explicitly opened. The pending geometry expires after
1.5 seconds. The matching viewer waits for the selected display image to decode and commit,
then measures on the next frame so layout and scroll restoration can finish.
A loading thumbnail or retained preview cannot start the viewer flight. It then draws one temporary,
inert, `aria-hidden` photograph above the real destination for a 560ms flight.
The real destination remains in the document and is restored on completion
or cancellation. The temporary frame copies the destination paper padding,
background and shadow, plus the image backdrop and currently selected pixels,
so letterboxed photos retain their blue inset through the handoff. No source
image URL is retained in the snapshot.

The in-app back link stages the reverse flight. A visible matching print is
required; deep links, unloaded pictures, unavailable browser APIs, video,
off-screen destinations, unrelated routes and reduced motion use normal
navigation. Browser back continues to work without a staged return animation.
Unmounting the destination and changes to signed-in membership clear retained
motion. Returning focus to a print never steals focus from another control.

## Burst choreography

Opening a fan captures the cover's position and the neighboring pile layout.
Up to 16 prints unfold with a stagger capped at 154ms. The independent CSS
translate, rotate and scale animation properties preserve each photograph's
existing seeded transform. Neighboring pile children settle into their new
positions in 460ms. Opening animations release their effects when finished.

Collapse retains the fan for a 220ms gathering transition, temporarily makes
its controls inert, then restores the cover and its keyboard focus. A generation
counter prevents cancelled exit callbacks from mutating a newer state.
Selection-pinned fans cannot collapse. Without animation support, collapse
still works immediately. Reduced motion uses a 120ms opacity transition.

## Arrangement preview

The miniature prints have stable, unique view-transition names. The native
View Transition API snapshots an explicit Tidy/Messy change and carries the
prints for 480ms. Changes are synchronous React updates inside the snapshot
callback; the existing form owns persistence. Rapid changes skip the preceding
transition. The root snapshot does not crossfade or block pointer input.
Unsupported browsers and reduced motion apply the form change directly.

## Supporting CSS motion

Upload holders settle when mounted, decoded previews fade in, and the finished
upload outcome arrives as a paper receipt. Selection marks stamp down;
selected photo emoji bloom without moving their button's hit area. Mounted
conversation groups and reply forms settle a few pixels into position.
These animations do not replay on ordinary progress or query updates while
React retains the same DOM identity.

The global reduced-motion rule removes spatial CSS animation. Preview and
receipt styles explicitly substitute short opacity-only treatments. Existing
Mantine drawer/popover behavior and video reaction overlays remain in place.

## Verification

Unit coverage checks photo identity, route matching, expiry, completion,
interruption, reduced motion, arrangement fallback and burst keyboard focus.
Browser checks at 1280px and 390px exercised both photo-flight directions,
burst opening and Escape collapse, arrangement snapshots and unsupported-browser
fallback, upload previews and settled-upload rendering, and reduced motion.
The isolated acceptance fixture recorded no page errors. CSS poses and keyframe values are reviewed visually rather than
asserted by tests that merely repeat their implementation.

The completed pass passed all 4,222 repository tests, workspace type checking,
formatting, lint and production build. A fresh independent code review verified
interruption and focus fixes with no remaining material findings.
