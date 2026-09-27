# Design spec

Companion to the mockups in [`prototypes/`](../../../prototypes). Every
surface, how somebody moves between them, and the rules the mockups encode but
cannot state in a picture.

The visual system is [`DESIGN.md`](../../../DESIGN.md) and is cited here, never
duplicated: two copies of a token scale is one copy and one lie, and the one
here would be the stale one. What the product _does_ is
[`PRD.md`](PRD.md).

Run `pnpm dev:prototypes` and open any surface. Every state is a URL.

## Surfaces

Seventeen. Five settled the visual language first; all seventeen are now
mocked in `prototypes/`. Each row names the states that have to be designed,
not just the happy path, because the states are where these go wrong.

### Member surfaces

| #   | Surface               | Who      | States that have to be designed                                                                                                                                                                                                                                                                                           | Status     |
| --- | --------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | **Sign in**           | anyone   | Email entry; code entry; wrong code; expired code; resend; unknown address, which must look identical to a known one                                                                                                                                                                                                      | prototyped |
| 2   | **The timeline**      | all      | The pile by day; a burst closed and fanned; a milestone inline; a milestone spanning several days; a milestone with nothing attached; a day with one item; filtered; the end of the archive                                                                                                                               | prototyped |
| 3   | **One photo**         | all      | Full frame; its burst siblings; comments; tags and people; the visibility control for uploaders; delete for the uploader                                                                                                                                                                                                  | prototyped |
| 4   | **One video**         | all      | Playing and paused; comments pinned to a moment; a comment being pinned; no comments yet                                                                                                                                                                                                                                  | prototyped |
| 5   | **Empty archive**     | all      | Brand new instance, nothing uploaded; and a viewer who can see nothing because everything is restricted                                                                                                                                                                                                                   | prototyped |
| 6   | **Filter and search** | all      | By tag, by person, by date range; several filters at once; no results; clearing back to the whole pile                                                                                                                                                                                                                    | new        |
| 7   | **People directory**  | all      | Everyone tagged in the archive; members and non-members shown alike; somebody with no photographs yet                                                                                                                                                                                                                     | new        |
| 8   | **Upload**            | uploader | Select; grouped by capture day, because one upload is routinely several; a selection and the bulk actions on it (tag, person, milestone) and what each looks like once applied; the visibility step pre-filled to everyone; in progress; partial failure; a file type refused; done. **The product's promise lives here** | new        |
| 9   | **My account**        | all      | Email, which can never be changed; my name, which can be corrected; a switch per kind of notification and a turn-them-all-off; my devices with last-used; signing a device out; signing out the one I am on                                                                                                               | new        |
| 10  | **Request removal**   | all      | Asking, with an optional reason; already requested; the uploader's and admin's view of the request                                                                                                                                                                                                                        | new        |

### Admin surfaces

| #   | Surface                  | States that have to be designed                                                                                                                                                                                                                                                    | Status |
| --- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 11  | **Shoebox settings**     | The Shoebox's name, and the pile arrangement, both deployment-wide rather than per person                                                                                                                                                                                          | new    |
| 12  | **Members**              | The list with roles; invite by email; invitation pending; resend or revoke an invitation; change a role; remove a member; revoke any device                                                                                                                                        | new    |
| 13  | **Groups**               | The list; create; rename; add and remove members; delete a group that visibility rules still reference                                                                                                                                                                             | new    |
| 14  | **Milestones**           | Create with a date and create one that ran for days; create from nothing and then find its photographs; edit; attach items; reconcile items captured outside the span; delete; a milestone with nothing attached                                                                   | new    |
| 15  | **Removal requests**     | Open requests; acting on one by deleting; declining one, and what the requester is told                                                                                                                                                                                            | new    |
| 16  | **Transactional emails** | Sign-in code; invitation; upload session; new comment; removal request; a request resolved by deletion; a request declined, carrying the decliner's own words; the weekly reminder on one nobody has answered. Each has to read well in a plain client and survive being forwarded | new    |
| 17  | **Who has been looking** | A row per member: last signed in, days active, items opened, comments written, reactions left, ordered by who is most present; who has opened one photograph; a member who has never signed in; and a plain statement of what is not recorded                                      | new    |

