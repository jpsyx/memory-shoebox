---
name: Memory Shoebox
description: An uncurated family archive rendered as a refrigerator door, not a gallery.
colors:
  panel: "#c9d6ed"
  print: "#fbfcfe"
  ink: "#12235e"
  ink-dark: "#12235e"
  accent: "#c2381f"
  accent-on-panel: "color-mix(in oklab, #c2381f 80%, #1b1f22)"
  accent-on-print: "#c2381f"
  on-panel-quiet: "color-mix(in oklab, #12235e 70%, #c9d6ed)"
  on-print-quiet: "color-mix(in oklab, #12235e 62%, #fbfcfe)"
  rule: "color-mix(in oklab, #12235e 26%, #c9d6ed)"
  rule-strong: "color-mix(in oklab, #12235e 50%, #fbfcfe)"
  panel-sunk: "color-mix(in oklab, #12235e 9%, #c9d6ed)"
  chip-black: "#1b1f22"
  chip-white: "#ffffff"
  porcelain-panel: "#e3e6e8"
  porcelain-print: "#ffffff"
  porcelain-ink: "#1b1f22"
  porcelain-accent: "#c2432a"
  slate-panel: "#232120"
  slate-print: "#fbfaf8"
  slate-ink: "#fbfaf8"
  slate-accent: "#e0693c"
  night-panel: "#0d1836"
  night-print: "#eef1f8"
  night-ink: "#eef1f8"
  night-accent: "#d84326"
typography:
  figure:
    fontFamily: "Familjen Grotesk, Archivo, sans-serif"
    fontSize: "clamp(2.75rem, 5vw, 4rem)"
    fontWeight: 700
    lineHeight: 0.85
    letterSpacing: "-0.04em"
    fontFeature: "tabular-nums"
  display:
    fontFamily: "Familjen Grotesk, Archivo, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Familjen Grotesk, Archivo, sans-serif"
    fontSize: "1.625rem"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.02em"
    fontFeature: "tabular-nums"
  title:
    fontFamily: "Familjen Grotesk, Archivo, sans-serif"
    fontSize: "1.3125rem"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Archivo Narrow, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: "0.12em"
rounded:
  none: "0"
  dot: "50%"
  pill: "999px"
spacing:
  sp-1: "0.5rem"
  sp-2: "0.875rem"
  sp-3: "1.375rem"
  sp-4: "2.25rem"
  sp-5: "3.5rem"
  tap: "3rem"
  spine: "13rem"
  tile: "9.5rem"
  tile-narrow: "6.5rem"
