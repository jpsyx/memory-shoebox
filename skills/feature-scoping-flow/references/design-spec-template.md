# design-spec.md template

Phase 3's written output, at `<specdir>/design-spec.md`. The prototypes show
what it looks like; this says what is true about it in words a developer can
build from and a reviewer can check.

**Reference `DESIGN.md`, never restate it.** Anything already settled there is
cited as `See DESIGN.md § <heading>`. Two copies of a token scale is one copy
and one lie, and the one here is always the stale one.

The division: `DESIGN.md` owns the visual system, this file owns how the system
is applied to these surfaces.

---

```markdown
# <Product or feature> design spec

Companion to the mockups in `prototypes/`. Every surface, how somebody moves
between them, and the rules the mockups encode but cannot state.

Visual system: [`DESIGN.md`](../../../DESIGN.md). Cited here, never duplicated.

## Surfaces

| #   | Surface | Who reaches it | States         |
| --- | ------- | -------------- | -------------- |
| 1   | <name>  | <role>         | <count>: <ids> |

<One line per surface saying what it is for. The state ids match the prototype
registry exactly, so a reader can open any of them.>

## User flows

<One subsection per flow that crosses more than one surface. Numbered steps,
naming the surface and the state at each. Include the flows that fail: what a
person sees when the thing they were doing does not work is a flow, and it is
the one nobody designs.>

### <Flow name>

1. <Surface>, state `<id>`. <What they do.>
2. <Surface>, state `<id>`. <What they see.>

**Where it can fail:** <the branch, and which state covers it.>

## Component design tokens

See `DESIGN.md` § <Palette>, § <Type>, § <Space>.

<Only what is specific to these surfaces and not in DESIGN.md: a component that
needed its own value, a token added during this phase, an adaptation of a UI
library default. State the value and why the default was wrong.>

## Interactive states

<Per component class, what it does on hover, focus, active, disabled, loading
and error. The rule that matters: if the design forbids depending on hover, say
so here and say what carries the meaning instead.>

| Component | Rest | Hover | Focus | Disabled | Loading |
| --------- | ---- | ----- | ----- | -------- | ------- |

## Spacing and layout

See `DESIGN.md` § <Space>.

<Per surface: the grid or flex structure, what wraps, what stacks, and at which
breakpoint. The numbers that are load-bearing rather than incidental.>

## Responsive behaviour

<What changes at each breakpoint, per surface. Mobile, tablet, desktop. Name
the surfaces that are genuinely different rather than merely narrower: those
are the ones a developer will get wrong.>

| Breakpoint | Width | What changes |
| ---------- | ----- | ------------ |

## Accessibility

<Concrete and checkable, not aspirational.>

- **Contrast:** the measured ratios, per palette, for text on each ground. If a
  palette fails anywhere, say where.
- **Keyboard:** the tab order per surface, what is focusable, what traps focus
  (modals), and how each is escaped.
- **Screen reader:** what alt text is generated from and where it comes from,
  what is `aria-hidden`, what carries a live region.
- **Motion:** what animates and what it does under `prefers-reduced-motion`.
- **Target size:** the minimum, and anywhere that falls under it.

## What the mockups deliberately do not show

<Loading spinners, transitions, anything that needs a server. Saying so stops
a developer treating the absence as a decision.>
```

## Writing it well

- **Write it from the prototypes, not from intent.** Open each state and
  describe what is there. The gap between the two is the point of the exercise.
- **The failure flows are the ones that pay off.** Every product designs the
  happy path; the reason phase 5 finds holes is that nobody wrote down what
  happens when the upload dies halfway.
- **Measure the contrast rather than asserting it.** A ratio you did not
  measure is a ratio that fails in one palette.
