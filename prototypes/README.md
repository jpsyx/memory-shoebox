# Prototypes

High-fidelity, non-functional mockups of every surface in
[`docs/prds/2026-09-27-memory-shoebox/design-spec.md`](../docs/prds/2026-09-27-memory-shoebox/design-spec.md), built from the tokens in
[`DESIGN.md`](../DESIGN.md).

Nothing here is wired to anything. There is no API, no database, no
authentication and no upload: every surface renders from fixtures in
`src/data`, and every button that would change something does nothing. The
point is to argue about how each surface looks and what it says before any of
it is built.

```sh
pnpm dev:prototypes     # http://localhost:5174
```

## What is in here

Sixteen surfaces and their states, listed on the index page. The black rail at
the foot of the window is the harness, not the product: it switches between a
surface's states, between the four palettes, and between the tidy and messy
pile. A URL describes exactly what is on screen
(`/s/upload?state=partial`), so a review link is worth pasting.

## Layout

```
prototypes/
├── index.html
├── vite.config.ts             a plain SPA on :5174, no API proxy
├── public/
│   ├── fonts/                 the three self-hosted variable faces
│   └── media/                 real family photographs. Gitignored.
└── src/
    ├── main.tsx               mounts MantineProvider and the router
    ├── router.tsx             one route for all sixteen surfaces
    ├── styles/
    │   ├── tokens.css         THE design tokens: four inks per rendition
    │   ├── global.css         the enamel panel and the browser surfaces
    │   └── fonts.css
    ├── theme/
    │   ├── theme.ts           the Mantine theme, bridged onto those tokens
    │   └── components.module.css
    ├── system/                the world: prints, spine, pile, stack, comments,
    │                          reactions, the people field
    ├── data/                  fixtures, the media catalog, milestone dates
    ├── surfaces/              one module per surface in the spec
    └── harness/               the rail, the index, the rendition switches
```

## Where the design lives

Two files, and they are meant to move into `apps/web` roughly as they are:

- **`src/styles/tokens.css`** is colour and scale. A rendition declares exactly
  four inks (panel, print, ink, accent) and every other value is a
  `color-mix` in oklab of those four, which is why switching renditions is one
  attribute on `<html>` rather than a second stylesheet.
- **`src/theme/theme.ts`** is the Mantine theme. It carries the scales
  (spacing, type ramp, zero radius, the four shadows, the breakpoints) and
  bridges the tokens onto Mantine's own CSS variables through
  `cssVariablesResolver`, so a Mantine component picks up this world without
  being told about it. `variantColorResolver` writes the button variants out
  by hand because Mantine's default lightens and darkens hex values, which
  cannot work when every colour is a `color-mix` behind a custom property.

Component adaptations sit in `src/theme/components.module.css` and are attached
through `Component.extend({ classNames })`, which is the shape the real app
should use too.

## What is real and what is not

The photographs and the video are real family files in a gitignored folder,
which is what makes the pile read like an actual dump of near-identical frames
rather than a curated set of hero images. Everything else - the names, the
notes, the counts, the addresses - is written demonstration content. The
per-day totals and the 2,147 archive total are deliberately larger than the
number of files on disk, because how a count reads at true scale is part of
what is being designed.

## Deliberately outside the design system

`src/surfaces/Emails.module.css`. A mail client strips webfonts, ignores custom
properties, flattens `color-mix`, and may show the plain-text alternative
instead of any of it, so the transactional emails use a system stack, literal
hex and a 600px column. Each one is shown twice: rendered, and as the
plain-text version that for some members is the only one that ever arrives.
