# Memory Shoebox documentation

Architectural notes, design decisions, and functionality overviews. Read these
before diving into the source: they explain what each part of the system does,
how the pieces fit together, and why the key decisions were made, so you do not
have to reconstruct that from the code.

Per [`AGENTS.md`](../AGENTS.md), these docs are kept current as the code
changes. When you add, change, or remove a feature, module, route, data model,
or architectural boundary, update the matching file here in the same change.

## Map

| Doc                                  | What it covers                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------------ |
| [PRODUCT.md](PRODUCT.md)             | What Memory Shoebox is, who it is for, and the non-goals that keep it small                |
| [prds/](prds)                        | One directory per thing being specified: its PRD, design spec, tech specs and build plan   |
| [../DESIGN.md](../DESIGN.md)         | The visual system: palettes, type, and the rules behind them                               |
| [architecture.md](architecture.md)   | System overview, repository layout, request flow, deployment topology                      |
| [server.md](server.md)               | `apps/server`: the Fastify API, config, database, Backblaze, static SPA                    |
| [web.md](web.md)                     | `apps/web`: routing, data fetching, the API client                                         |
| [prototypes.md](prototypes.md)       | `prototypes/`: the mockups of every surface, and where the tokens live                     |
| [shared.md](shared.md)               | `packages/shared`: the API contract, and the constraint it lives under                     |
| [configuration.md](configuration.md) | Every environment variable the server reads                                                |
| [deployment.md](deployment.md)       | Self-hosting: Backblaze B2 setup and Fly.io deployment                                     |
| [skills.md](skills.md)               | How this repository installs and tracks coding-agent skills, and the ones it writes itself |
| [rules/](rules)                      | Language and framework conventions                                                         |

## PRDs

`docs/prds/` holds one directory per thing that has been taken from an idea to
a buildable plan, named `YYYY-MM-DD-<name>`. Each carries the same artifacts,
produced in that order and all of them living documents:

| File                        | What it is                                                                          |
| --------------------------- | ----------------------------------------------------------------------------------- |
| `PRD.md`                    | The requirements: the problem, who it is for, what it must do, what is out of scope |
| `design-spec.md`            | Every surface, every state, the user flows, and the rules the mockups encode        |
| `tech-specs/data-models.md` | The schema: tables, keys, cascades, and what is deliberately not stored             |
| `tech-specs/apis/`          | The API contract, with `conventions.md` binding every route                         |
| `plan/`                     | The build order, one file per step                                                  |

Today there is one: [`prds/2026-09-27-memory-shoebox`](prds/2026-09-27-memory-shoebox), which is the product itself. The name is the
product's own because the thing being specified is this whole repository rather
than a feature inside it, and for the same reason its `PRD.md` is a pointer:
the content is [PRODUCT.md](PRODUCT.md), where impeccable reads it.

`PRODUCT.md` stays outside that directory on purpose. It says what Memory
Shoebox is and what it refuses to be, which outlives any one specification of
how to build it.

## Where the design came from

`DESIGN.md` at the repository root is the normative visual record. It was
derived from a first round of throwaway static HTML prototypes built only to
settle the look before any product code existed.

`prototypes/` now holds the second round: a Mantine application carrying
high-fidelity mockups of all eighteen surfaces, with the design
tokens expressed as a Mantine theme meant to move into `apps/web` as it is.
See [prototypes.md](prototypes.md). It is still scaffolding and it will be
deleted once the real app is built; `DESIGN.md` and the PRD are the durable
records.

## Conventions for these docs

Write at a high level. Describe what a module does, how it fits with the rest,
and why a decision went the way it did. Do not restate the code line by line:
the code is next door and it does not go stale.

Design and visual language live in `DESIGN.md` at the repository root, not in
this directory, because that file follows a portable format other tools read.
