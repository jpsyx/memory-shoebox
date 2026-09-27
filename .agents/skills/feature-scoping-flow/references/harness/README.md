# A working exhibition harness

Lifted verbatim from the reference run. React plus Mantine plus TanStack
Router, but the shape is the point and ports to anything.

| File                 | What it is                                                                                                 |
| -------------------- | ---------------------------------------------------------------------------------------------------------- |
| `registry.ts`        | The `Surface` and `SurfaceState` types. The spine: index, rail, router and counts all read from this       |
| `Rail.tsx`           | The black bar: surface name, state buttons, palette buttons, the per-state note, and Hide                  |
| `IndexPage.tsx`      | The "all surfaces" view, grouped by audience, with the surface and state totals                            |
| `SurfacePage.tsx`    | Renders one state of one surface. Note how little it does                                                  |
| `rendition.ts`       | Palette switching, written to `data-*` on the document element and persisted                               |
| `harness.module.css` | Rail styling, deliberately outside the design system so the scaffolding cannot be mistaken for the product |

## Wiring

```
/                     IndexPage
/s/:surfaceId         SurfacePage, state from ?state=
```

Every state is a URL you can paste into a message, which is what makes review
asynchronous.

## Porting notes

- `rendition.ts` assumes palettes switch via one attribute on `<html>`. If the
  design system uses a class or a provider, that is the only file to change.
- `Rail.tsx` reads `Surface.states` for its buttons and `SurfaceState.note` for
  the line underneath. Keep the note: it is what makes a reviewer look at the
  right thing, and writing it is what proves the state is real.
- The rail is `position: fixed` at the bottom. Above it rather than over it is
  wrong: surfaces need the full viewport height to be judged.
