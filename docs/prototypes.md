# Prototypes (`prototypes/`)

A Vite single-page application holding high-fidelity, non-functional mockups
of every surface in [`design-spec.md`](prds/2026-09-27-memory-shoebox/design-spec.md), built from the tokens in
[`../DESIGN.md`](../DESIGN.md).

It is a workspace package (`@memory-shoebox/prototypes`) so it type-checks,
lints and formats with everything else, but it ships with nothing: no API, no
database, no authentication, no upload. Every surface renders from fixtures in
`prototypes/src/data`, and every control that would change something does
nothing.

```sh
pnpm dev:prototypes    # http://localhost:5174
```

## Why it exists

The spec names seventeen surfaces and, for each one, the states that have to be
designed rather than just the happy path. Arguing about those in prose is slow
and imprecise: it is much faster to look at "the upload batch that half
worked" than to describe it. So each state is built, addressable by URL, and
switchable from a rail at the foot of the window.

It is also where the data model comes from. The tables, the API routes and the
contract are meant to be derived from these surfaces, not the other way round,
because a schema designed before the screens usually turns out to be missing
the one field the screen needed.

## Structure

| Path            | What it holds                                                                                                   |
| --------------- | --------------------------------------------------------------------------------------------------------------- |
| `src/styles/`   | `tokens.css` (the design tokens), `global.css`, `fonts.css`                                                     |
| `src/theme/`    | The Mantine theme and the component adaptations attached to it                                                  |
| `src/system/`   | The world Mantine does not give us: prints, the spine, the pile, the stack, the talk panel, the video transport |
| `src/data/`     | The media catalog and the written demonstration fixtures                                                        |
| `src/surfaces/` | One module per surface, each exporting a `Surface` with its states                                              |
| `src/harness/`  | The rail, the index of surfaces, and the rendition and pile switches                                            |

A surface is a plain object: a number, a title, a blurb, and a list of states
that each carry a label, a one-line note explaining what the state is showing,
and a render function. `src/surfaces/index.ts` is the registry, and
`src/router.tsx` turns it into `/s/<surface>?state=<state>`.

## How the design system is expressed

Two files, and they are meant to move into `apps/web` roughly as they are.

**`src/styles/tokens.css`** carries colour and scale. A rendition declares
exactly four inks (panel, print, ink, accent) and every other value in it is a
`color-mix` in oklab of those four. That is why switching renditions is one
attribute on `<html>` rather than a second stylesheet, and why a fifth
hand-picked colour is a bug rather than a choice. It also carries the system's
two radii: `0` for everything the software draws, and `--pill` for the handful
of things whose shape is the message, which are a tag, a person, an active
filter, and the switch track.

**`src/theme/theme.ts`** is the Mantine theme. It owns the scales (spacing,
the type ramp, zero radius everywhere, the four shadows, the two breakpoints)
and bridges the tokens onto Mantine's own variables through
`cssVariablesResolver`, so any Mantine component picks up this world without
being told about it. Two details are load-bearing:

- The palette is written into both the `light` and `dark` blocks of the
  resolver. Mantine's colour-scheme blocks out-specify its shared block, and a
  rendition is not a colour scheme: two of the four have dark panels and
  Mantine never learns which one is showing.
- `variantColorResolver` writes the button variants out by hand. Mantine's
  default resolver lightens and darkens hex values, which cannot work when
  every colour is a `color-mix` behind a custom property.

Component adaptations live in `src/theme/components.module.css` and attach
through `Component.extend({ classNames })`, which is the shape the real app
should use as well. `@mantine/dates` is adapted the same way: the calendar is
squared off, a range shows as a washed run between two solid ends, and it is
reached through `DatePickerInput` so a single date and a span are the same
control with the switch flipped.

## Three controls that are shared on purpose

`PeopleField`, `Reactions` and `MilestoneDateFields` each exist once and are
used everywhere their job comes up. That is not tidiness for its own sake: each
replaced two or three near-identical controls that had drifted apart, and each
carries a product rule that would otherwise have to be restated at every call
site. The people field's rule is whether a name the list has never heard of may
be added; the reaction's is that every choice carries its word, because nothing
here may lean on a hover tooltip.

## Two model facts the surfaces settled

**A milestone is a span, not a point.** A week at the grandparents' is one
occasion rather than seven, so the model is `starts_on` / `ends_on` and a
one-day occasion is simply a span whose ends are equal. The timeline opens the
occasion with a full band on the first of its days you meet and continues it
with a quiet strip on the rest. `src/data/milestones.ts` holds everything
derived from that, and no surface branches on "is this the kind with one
date".

**An item may sit outside the milestone it belongs to.** A christening on
Saturday gets photographed at the lunch on Sunday, so attaching something from
outside the span is allowed and is stated as information rather than as an
error. It is reconciled afterwards rather than ignored, and moving the
photographs is the default, because the date somebody is sure of is usually
the occasion's rather than the file's.

## What is real and what is not

The photographs and the video are real family files in a gitignored folder
(`prototypes/public/media/`), which is what makes the pile read like an actual
dump of near-identical frames rather than a curated set of hero images.
Everything else is written demonstration content. Per-day totals and the 2,147
archive total are deliberately larger than the number of files on disk, because
how a count reads at true scale is part of what is being designed.

## The one place that ignores the design system

`src/surfaces/Emails.module.css`. A mail client strips webfonts, ignores custom
properties, flattens `color-mix`, and may show the plain-text alternative
instead of any of it, so the transactional emails use a system stack, literal
hex, and a 600px column. Each one renders twice: as a client with styles on
shows it, and as the plain-text version that for some members is the only one
that ever arrives.

## Its life expectancy

This directory is scaffolding. Once a surface is built for real in `apps/web`,
its mockup stops being the authority and becomes a historical note; when all
seventeen are built the directory goes. `DESIGN.md` and `design-spec.md` are the
durable records, not this.
