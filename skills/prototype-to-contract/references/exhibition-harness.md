# The exhibition harness

A prototype nobody can navigate does not get reviewed. Build the harness on day
one, before the second surface exists, because retrofitting it means touching
every surface again.

The harness is **not the product**. It is scaffolding around the product, and
it must be visually unmistakable as such: in the reference implementation it is
a black rail pinned to the bottom of the window, in a world where nothing else
is black.

## What it has to do

| Control                | Why                                                                                                                                                                                      |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **All surfaces** index | The entry point. One list, grouped by audience, every surface with its blurb and state count                                                                                             |
| **State switcher**     | Every state of the current surface as a button. This is the whole point: the states are where designs go wrong, so they must be one click apart, never behind a form you have to fill in |
| **Palette switcher**   | Proves the token layer works. If a theme only looks right in one palette, the tokens are wrong                                                                                           |
| **Per-state note**     | One line saying what this state is showing and why it exists. Forces you to justify each one, and tells a reviewer what to look at                                                       |
| **Hide**               | Collapses the rail so a surface can be seen or screenshotted clean                                                                                                                       |

Any other global toggle the design has (in the reference run, tidy versus messy
pile arrangement) belongs here too.

## The registry

One flat list of surfaces, each carrying its states. This is the spine of the
whole prototype directory: the index page, the rail, the router and the state
count all read from it, so adding a state is one entry in one place.

```ts
export interface SurfaceState {
  readonly id: string;
  readonly label: string;
  /** What this state is showing, in one line, for the harness rail. */
  readonly note: string;
  readonly render: () => ReactNode;
}

export interface Surface {
  readonly id: string;
  readonly number: number;
  /** Who reaches it: anyone, every member, an uploader, an admin. */
  readonly who: string;
  readonly group: "member" | "admin";
  readonly title: string;
  readonly blurb: string;
  readonly states: readonly SurfaceState[];
}
```

Route as `/s/:surfaceId?state=<stateId>`, so any state is a URL you can paste
into a message. That one detail is what makes review asynchronous.

## Rules that keep it honest

- **Every state is reachable in one click.** No state may require typing into a
  form, uploading a file, or completing a previous step.
- **A state is a prop, not a mutation.** `render: () => <Surface state="x" />`.
  Surfaces take a state name and draw it. Nothing in the prototype directory
  has a backend, a fetch, or a store.
- **Fixtures live in one module** and are shared by every surface, so a name or
  a count that appears twice is the same name and count. Write them as real
  content, not lorem: the copy is part of what is being reviewed, and
  placeholder text hides the layout problems that real sentences cause.
- **Content is realistic in volume.** If a day can hold 212 photographs, the
  fixture holds 212. A design that works at three items and collapses at two
  hundred has not been designed.
- **The empty and failed states are states**, listed in the registry beside the
  happy path, not an afterthought.

## Counting states

The index page should print the totals ("17 surfaces and 108 states"),
computed from the registry. It is the fastest way to see that a surface with
one state has not been finished.