components:
  button-primary:
    backgroundColor: "{colors.ink-dark}"
    textColor: "{colors.print}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "0 1.375rem"
    height: "{spacing.tap}"
  button-primary-hover:
    backgroundColor: "color-mix(in oklab, #12235e 82%, #fbfcfe)"
    textColor: "{colors.print}"
  button-primary-disabled:
    backgroundColor: "transparent"
    textColor: "{colors.on-print-quiet}"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.ink-dark}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "0 1.375rem"
    height: "{spacing.tap}"
  button-panel:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "0 1.375rem"
    height: "{spacing.tap}"
  button-panel-filled:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.panel}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "0 1.375rem"
    height: "{spacing.tap}"
  button-panel-filled-hover:
    backgroundColor: "color-mix(in oklab, #12235e 82%, #c9d6ed)"
    textColor: "{colors.panel}"
  tag-pill:
    backgroundColor: "transparent"
    textColor: "{colors.ink-dark}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "0 1.375rem"
    height: "2.75rem"
  tag-pill-selected:
    backgroundColor: "{colors.ink-dark}"
    textColor: "{colors.print}"
    rounded: "{rounded.pill}"
  switch-track:
    backgroundColor: "{colors.print}"
    rounded: "{rounded.pill}"
    height: "1.875rem"
    width: "3.375rem"
  switch-track-on:
    backgroundColor: "{colors.ink-dark}"
    rounded: "{rounded.pill}"
  switch-thumb:
    backgroundColor: "{colors.rule-strong}"
    rounded: "{rounded.dot}"
    size: "1.375rem"
  switch-thumb-on:
    backgroundColor: "{colors.print}"
    rounded: "{rounded.dot}"
  people-field:
    backgroundColor: "{colors.print}"
    textColor: "{colors.ink-dark}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "0.3rem 0.875rem"
    height: "{spacing.tap}"
  combobox-dropdown:
    backgroundColor: "{colors.print}"
    textColor: "{colors.ink-dark}"
    rounded: "{rounded.none}"
    padding: "0"
  combobox-option:
    backgroundColor: "transparent"
    textColor: "{colors.ink-dark}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "0 1.375rem"
    height: "{spacing.tap}"
  composer-field:
    backgroundColor: "color-mix(in oklab, #12235e 6%, #fbfcfe)"
    textColor: "{colors.ink-dark}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "1.375rem"
  selection-bar:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.panel}"
    rounded: "{rounded.none}"
    padding: "0.875rem 1.375rem"
  switch-button:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "0 0.875rem"
    height: "2.75rem"
  switch-button-pressed:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.panel}"
  print:
    backgroundColor: "{colors.print}"
    rounded: "{rounded.none}"
    padding: "5px"
  print-in-fan:
    backgroundColor: "{colors.print}"
    rounded: "{rounded.none}"
    padding: "4px"
    height: "7.5rem"
  stack-count:
    backgroundColor: "{colors.chip-black}"
    textColor: "{colors.chip-white}"
    typography: "{typography.title}"
    rounded: "{rounded.none}"
    padding: "0.3rem 0.6rem"
  runtime-chip:
    backgroundColor: "{colors.chip-black}"
    textColor: "{colors.chip-white}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "0.15rem 0.45rem"
  unseen-dot:
    backgroundColor: "{colors.accent-on-panel}"
    rounded: "{rounded.dot}"
    size: "0.7rem"
  input-text:
    backgroundColor: "{colors.print}"
    textColor: "{colors.ink-dark}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "0 0.875rem"
    height: "{spacing.tap}"
  select-jump:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "0 2.75rem 0 0.875rem"
    height: "{spacing.tap}"
  timestamp-stamp:
    backgroundColor: "transparent"
    textColor: "{colors.ink-dark}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "0 0.75rem"
    height: "2.75rem"
  talk-panel:
    backgroundColor: "{colors.print}"
    textColor: "{colors.ink-dark}"
    rounded: "{rounded.none}"
    padding: "1.375rem"
  transport-bar:
    backgroundColor: "{colors.chip-black}"
    textColor: "{colors.chip-white}"
    rounded: "{rounded.none}"
    padding: "0.875rem"
---

# Design System: Memory Shoebox

## Overview

**Creative North Star: "The Refrigerator Door"**

An uncurated family archive is a refrigerator door, not a gallery. Things get
stuck up without anyone deciding, they accumulate, they overlap, and nobody
composed the result. The whole system is one enamelled domestic panel with
prints stuck flat on it: a fine speckled ground, thin white print borders,
a date spine down the left that never scrolls away, and exactly one saturated
accent that means "you have not seen this yet" and nothing else.

The load-bearing idea is the stack. A burst of forty near-identical frames is
one object you fan out in place, not forty tiles burying the rest of the day.
Nothing is cropped to a square, ever: cover-cropping a family archive cuts
faces out of it, so every print claims the height its own proportions need and
the pile is a multi-column flow that packs flush around them. The default
arrangement is **messy**: prints go up crooked and overlapping, seeded from
each print's index so the wall is stable across reloads rather than jittering
on every paint.

This world defines itself against two things it will not do. It refuses the
justified square grid under floating translucent date headers that every photo
cloud ships, and it refuses the precious dark curated gallery. There is no
`backdrop-filter` anywhere, no card shell around a photograph, and no
decorative drop shadow. Type is large by default because the audience skews
older and is mostly on phones: nothing in the ramp is under 15px, every tap
target clears 3rem (48px), and nothing depends on hover, long-press, or
precise dragging.

The system was derived from a throwaway reference application that is now retired.
The production app owns the [tokens](apps/web/src/styles/tokens/tokens.css) and
[Mantine theme](apps/web/src/theme/theme.ts) used by the surfaces in the
[design specification](docs/prds/2026-09-27-memory-shoebox/design-spec.md).
This file remains the authority for the design decisions below. The retired
source is recoverable from base commit `3e09157b`.

