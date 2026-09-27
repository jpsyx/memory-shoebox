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

To be written from the prototypes, one subsection per flow that crosses more
than one surface, numbered by surface and state id, **including the flows that
fail**. The failure flows are the ones that pay off later: every product
designs the happy path, and the reason a contract phase finds holes is that
nobody wrote down what happens when the upload dies halfway.

## Component design tokens

See `DESIGN.md` § Palette, § Type, § Space.

Specific to these surfaces and not in `DESIGN.md`:

- `--pill: 999px`, the one curve in the system. It means "this is a label, not
  a control": tags, people and active filters are pills; buttons, inputs,
  prints, chips over a photograph and every container stay square. The radio
  and the switch are the two exceptions, because in both the shape is the
  message.
- The Mantine theme in `prototypes/src/theme/theme.ts` is the design system
  expressed in the UI library the product ships with, and is meant to move into
  `apps/web` as it is.

## Interactive states

Nothing in this product may depend on hover. The reactions control is the worked
example: six choices, each carrying its word, because a tooltip is unreachable
on the phone most viewers hold and unreadable to a screen reader.

To be completed per component class: rest, hover, focus, active, disabled,
loading, error.

## Spacing and layout

See `DESIGN.md` § Space.

## Responsive behaviour

To be written per surface, naming the surfaces that are genuinely different at
a breakpoint rather than merely narrower. Those are the ones a developer gets
wrong.

## Accessibility

See `PRODUCT.md` § Accessibility & Inclusion for the commitments. This section
records the measured results and the per-surface specifics.

- **Contrast:** measured across 357 text nodes, six pages and three renditions,
  including the fanned stack, hover, disabled, focus-ring and placeholder
  states: zero failures. Recorded in `.impeccable/config.json` with the
  measurements, because the detector reads `color-mix` hover tints as solid
  fills and reports false positives.
- **Type floor:** nothing under 15px, which is the older-adult floor the
  audience needs.
- **Alt text:** generated from the people tags and the capture date, with an
  optional override on the item viewer. Always present, never null.
- **Keyboard, screen reader, motion and target size:** to be completed per
  surface.

## What the mockups deliberately do not show

No loading states, no transitions, no API. Nothing in `prototypes/` is wired to
anything. The absence of a spinner is not a decision that there is no loading.