Three carry more weight than the rest:

- **Upload (8)** is where "dump it all" either survives or quietly becomes
  curation. The visibility step must read as a step you skip.
- **Sign in (1)** is first contact for the least technical person in the
  circle, and the only surface where failure means no access at all.
- **Emails (16)** are the only surface most viewers see regularly, because
  they are the thing that brings somebody back.

**Surface 17 is admin only** and answers the question the owner asked in those
words: who cares. Not analytics. The figures are all "is this person here", and
the surface says out loud what the product refuses to record, which is most of
what analytics would collect.

## User flows

Each step names the surface and the state id, so any of them can be opened.
The failing branches are listed with the flows they belong to rather than in a
section of their own, because that is where somebody meets them.

### Arriving for the first time

1. **Sign in** `link`. A grandmother opens a URL somebody texted her. The page
   names who shared and how many, and shows nothing of the content: a link is
   an address, never a credential.
2. **Sign in** `email`. She types the address the invitation went to.
3. **Sign in** `sent`. The code is on its way. The copy is identical to
   `unknown`, deliberately, so the form cannot be used to discover who is a
   member.
4. **Sign in** `wrong` if she mistypes, counting down from three tries.
   `expired` after ten minutes, `resent` after asking for another.
5. **The timeline** `pile`, seeded so that nothing is marked new: the accent
   dot means "arrived since you joined", which it cannot mean on day one.

**Where it fails:** an unknown address reaches `unknown`, which is byte
identical to `sent`. Mail being down is invisible here on purpose and surfaces
only to an admin, on **Shoebox settings** `mail-failing`.

### Looking at a day, and saying something

1. **The timeline** `pile`. Days descend, each with its own count and its
   unseen count.
2. **The timeline** `burst`. A run of near-identical frames is one object until
   it is fanned.
3. **One photo** `viewer`. Opened from the pile. Its burst siblings stay
   visible, because in a pile you are always somewhere inside a run.
4. **One photo** `reactions`, or the composer at the foot of the panel.
5. **One video** `paused` to `playing`, and `pinning` to attach a comment to a
   moment on the transport.

**Where it fails:** **One photo** `quiet` and **One video** `quiet` are the no
comments yet states, where the composer is the surface rather than an
afterthought under an empty list.

### Putting a batch up

1. **Upload** `select`. Everything at once, not the best six.
2. **Upload** `days`. The batch groups by capture day, because one upload is
   routinely several weeks.
3. **Upload** `selection` to `tag` to `tagged`, `person` to `people-tagged`,
   `milestone` to `milestone-assigned`. Bulk actions on a selection, each with
   its after state, because an action whose result is invisible gets repeated.
4. **Upload** `milestone-new` creates an occasion inline; `milestone-fix`
   reconciles photographs captured outside its span.
5. **Upload** `visibility`, pre-filled to everybody so it reads as a step you
   skip.
6. **Upload** `sending` to `done`. One email when the last file lands.

**Where it fails:** `partial` when some files did not arrive, and `resume` when
the tab was closed, which finds the batch again with its edit plan intact and
asks only for what is missing.

### Asking for a photograph to come down

1. **One photo** `viewer`, by somebody tagged in it. The only action a viewer
   has on somebody else's photograph.
2. **Request removal** `ask`, with an optional reason.
3. **Removal requests** `open`, seen by the uploader and every admin.
4. **Removal requests** `deleting` or `declining`, then `settled`.
5. **Transactional emails** `removal-gone` or `removal-declined` closes the
   loop with the person who asked.

**Where it fails:** silence. **Transactional emails** `removal-reminder` is the
one message in the product that chases, weekly, because a request answered with
nothing turns back into the phone call this flow replaced. **Request removal**
`already` is what a second attempt meets.

