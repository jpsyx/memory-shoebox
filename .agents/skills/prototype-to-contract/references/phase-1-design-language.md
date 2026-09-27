# Phase 1: settle the look

**Skip entirely if `DESIGN.md` exists.** Its existence means this was done.

## What this phase is for

Deciding what the product looks like, before any decision about it is expensive
to change. Everything here is throwaway except `DESIGN.md`.

## Choosing the surfaces

Three to five, picked for character rather than importance. You want the ones
that will force the hard visual decisions:

- The densest screen, which settles the type ramp and spacing scale
- The emptiest screen, which settles what the product looks like with nothing
  in it, and is where most design systems fall over
- One screen with a destructive or high-stakes action, which settles how
  weight and emphasis work without reaching for red
- One screen people will see every day, which settles the chrome

## Build them in plain HTML

No React, no UI library, no build step, no framework from the repo. One
`.html` per surface, one shared `app.css`, and a tiny `app.js` if a toggle
needs it.

The reason is not speed alone. A component library brings defaults, and those
defaults quietly become the design. Starting from plain CSS means every value
in `DESIGN.md` was chosen rather than inherited.

Run impeccable's normal loop over them (`/shape` to plan, then the usual
critique and polish commands). Let it push the work: this is the one phase
where a bolder answer costs nothing to try.

## Carry the palette switcher from the start

Even here, before any token file exists. Build the surfaces against CSS custom
properties and switch the whole set with one attribute on `<html>`:

```html
<html data-rendition="day"></html>
```

```css
:root {
  --panel: …;
  --print: …;
  --ink: …;
  --accent: …;
}
[data-rendition="night"] {
  --panel: …; /* … */
}
```

A palette that only exists in one mode is a palette whose tokens are wrong, and
you want to find that out now rather than in phase 2 when there are seventeen
surfaces to repaint.

## Then document

`/document` reads the built surfaces and writes `DESIGN.md` from what is
actually there rather than from what was intended. That distinction matters:
the file has to describe the artifact, because the artifact is what phase 2
will be built against.

Read `DESIGN.md` afterwards and check it states the **rules**, not just the
values. "Zero radius everywhere" is a rule. "`--radius: 0`" is a value, and a
value alone does not tell the next person what to do when they need a pill.

## The gate

Show the surfaces in every palette and get explicit approval on the look before
phase 2. Phase 2 is an order of magnitude more work and all of it assumes this
is settled.