**Key Characteristics:**

- Four closed palettes, four inks each, every other value a `color-mix` of
  those four. **Day** (pale blue panel, navy ink) is the default.
- One accent, one meaning: unseen. Focus ring and caret only, as browser
  surfaces.
- Zero corner radius on every container, surface and photograph. Curves exist
  only where the shape itself is the message: the tag pill, the radio, the
  switch, and the two unseen dots.
- Prints, not cards: a white border and a contact shadow, no shell.
- Multi-column pile, no cropping, no square tiles, no justified rows.
- Tabular numerals on every count, every clock, every code field.
- Opaque chrome at every width; no translucency, no backdrop-filter.

## Colors

A closed four-ink palette per rendition, where the inks are named by what they
physically are (the panel, the print, the ink, the accent) rather than by
brand role, and every derived value is a `color-mix` in oklab of those four.
The frontmatter carries the **Day** rendition, which is the default, plus each
alternate rendition's four inks.

### Primary

- **Signal Red** (`accent`): the only saturated colour in the system, and it
  means one thing: an item or a day you have not seen yet. It appears as a
  0.7rem dot on an unseen print, as the dot and label in the spine's "31 new",
  and nowhere else in page chrome. Every rendition solves it twice, because
  the same accent cannot sit on both the panel and a white print: on a light
  panel `accent-on-panel` pulls down toward the ink, on a dark panel it pulls
  up toward the light, and `accent-on-print` corrects in the opposite
  direction so a marker on a white print stays legible. This is a real rule,
  not duplication.

### Neutral

- **Pale Sky Panel** (`panel`): the enamel ground of every surface, carrying a
  6px radial speckle at 13% ink that you only see when you look for it. Never
  a warm cream: a fridge panel is a cool neutral.
- **Print White** (`print`): the thin border around every photograph, the
  ground of the comments panel, the sign-in card, and every text input.
- **Deep Navy Ink** (`ink` / `ink-dark`): all body text, figures, rules,
  borders, and primary buttons. Each rendition owns exactly **one** dark ink.
  On the dark renditions `ink` is the light text on the panel and `ink-dark`
  is the dark the white prints still need; on the light renditions they are
  the same value.
- **Quiet Ink** (`on-panel-quiet`, `on-print-quiet`): month names, counts'
  units, timestamps, secondary prose. A mix of the ink into its own ground,
  never a separate grey.
- **Rules** (`rule`, `rule-strong`): the top bar's bottom edge and the switch
  border (`rule`, 26% ink into panel); input and quiet-button strokes
  (`rule-strong`, 50% ink-dark into print).
- **Sunk Panel** (`panel-sunk`): the recessed tone behind an opened fan, the
  switch well, and an image's own loading ground.
