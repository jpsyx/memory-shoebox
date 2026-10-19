# Motion in the web app

The motion layer in `apps/web/src/system/motion/` extends the existing paper
metaphor. It is presentation-only: it does not fetch an item, mark it seen,
change permissions, save settings or create upload progress. See the
[app-wide review](motion-review.md) for the design decisions and future work.

## Photo journey

A decoded timeline print becomes one temporary, inert, `aria-hidden` frame at
click time. It keeps the source photograph visible while navigation and decoding
finish. Both a matching route preview and the selected viewer hide their real
frames in a layout effect before paint. They retain their layout boxes and
accessible content. There is never an intentional full-size reveal before the
flight.

The matching selected image must decode and commit before arrival measures the
final frame on the next animation frame. The retained print then travels for
420ms; the in-app return uses 300ms. The same temporary frame survives loading
and flight, and the real destination becomes visible once on completion.

The temporary frame copies the source and destination paper, padding, shadow,
image backdrop and current image URL. Its fixed, layout-contained box changes
size independently of the page. `object-fit: contain` preserves photo proportions
as letterboxing changes, avoiding the unequal image scaling of the earlier
transform-only flight. Only this one inert frame animates size; the rest of the
page does not relayout for motion. The retained pixels are removed on completion
or cancellation and are never stored in an application cache.

Pending arrivals expire after 1.5 seconds and reveal the normal loading or error
state without a late animation. Unrelated navigation, membership changes,
resizing, wheel/touch scrolling and scroll keys or Escape cancel the journey.
Router scroll restoration can finish during loading; scrolling during a flight
cancels it because the measured destination may have moved. Preview replacement
releases its own hidden frame without retiring the selected destination's flight.
Old cleanup callbacks cannot remove a newer journey.

A visible matching print is required for the in-app return. Deep links,
unloaded source pictures, unavailable animation support, video, off-screen
destinations and reduced motion use normal navigation. Browser back continues
to work without a staged return animation. Returning focus to a print never
steals focus from another control.

The [photo transition review](photo-transition-review.md) records the flash
reproduction and the first-paint, interruption and browser checks for this handoff.

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

The photo-handoff regression additionally checks the first painted frame through
completion in Chromium and WebKit at desktop and mobile widths. Targeted tests
cover bounded loading, preview replacement, interruption and stale cleanup. See
the linked photo transition review for the measured evidence and limitations.
