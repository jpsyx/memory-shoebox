# Motion in the web app

The motion layer in `apps/web/src/system/motion/` extends the existing paper
metaphor. It is presentation-only: it does not fetch an item, mark it seen,
change permissions, save settings or create upload progress. See the
[app-wide review](motion-review.md) for the design decisions and future work.

## Photo journey

A decoded timeline print becomes one temporary, inert, `aria-hidden` frame at
click time. It keeps the source photograph visible while navigation establishes the destination layout. Both a matching route preview and the selected viewer hide their real
frames in a layout effect before paint. They retain their layout boxes and
accessible content. There is never an intentional full-size reveal before the
flight.

The first matching preview or selected viewer with usable geometry starts arrival
on the next animation frame, independently of the display image download or decode.
The retained thumbnail travels for 420ms; the in-app return uses 300ms. At landing,
the real destination shows its thumbnail until selected pixels decode, then upgrades
in place with a 100ms opacity transition. Preview replacement transfers the active
journey without restarting it. A slow display download cannot postpone enlargement.

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
Up to 16 prints unfold with a stagger capped at 60ms over 300ms opening motion. The independent CSS
translate, rotate and scale animation properties preserve each photograph's
existing seeded transform. Neighboring pile children settle into their new
positions in 300ms. Opening animations release their effects when finished.

Collapse retains the fan for a 200ms gathering transition, keeps its controls usable, then restores the cover and its keyboard focus. A generation
counter prevents cancelled exit callbacks from mutating a newer state.
Selection membership and expansion are independent: selected fans can collapse. Without animation support, collapse
still works immediately. Reduced motion uses a 120ms opacity transition.

Virtualized timeline fans retain the clicked cover origin while replacing it with
measured rows. Their complete paper roots use the same bounded unfold/gather
helpers. Menus, checkboxes, captions and selection marks share the root transform;
the main photo button and interactive overlays are siblings, never nested buttons.

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

Very narrow burst portraits reserve at least 80px of paper width so the 48px menu
target stays within the exposed paper. Images remain contained and uncropped;
virtualized fan packing uses the same minimum.
