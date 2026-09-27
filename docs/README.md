# Memory Shoebox documentation

Architectural notes, design decisions, and functionality overviews. Read these
before diving into the source: they explain what each part of the system does,
how the pieces fit together, and why the key decisions were made, so you do not
have to reconstruct that from the code.

Per [`AGENTS.md`](../AGENTS.md), these docs are kept current as the code
changes. When you add, change, or remove a feature, module, route, data model,
or architectural boundary, update the matching file here in the same change.

## Map

| Doc                                  | What it covers                                                                          |
| ------------------------------------ | --------------------------------------------------------------------------------------- |
| [PRODUCT.md](PRODUCT.md)             | What Memory Shoebox is, who it is for, and the non-goals that keep it small             |
| [spec.md](spec.md)                   | The feature and surface spec: what has to be built, still being settled                 |
| [data-model.md](data-model.md)       | The database behind the surfaces: tables, keys, cascades, and what must never be stored |
| [../DESIGN.md](../DESIGN.md)         | The visual system: palettes, type, and the rules behind them                            |
| [architecture.md](architecture.md)   | System overview, repository layout, request flow, deployment topology                   |
| [server.md](server.md)               | `apps/server`: the Fastify API, config, database, Backblaze, static SPA                 |
| [web.md](web.md)                     | `apps/web`: routing, data fetching, the API client                                      |
| [prototypes.md](prototypes.md)       | `prototypes/`: the mockups of every surface, and where the tokens live                  |
| [shared.md](shared.md)               | `packages/shared`: the API contract, and the constraint it lives under                  |
| [configuration.md](configuration.md) | Every environment variable the server reads                                             |
| [deployment.md](deployment.md)       | Self-hosting: Backblaze B2 setup and Fly.io deployment                                  |
| [skills.md](skills.md)               | How this repository installs and tracks coding-agent skills                             |
| [rules/](rules)                      | Language and framework conventions                                                      |

## Where the design came from

`DESIGN.md` at the repository root is the normative visual record. It was
derived from a first round of throwaway static HTML prototypes built only to
settle the look before any product code existed.

`prototypes/` now holds the second round: a Mantine application carrying
high-fidelity mockups of all sixteen surfaces in `spec.md`, with the design
tokens expressed as a Mantine theme meant to move into `apps/web` as it is.
See [prototypes.md](prototypes.md). It is still scaffolding and it will be
deleted once the real app is built; `DESIGN.md` and `spec.md` are the durable
records.

## Conventions for these docs

Write at a high level. Describe what a module does, how it fits with the rest,
and why a decision went the way it did. Do not restate the code line by line:
the code is next door and it does not go stale.

Design and visual language live in `DESIGN.md` at the repository root, not in
this directory, because that file follows a portable format other tools read.