### Running the Shoebox

1. **My account** `default`. The five admin doors live here rather than on
   everybody's top bar.
2. **Members** `invite` to `pending`, **Groups** `create` to `edit`,
   **Milestones** `create` to `attach`, **Shoebox settings** `default`.
3. **Who has been looking** `default`, which answers whether the people
   invited are actually here.

**Where it fails:** **Members** `last-admin` refuses to leave the Shoebox
without one. **Groups** `delete-used` states what deleting a group does in both
directions, because removing it from an `except` rule widens access rather than
narrowing it.

## Component design tokens

See `DESIGN.md` § Colors, § Typography, § Layout, § Shapes.

Specific to these surfaces and not in `DESIGN.md`:

- **`--pill: 999px`**, the one curve in the system, and it means one thing:
  this is a label, not a control. Tags, people and active filters are pills;
  buttons, inputs, prints, chips over a photograph and every container stay
  square. The radio and the switch are the two exceptions, because in both the
  shape is the message.
- **`--tile` collapses to `--tile-narrow`** at 44rem, which is the only token
  that changes with the viewport.
- **The Mantine theme** in `prototypes/src/theme/theme.ts` is this system
  expressed in the library the product ships with: `createTheme`, a
  `cssVariablesResolver` writing the palette into both colour-scheme blocks, a
  `variantColorResolver` for the six button variants, and
  `Component.extend({ classNames })` for each adaptation. It is meant to move
  into `apps/web` as it is.

## Interactive states

**Nothing may depend on hover.** The reactions control is the worked example:
six choices, each carrying its word, because a tooltip is unreachable on the
phone most viewers hold and silent to a screen reader. See `DESIGN.md` §
Reactions.

| Component     | Rest                                | Hover                                                                        | Focus                       | Disabled                                                                      |
| ------------- | ----------------------------------- | ---------------------------------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------- |
| Print         | Flat on the panel, `--shadow-print` | Lifts 2px, `z-index: 2`. Messy pile scales 1.03 to 1.07 keeping its rotation | 3px accent ring, 2px offset | n/a                                                                           |
| Button        | Variant fill                        | Background shift, 150ms                                                      | Same ring                   | Transparent, hairline `--rule-strong`, quiet ink. Never opacity               |
| Chip          | Hairline `--rule-strong`, pill      | 8% currentColor tint, border to currentColor                                 | Same ring                   | `quiet`: `--rule-print` border, quiet ink, no hover response, `aria-disabled` |
| Input         | 1px border                          | n/a                                                                          | Same ring                   | `--print-sunk` ground, quiet ink, `opacity: 1` so it stays readable           |
| Input, error  | 2px `--on-print` border             | n/a                                                                          | Same ring                   | n/a                                                                           |
| Reaction      | Stroked monochrome                  | Tint                                                                         | Same ring                   | n/a                                                                           |
| Scrubber mark | Notch on the graticule              | Grows                                                                        | Same ring                   | n/a                                                                           |
| Person card   | Print with a name under it          | Face lifts                                                                   | Same ring                   | n/a                                                                           |

**The focus ring is one rule for the whole product**: `3px solid
var(--accent-on-panel)` at `2px` offset, on `:focus-visible` only, applied to
both native controls and Mantine's own focus classes so there is exactly one.

**Transitions are 140 to 150ms on `--ease`**, and only three things move: a
print lifting, a button's background, and the composer's ground. Everything
else is instant.

**Loading is not designed**, because nothing here is wired to anything. See the
last section.

## Spacing and layout

See `DESIGN.md` § Layout, § Elevation & Depth.

| Surface                                                   | Structure                                                                    |
| --------------------------------------------------------- | ---------------------------------------------------------------------------- |
| The timeline                                              | `.archive` is a two-column grid: a `--spine` sticky date column and the pile |
| One photo, One video                                      | `.viewer` is two columns: the frame and its siblings, then the talk panel    |
| Upload, Members, Groups, Milestones, Who has been looking | `.pageWide`, sheets stacked in a single column                               |
| Sign in                                                   | `.centred`, one card                                                         |