- **Chip Black / Chip White** (`chip-black` #1b1f22, `chip-white` #ffffff):
  the two rendition-independent values in the system, used only where a label
  must sit on top of an arbitrary photograph or inside the video transport:
  the frame count, the runtime chip, the transport bar.

### Named Rules

**The One Meaning Rule.** The accent means "not seen by you yet" and nothing
else. Switcher chips, primary buttons, pinned-comment stamps, the played bar, and
error text all carry ink instead. The focus ring and the text caret are the
only other accented things, and they are accented because they are browser
surfaces rather than page chrome.

**The Four Inks Rule.** A rendition declares exactly four inks: panel, print,
ink, accent. Every other colour in that rendition is a `color-mix(in oklab, …)`
of those four. A fifth hand-picked colour is a bug, and a second near-black
was one that got fixed.

**The Two Accents Rule.** Every rendition solves its accent twice, once for
the panel and once for a white print. Never reuse `accent-on-panel` on a
print, or the reverse.

**The Not-By-Hue Rule.** No state is carried by hue alone. An invalid field
gets a 2px ink border, a bold label, and an icon; it does not get red.

## Typography

**Display / Figure Font:** Familjen Grotesk (falling back to Archivo, then
sans-serif)
**Body / UI Font:** Archivo (falling back to `ui-sans-serif`, `system-ui`)
**Label Font:** Archivo Narrow

**Character:** Three self-hosted variable grotesks on a 400-700 axis. Familjen
Grotesk carries the figures and does the shouting; its tight negative tracking
at large sizes makes "212" read as a fact rather than a heading. Archivo is the
plain, wide, unhurried voice for everything a person reads. Archivo Narrow
condenses into tracked caps for the small labels so they never compete with
the day figures beside them.

### Hierarchy

- **Figure** (Familjen Grotesk 700, `clamp(2.75rem, 5vw, 4rem)`, line-height
  0.85, -0.04em, tabular): the day number in the spine. Quantities are the
  interface: in a pile, "212 photos" is the most useful fact on the screen.
- **Display** (Familjen Grotesk 700, 2.25rem, 1.08, -0.03em): the single lede
  on sign-in and the empty state, capped at 24ch.
- **Headline** (Familjen Grotesk 700, 1.625rem, tabular, -0.02em): the day's
  item count.
- **Title** (Familjen Grotesk 700, 1.3125rem, -0.02em): the instance name in
  the top bar, index card titles, the frame count on a stack.
- **Body** (Archivo 400, 1.125rem, 1.5): everything read as language. Comment
  bodies cap at 62ch, prose at 62ch, definition bodies at 68ch.
- **Label** (Archivo Narrow 600-700, 0.9375rem, +0.12em, uppercase): month
  names, the "Jump to" label, section headings in the comments panel, the unseen
  marker, and the switcher chips (at +0.10em).

### Named Rules

**The Fifteen Pixel Floor Rule.** Nothing in this system is set below
0.9375rem (15px), and body text starts at 1.125rem (18px). The audience skews
older and browses on phones; AA's minimum is not the floor here.

**The Tabular Count Rule.** Every number that can change carries
`font-variant-numeric: tabular-nums`: day counts, frame counts, the video
clock, the pinned timestamp, the six-digit code field. Counts must not shuffle
sideways as they tick.

## Layout

The archive is a two-column CSS grid, `13rem 1fr`, capped at 96rem and centred,
with `2.25rem 1.375rem 3.5rem` padding. The left column is the date spine; the
right is the pile. Each day is `display: contents`, so the spine and its pile
sit on one grid row and the spine can be `position: sticky` at `top: 5.5rem`,
clearing the sticky top bar. The spine never scrolls away, so you always know
where you are in time.

The pile is **CSS multi-column**, `columns: 9.5rem auto` with an 0.875rem
gutter, not a grid. A row grid can only keep real proportions by leaving holes
at the foot of every column, and a pile with holes stops reading as a pile.
Columns pack flush, crop nothing, and produce the varied heights a dump
actually has. It is also not the justified row grid the thesis refuses.

The spacing rhythm is a five-step ramp (0.5 / 0.875 / 1.375 / 2.25 / 3.5rem)
with a non-doubling, slightly irregular growth. Two further spatial constants
are named: `tap` (3rem) is the minimum interactive height anywhere, and `tile`
(9.5rem) is the pile's column width.

**Responsive.** Two breakpoints, both in `rem` so they track zoom. At 56rem
the item viewer collapses from `1fr 24rem` to a single column. At 44rem the
tile drops to 6.5rem, the archive becomes one column, and the spine stops
being a column **without stopping being a spine**: it goes `position: static`
and turns into an opaque in-flow baseline row (day figure at 2.25rem, month
beside it, count pushed to the right with `margin-left: auto`) under a 2px
ink border. It is never a floating translucent header. The whole system is
usable at 200% zoom with no horizontal scrolling.

### Named Rules

**The In-Flow Spine Rule.** The date spine is opaque and in flow at every
width. A translucent floating date header is the exact pattern this world
refuses, and shipping one at phone width is a regression, not a responsive
adaptation.

**The No-Crop Rule.** Nothing in the pile is cropped to a square. Every print
keeps its intrinsic ratio at whatever height it needs. The only `object-fit:
cover` in the system is on the 4.25rem burst-sibling thumbnails in the item
viewer, where the frames are near-identical by definition.

## Elevation & Depth

This system is flat by material and uses exactly one kind of shadow: a
**contact shadow**, the shadow a piece of paper lying on a panel casts. It is
structural, not ambient and never decorative: it exists so a print reads as
resting on the enamel rather than printed into it. It is always tinted from
#1b1f22 through `color-mix`, never pure black, and it never appears under
chrome. There is no `backdrop-filter` anywhere in the system, and no blurred
or translucent layer of any kind.

Depth otherwise comes from three devices: tonal layering (`panel-sunk` for a
recessed fan or switch well), the physical offset edges of a stack, and
z-order from the messy pile's seeded `--z`.

### Shadow Vocabulary

- **Print contact** (`box-shadow: 0 1px 2px color-mix(in oklab, #1b1f22 22%,
transparent), 0 4px 10px -4px color-mix(in oklab, #1b1f22 18%, transparent)`):
  every print in the pile.
- **Flat contact** (`box-shadow: 0 1px 2px color-mix(in oklab, #1b1f22 20%,
transparent)`): the prints under a stack, sibling thumbnails, the comments
  panel, index cards.
- **Frame contact** (`box-shadow: 0 2px 4px …20%…, 0 12px 28px -12px …28%…`):
  the single large item frame in the viewer.
- **Card contact** (`box-shadow: 0 2px 4px …20%…, 0 14px 30px -14px …30%…`):
  the sign-in card, the one surface that floats on an otherwise empty panel.
- **Marker halo** (`box-shadow: 0 0 0 2px var(--print)`): a 2px white ring
  that keeps the unseen dot legible over an arbitrary photograph. A ring, not
  a shadow.

### Named Rules

**The Paper-On-Panel Rule.** A shadow in this system describes one thing: a
print lying on the panel. If the element is not a photograph, a frame, or the
sign-in card, it gets no shadow. Chrome, buttons, chips, and inputs are flat.

**The Opaque Chrome Rule.** The top bar and the date spine are opaque
(`background: var(--panel)`). No `backdrop-filter`, no translucent floating
layer, anywhere, at any width. Translucent floating chrome is the pattern this
direction defines itself against.

## Shapes

**Zero radius everywhere, with one named exception.** Every rectangle in this
system is a square-cornered rectangle: prints, buttons, inputs, the select,
the comments panel, the cards, and every chip that sits over a photograph.
Rounded corners read as software chrome, and this world is made of paper and
enamel.

The exceptions are three, and they share one test: **a curve is allowed only
where the shape is the message, and squaring it would change what the thing
says.** Decoration never passes that test, which is why there are three of
them and not a house style.

**The tag pill.** A tag, a person, and an active filter are fully rounded
(`999px`), 2.75rem tall, with 1.375rem of side padding, a hairline
`rule-strong` stroke, and a solid-ink fill when selected. A pill is something
somebody wrote onto the archive; a square is something the software put there.
`mateo` and `Abuela Rosa` are the former; buttons, fields and the chips over a
photograph are the latter. A pill that is not a label is a bug, and so is a
label that is not a pill.

**The radio.** Round means one of these and square means any of these. That
distinction is learned rather than read, so squaring a radio turns it into a
checkbox for everyone who has ever filled in a form. Checkboxes stay square.

**The switch.** A `999px` track, 3.375rem by 1.875rem, holding a 1.375rem
circular thumb: print ground with a `rule-strong` stroke and a `rule-strong`
thumb when off, solid `ink-dark` with a `print` thumb when on. This is the
shape everybody already knows for on and off, and a squared one reads as a
checkbox somebody has drawn badly. The state is carried by the thumb's
position first and the fill second, so it survives being read without colour.
Mantine's dot inside the thumb is removed: a dot in a circle in a pill is one
ring too many for a flat system. The whole label row is the target, so it
clears the 3rem floor even though the track does not.

Circles otherwise are the two 0.7rem unseen dots (`border-radius: 50%`).

Borders are hairlines or structural strokes, never decoration: 1px `rule` on
chrome edges, 1px `rule-strong` on inputs, 1px ink on buttons and the
timestamp stamp, 2px ink on the jump select and the phone-width spine, 2px ink
on an invalid field, and a 5px ghost-frame border on empty prints. A print's
white "border" is not a border at all but 5px of `print` padding, so the
photograph sits inside the paper.

Icons are inline SVG on a 24px viewBox, 1.5rem, 1.75 stroke, round caps and
joins, `fill: none`, `stroke: currentColor`. Never a glyph font, never an
`<img>`.

The recurring silhouette is the tilted print: `rotate(var(--r))
translate(var(--dx), var(--dy))` where `--r` spans roughly ±2.5deg and the
offsets ±5px, all seeded deterministically from the print's index so the wall
is identical on every visit.

## Components

### Buttons

- **Shape:** square corners (0), minimum height 3rem (48px), horizontal
  padding 1.375rem, Archivo 600 at 1.125rem.
- **Primary:** solid ink on print (`ink-dark` background, `print` text, 1px
  ink border). Hover lightens the fill and border to 82% ink into print over
  150ms. Disabled goes transparent with a `rule-strong` border and quiet ink.
- **Quiet:** transparent with a `rule-strong` border and ink text; hover
  strengthens the border to full ink and washes 8% ink behind it.
- **Panel:** the quiet button when it sits on the enamel rather than on a
  print: `on-panel` border and text, 12% ink wash on hover.
- **Panel-filled:** the primary when it sits on the enamel rather than on a
  print: solid `on-panel` with `panel` text and an `on-panel` border, hover
  lightening to 82% into the panel. The primary above grounds itself in
  `ink-dark`, which is the dark a white print still needs, and on a dark
  rendition that is the panel's own colour: a filled button on the enamel
  there is the enamel, and the top bar's Add disappeared in Night. This is
  the rule § The Selection Bar already states, solid `on-panel` with `panel`
  text, which exists for exactly the same reason. **A filled button on the
  panel uses this and never `filled`.**
- **Focus:** 3px `accent-on-panel` outline at 2px offset on every focusable
  element, system-wide.

### Chips

- **Switcher chips** (rendition, pile arrangement): tracked Archivo Narrow
  caps at 0.9375rem in a 3px-padded `panel-sunk` well with a `rule` border,
  2.75rem tall. Selected state inverts to solid ink on panel text via
  `aria-pressed="true"`, never accent.
- **Over-photograph chips** (frame count, video runtime, restriction marker,
  selection tick): solid `chip-black` with `chip-white` text, **square**,
  small; the frame count in Familjen Grotesk 700 tabular, the runtime in
  Archivo Narrow 600 tabular with an inline play triangle. These stay square
  because they are the software labelling a photograph, not a person tagging
  one.
- **Tag pills** (a tag, a person, an active filter): the system's one curved
  shape. `999px`, 2.75rem tall, 1.375rem side padding, Archivo 600 at
  0.9375rem, a `rule-strong` hairline, inverting to solid ink when on. A
  dismissable filter carries a round 1.75rem cross inside the curve rather
  than against it.

### Reactions

The one tap that is the whole of what most of a circle will ever leave, on a
photograph, a video, or a comment. The same component in all three places,
because it is the same act.

Six choices, Facebook's set minus anger, which has no place in a family's
archive and would be the one reaction somebody regrets leaving on a
photograph of their mother. Sad stays, because a picture of somebody who has
died earns it.

Two decisions separate it from the pattern everybody copies. **Every choice
carries its word**, because the usual design hides the meaning of a face
behind a hover tooltip and this world refuses any interaction that needs
hover or a gesture to discover. And **the marks are stroked and monochrome**
rather than coloured emoji, because colour here means one thing: a row of six
bright badges would say "you have not seen this yet" six times over.

- **The action** is a pill, 2.75rem, a hairline stroke with the icon and the
  word "React". Once you have left one it inverts to solid ink and carries
  your own choice's word instead, and pressing it again takes it off.
- **The picker** is a popover of six pills, wrapping to two rows of three,
  each a 3rem target.
- **The summary** is the distinct marks in a row followed by a tabular total,
  pressable to open the list of exactly who left what. That list is also the
  answer to the question an admin actually has, which is who is still looking.

**Video conversations** retain the player and comments sidebar while using the
same rendition-aware ink/print tokens as the rest of Shoebox. Their outer
surface, player, fields and timestamp controls have square corners. A rounded
**reaction bar**, also called an **emoji bar** or **react bar**, is an intentional
exception: it groups expressive emoji choices into one compact control. The
video's standalone React button is removed. Comment actions are quiet inline
text with a heart: one click defaults to Love, a brief hover opens the reaction
bar, and a chevron offers the same choices to keyboard and touch users. These
video bars use emoji rather than the older monochrome reaction picker above.
Motion yields to reduced-motion preferences. A header **More** button opens the
item's supporting details in a square right-side drawer instead of extending the
page below the player. See [video conversations](docs/video-conversations.md).

### The Composer

The way in to the only social surface in the product, and therefore the least
default-looking thing on the comments panel. A viewer who cannot work out how
to leave a comment is a product failure, so it is built to be noticed: a 2px
ink rule separating it from the thread, an invitation set in Familjen Grotesk
700 at 1.3125rem rather than as a field label, and a `print-sunk` well with no
border except a 2px ink writing line along the bottom, which lifts to plain
`print` on focus. Its Send is the largest control on the panel at 3.25rem with
2.25rem of side padding, an inline send icon and 700 weight. It is still solid
ink: the accent means unseen, and an inviting button is made by size, not by
colour.

### The Selection Bar

What a bulk action is done from. Sticky under the top bar at 5rem, solid
`on-panel` ground with `panel` text and `panel`-stroked buttons, carrying a
tabular count in Familjen Grotesk 700 and the actions that apply to the whole
selection. It is inverted rather than tonal because a selection is a mode, and
a mode has to be impossible to be in by accident.

### The People Field

**There is one way people are chosen, everywhere in the product.** Typing
narrows a list; what has been chosen sits in the field as tag pills with the
remove cross inside the curve; the field grows downward rather than scrolling
its own contents out of sight. It replaced a checkbox list in some places and
a picker-plus-a-box-beside-it in others, and those were the same job done two
ways.

The dropdown is a square print panel on the card shadow, its options 3rem tall
with 1.375rem of side padding, grouped under tracked caps where the list mixes
kinds. Every option carries what it is already worth, tabular and pushed
right: a group's size, a member's role, or how many photographs a name is
already on. A name on 412 things and a name on one are different propositions,
and on tags that number is what tells a real tag from last week's typo of it.
A person with no photographs yet reads "none yet" rather than "0", and a name
being invented reads "new". The placeholder goes once anything is chosen,
because a placeholder beside pills reads as a half-filled field.

Its one variation is **whether a name the list has never heard of may be
added**, and that is a question about consequences rather than convenience:

- **Members only.** Groups, and the subjects of a visibility rule. Inventing a
  name here would be an invitation the field cannot send: putting somebody in
  a group only means anything once they can sign in.
- **Members and groups.** A visibility rule, where naming one group is shorter
  than naming nine people, so the groups are listed first.
- **Anyone.** People tags. Here the invention is the entire point: a name the
  archive has never heard of becomes a person in it and nothing more, something
  photographs can point at with no account and no way in. A great-grandmother
  worth tracking never has to hold a login, and inviting her later joins the
  two without losing the history.

The same field, in its inventing mode, is how a tag is put on anything.

### Cards / Containers

There are no card shells around photographs. The word "card" applies to two
things only: the sign-in dialog (`min(100%, 32rem)`, print ground, 2.25rem
padding, card contact shadow) and the prototype index list. Both are
square-cornered, borderless, and rely on the contact shadow alone.

### Inputs / Fields

- **Style:** print ground, 1px `rule-strong` stroke, zero radius, 3rem
  minimum height, `font: inherit` so the body size carries through.
- **Focus:** the system focus ring (3px accent outline, 2px offset). The caret
  is `accent-on-print`.
- **Error:** the border goes 2px and full ink, and the message below carries a
  stroked warning icon with bold ink text. No red, so the state survives
  anyone who cannot separate the hue.
- **Textarea:** minimum 5rem, `resize: vertical`, same stroke.

### Navigation

A sticky opaque top bar with a `rule` bottom edge, holding the instance name
(Familjen Grotesk 700) plus a quiet count line, then the switcher chips pushed
right. Item pages replace the name with a back link (inline SVG arrow plus
label, 3rem tall) that goes accent-free and only changes colour on hover. No
tabs, no menu, no drawer: the pile is the interface, and the chrome is the bar
plus the spine.

### The Date Spine

The fixed legend that a drifting field runs under. Sticky at 5.5rem on desktop;
an in-flow opaque baseline row below 44rem. Holds the day figure, the month in
label caps, a rule-topped count in tabular figures with a quiet unit word, and
the unseen marker when there is one.

### The Stack and its Fan

The signature component. A collapsed burst is one print with two pseudo-element
prints behind it, offset and tilted (`translate(10px, 7px) rotate(1.1deg)` and
`translate(5px, 3px) rotate(-0.6deg)`), plus a frame-count chip. Opening it
sets `column-span: all`, hides the pseudo-elements and the collapsed print, and
reveals the fan: a wrapping flex run of prints at a fixed 7.5rem height and
their real widths, each tilted by its seeded `--r` with
`transform-origin: bottom center` and overlapping by `margin-right: -1.6rem`,
on a `panel-sunk` ground. It is never a uniform grid of squares. The fan's head
(label plus the way out) is sticky at 4.5rem so a long burst cannot strand
anyone above the viewport. One 320ms `cubic-bezier(0.16, 1, 0.3, 1)` entry
animation: the only authored motion in the system.

### The Jump Rail

One control that moves the whole field, which is what a pile growing for years
needs when scrolling is the only other way in. A real native `<select>`, 3rem
tall, 2px ink border, panel ground, Familjen Grotesk 600, with the OS chrome
replaced by an authored inline-SVG caret. The element and its behaviour are
untouched, because the audience skews older and a native affordance beats an
invented menu.

### The Video Transport

An opaque `chip-black` bar under the frame: a square 3rem outlined play
button, a tabular clock, and a scrubber built from a 9px repeating tick rule,
a 3px track, a `print`-coloured played bar (ink, not accent), and 3px x 22px
pinned-comment marks. Each mark carries an invisible 44x44 `::after` pointer
target. A pinned comment is a bordered timestamp stamp in the thread that
seeks the video when pressed.

### The Empty Circle

Same world, no photographs: panel, spine, a "0" figure, a display lede, and
the pile's own footprint drawn as `ghost` frames, which are 5px borders of
14% ink into panel over a 4% wash. No card, no drop shadow, no illustration.

## Do's and Don'ts

### Do:

- **Do** derive every new colour as a `color-mix(in oklab, …)` of the
  rendition's four inks. If a value cannot be expressed that way, the design
  is wrong, not the palette.
- **Do** solve the accent twice for any new rendition: `--accent-on-panel` and
  `--accent-on-print` pull in opposite directions on a dark panel.
- **Do** keep every interactive target at 3rem (48px) minimum height, and give
  any small hit area an invisible 44x44 pointer target the way the scrubber
  marks do.
- **Do** put `font-variant-numeric: tabular-nums` on every figure that can
  change.
- **Do** let prints keep their intrinsic proportions and let the multi-column
  pile pack around them.
- **Do** seed any tilt, offset, or z-order from the item's index so the wall is
  identical on every reload.
- **Do** treat the pile arrangement (tidy / messy) as an instance-level
  setting: one wall for everybody in the circle, not a per-viewer preference.
- **Do** carry state in weight, border thickness, icon, and case as well as in
  colour.

### Don't:

- **Don't** use the accent for anything except "not seen by you yet". Not for
  a primary button, a selected chip, a played bar, an error, a link, or a
  brand flourish. Focus ring and caret are the only exceptions, and only
  because they are browser surfaces.
- **Don't** add `backdrop-filter`, translucency, or a floating chrome layer
  anywhere, at any width.
- **Don't** crop a photograph to a square, and don't render an opened burst as
  a uniform grid of tiles.
- **Don't** wrap a photograph in a card shell, and don't add a shadow to
  anything that is not a print, a frame, or the sign-in card.
- **Don't** introduce a corner radius beyond the ones the system names. Zero is
  the radius for everything the software draws; `999px` belongs to the tag
  pill and the switch track; circles are the radio, the switch thumb, and the
  two unseen dots. A rounded button, card, input or print is a bug, and so is
  a new curve justified by anything other than the shape being the message.
- **Don't** introduce a fifth colour, a second dark ink per rendition, or a
  grey that is not a mix of the rendition's own inks.
- **Don't** set any text below 0.9375rem (15px).
- **Don't** replace the native `<select>` with an invented menu, or build any
  interaction that needs hover, long-press, precise dragging, or a gesture the
  user has to discover.
- **Don't** add handwriting faces, tape, pushpin, or paper-texture ornament.
  The fridge door is the structure, not a skin.
