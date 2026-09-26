---
version: 1
slug: "prototypes-archive-html"
primary_target: "prototypes/archive.html"
related_targets:
  [
    "prototypes/item.html",
    "prototypes/item-video.html",
    "prototypes/signin.html",
    "prototypes/empty.html",
  ]
---

---

version: 1
slug: "prototypes-archive-html"
primary_target: "prototypes/archive.html"
related_targets:
[
"prototypes/item.html",
"prototypes/item-video.html",
"prototypes/signin.html",
"prototypes/empty.html",
]

---

---

version: 1
slug: "prototypes-archive-html"
primary_target: "prototypes/archive.html"
related_targets:
[
"prototypes/item.html",
"prototypes/item-video.html",
"prototypes/signin.html",
"prototypes/empty.html",
]

---

---

version: 1
slug: "prototypes-archive-html"
primary_target: "prototypes/archive.html"
related_targets: ["prototypes/item.html","prototypes/item-video.html","prototypes/signin.html","prototypes/empty.html"]

---

Scope: four throwaway prototype surfaces in `prototypes/` (the archive, one
item, one video, arriving from a link, and an empty circle), built to settle
the visual world before any product implementation. Visitor mode: Operate.
Scanability and the real usage scene outrank expression; brand lives in
precise details.

Audience: the owner dumping a day off a phone without choosing between shots,
and invited viewers who skew older, are on phones, and browse at leisure.
Job: get everything up without deciding, and let the circle find what they
like in it. Constraints: WCAG 2.2 AA plus the older-adult floor in PRODUCT.md.
The archive is uncurated by design: bursts, near-duplicates, and dozens of
frames of one moment are the normal data, not an edge case.

## Direction contract

THESIS: An uncurated family archive is a refrigerator door, not a gallery.
Things get stuck up without anyone deciding, they accumulate, they overlap,
and nobody composed the result. This surface owns the pile: a dense domestic
panel where a burst of forty near-identical frames is one stack you fan out
rather than forty tiles burying the day. It refuses the justified grid with
floating translucent date headers that every photo cloud ships, and refuses
its opposite, the precious dark curated gallery.

OWN-WORLD: An enamelled domestic panel. Pale porcelain ground with a fine
speckle; prints sitting flat on it with thin white borders at varied tile
sizes; bursts rendered as layered stacks with visible offset edges; a fixed
date spine down the left in label type; one saturated accent that means
unseen and nothing else. No card shells, no drop shadows as decoration, no
handwriting. Recognisable with every photograph removed.

STORY: The viewer understands this is everything, not a selection. They
believe browsing it is their business and not the owner's work. They scroll a
day, fan a stack, stop at one frame, and say something.

FIRST VIEWPORT: Porcelain ground. A fixed date spine on the left holds the
day and its count in large figures. The pile fills the remaining width as a
dense grid of bordered prints at mixed sizes, roughly 6 columns at desktop,
with one burst visibly stacked. Nothing is cropped to a square. The primary
action is scrolling; the only chrome is the spine and a single unseen marker.

FORM: The refrigerator door, candidate 6 of seven grounded candidates,
assigned by the roll. Seed key 4eb8bb58, scope direction, mode operate,
re-roll round 1.

RAISE (Miura deployable sheet, declined): one control propagates across the
whole field. A single date control jumps the entire archive rather than
paging it. Built as a native select at the head of the spine rail, because the
audience skews older and a native affordance beats an invented one here.

RAISE (gravity-rain garden, declined): one visual property encodes exactly one
rule. The accent means unseen-by-you, everywhere, and is never decoration.

RAISE (nixie counter, declined): quantities are the interface. Counts are
first-class lit figures, because in a pile "212 photos" is the most useful
fact on the screen.

RAISE (normalled jackfield, declined): a fixed legend strip stays put while an
endless field drifts under it. The date spine never scrolls away, so you
always know where you are in time.

Competitive alternates, not built: Metro typographic tiles (deletes chrome
entirely so tiles are the only doors; holds product clarity, loses audience
identification) and Studio Dumbar modular identity (flat colour blocks and
photographic reality sharing one grid; same trade).

FINISH: unreviewed and undocumented is unfinished; this build ends with the
finish review, the verdict, DESIGN.md, and every shipping raster carrying its
provenance.

Superseded: the aerogramme direction from the first round. It was derived from
the product's name rather than its use, and it encodes curation, one composed
sheet with one caption, which is the opposite of what this product does.

Resolved by the user after the build: the panel is **Day**, a pale blue ground
with navy ink, and the pile arrangement is **messy**, prints stuck up crooked
and overlapping. The mess is not to be pushed further. Tidy versus messy is an
instance-level setting in the product, not a per-viewer preference; recorded in
PRODUCT.md under Instance settings.

Corrected after the finish review, and binding on DESIGN.md:

- The date spine is opaque and in flow at every width. A translucent floating
  date header is the exact pattern the THESIS refuses, and the first build
  shipped one at phone width.
- The top bar is opaque. No backdrop-filter anywhere.
- Nothing is cropped to a square: every print keeps its real proportions. A
  measured row grid was tried first and abandoned, because keeping proportions
  on a row grid leaves holes at the foot of every column and the pile stops
  reading as a pile. The shipped pile is CSS multi-column, which packs flush,
  crops nothing, and is not the justified row grid the thesis refuses. The
  cost, accepted: reading order within a day is column-major.
- An opened burst is a fanned run of overlapping, tilted prints at their real
  proportions, never a uniform grid of squares.
- The accent means unseen and nothing else. Switcher chips, primary buttons,
  pinned-note pills, the played bar and error text all carry ink instead.
  Focus ring and caret stay accented as browser surfaces.
- The empty circle is built from panel, spine, figures and empty print frames.
  No card, no drop shadow.

Unresolved: the product name; anything about functionality, which this round
does not decide.