The pile is `--tile` wide per print with no cropping: every photograph keeps
the height its own proportions need, which is why a stored EXIF orientation bug
would be a layout bug rather than a cosmetic one.

## Responsive behaviour

Three breakpoints, and only three, each earning its place:

| Breakpoint | What changes                                                                                                                                                                                                                         | Why                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| **56rem**  | `.viewer` collapses to one column                                                                                                                                                                                                    | The talk panel goes under the frame rather than beside it |
| **44rem**  | `.archive` collapses to one column; `.spine` stops being a column and becomes an in-flow row, opaque, wrapping, with a 2px rule under it; `--tile` becomes `--tile-narrow`; the day figure drops to `--step-3`; `.requestRow` stacks | The phone, which is what most viewers hold                |
| **40rem**  | `.viewerPreview` stacks                                                                                                                                                                                                              | The one place a photograph sits beside prose              |

**The spine stops being a column without stopping being a spine.** It stays
opaque and in flow at every width: a floating translucent header is the exact
pattern this world refuses, and the date is load-bearing rather than
decorative.

Everything else is fluid. The prints wrap, the sheets are single-column
already, and the tables scroll rather than reflow.

## Accessibility

See `PRODUCT.md` § Accessibility & Inclusion for the commitments. This records
what was measured and what is specific to these surfaces.

**Contrast.** Measured in Chromium across 357 text nodes, six pages and three
renditions, including the fanned stack, hover, disabled, focus-ring and
placeholder states: **zero failures**. The measurements are recorded in
`.impeccable/config.json` beside the detector rules they overrule, because the
detector reads `color-mix(… 12%, transparent)` hover tints as solid accent
fills and reports false positives. Sampled results: `btn--panel:hover` is
10.92:1 porcelain, 12.41:1 slate, 8.80:1 mint.

**Type floor.** Nothing under 15px (`--micro: 0.9375rem`). The audience skews
older and this is the floor that decision produced.

**Target size.** 2.75rem minimum on every control (`--tap: 3rem` for the
generous case). Chips, buttons and the reaction control all meet it.

**Focus.** One ring, described above, on `:focus-visible` only so a mouse user
never sees it and a keyboard user always does. Mantine's own ring is
overridden rather than left to coexist.

**Keyboard.** Every interactive element is a real `button`, `a` or input:
there are no `div` click handlers anywhere in the prototypes, so tab order is
document order and needs no `tabindex`. Modals are Mantine's, which trap focus
and restore it on close. The one custom control that could have been a div,
the scrubber mark, is a `button` with its own `:focus-visible`.

**Screen reader.** `aria-label` on the ten controls whose text is an icon or a
figure; `aria-hidden` on the ten decorative SVGs; `aria-pressed` on the four
toggles; `aria-current` on the two "you are here" markers; `aria-disabled` on a
filter chip that would return nothing, **so it stays focusable and announced
rather than being removed from the row**. `.visually-hidden` carries the text a
sighted reader gets from position, such as which comment a timestamp jumps to.

**Alt text** is composed at render from the people tags and the capture date,
with an optional override on the item viewer. It is therefore always present
and never null. See `PRODUCT.md` § How it works.

**Motion.** `prefers-reduced-motion: reduce` collapses every animation and
transition to 0.001ms globally. Nothing in the product depends on movement to
convey meaning, so this removes decoration only.

**Colour is never the only signal.** The accent means exactly one thing, unseen
by you, and it always appears with a count or a word beside it.

## What the mockups deliberately do not show

No loading states, no skeletons, no transitions between surfaces, no optimistic
updates, no API and no database. Nothing in `prototypes/` is wired to anything.

The absence of a spinner is not a decision that there is no loading. Whoever
builds these surfaces owns that, and `tech-specs/apis/` says which calls are
slow enough to need one.
