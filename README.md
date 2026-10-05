# Memory Shoebox

**A private social network for your family, that you host yourself.**

Memory Shoebox is a small, self-hosted place to share photos and videos of your kids
and your family with the handful of people who actually care about them:
grandparents, siblings, godparents, close friends. They log in, they see the
photos, they comment, including on a specific moment in a video. Nobody else
does.

It is built for the parent who wants their children's faces out of the feeds of
advertisers, recommendation engines, and strangers, but still wants the people
they love to see the kid's first steps.

> **Status: product surfaces implemented; final acceptance has explicit limits.**
> The app includes archive, upload, account and administration flows. See
> [step 9 verification](docs/prds/2026-09-27-memory-shoebox/plan/step-9-verification.md)
> for validation evidence and the remaining operational and accessibility checks.

## Why

Sharing family photos today usually means one of three bad options:

| Option                  | The problem                                                                             |
| ----------------------- | --------------------------------------------------------------------------------------- |
| A public social network | Your children become training data and ad inventory, for the rest of their lives.       |
| A big-tech shared album | Better, but still someone else's servers, someone else's account, someone else's rules. |
| A group chat            | Photos get compressed, lost in the scroll, and impossible to find a year later.         |

Memory Shoebox is the fourth option: your own instance, your own storage bucket, your
own invite list. There is no algorithm, no discovery, no public profile, and no
way for anyone to find your family unless you invite them. Everything still has
a link you can paste into a text message; those links just do not work for
strangers.

## Principles

- **Private by construction.** Nothing is public. There is no anonymous read
  path, no sharing to the open web by default, and no third-party analytics.
- **A small circle around a large archive.** The audience stays in the tens,
  which is what keeps an instance cheap and simple. The archive does not: a
  childhood's worth of photos and videos runs to many thousands of items over
  years, and Memory Shoebox is built to stay pleasant at that size.
- **Yours to keep.** Your media sits in your own object storage bucket in its
  original quality. If you stop using Memory Shoebox, the files are still just files.
- **Cheap to run.** A family instance should cost a few dollars a month, not a
  subscription.
- **Warm, not clinical.** This is a place for family photos. It should feel
  like one.

## How it works

Memory Shoebox runs as a single service. One process serves both the web app and the
JSON API, backed by a SQLite catalog. Media bytes live in a Backblaze B2
bucket, and browsers fetch them straight from B2 through short-lived signed
URLs, so large files never pass through the server.

```
┌─────────────────┐   /api/*  (JSON, session cookie)   ┌──────────────────────┐
│  Browser        │ ─────────────────────────────────▶ │  Memory Shoebox (Fastify)   │
│  React SPA      │ ◀───────────────────────────────── │  + SQLite catalog    │
│                 │   /*      (the SPA itself)         └──────────┬───────────┘
└────────┬────────┘                                               │ sign URLs,
         │                                                        │ list, upload
         │            photos and videos, directly                 ▼
         └──────────────────────────────────────────────▶ ┌──────────────────┐
                                                          │  Backblaze B2    │
                                                          │  (your bucket)   │
                                                          └──────────────────┘
```

Deployment target is a single [Fly.io](https://fly.io) app with a small
persistent volume for the SQLite file. See
[`docs/architecture.md`](docs/architecture.md) for the full picture and
[`docs/deployment.md`](docs/deployment.md) for the runbook.

## Tech stack

| Layer    | Choice                                                                                                                     |
| -------- | -------------------------------------------------------------------------------------------------------------------------- |
| Web app  | React 19, TypeScript, [Mantine](https://mantine.dev), [TanStack Router](https://tanstack.com/router), TanStack Query, Vite |
| API      | [Fastify](https://fastify.dev) 5 on Node 22, running TypeScript directly                                                   |
| Database | SQLite via [Kysely](https://kysely.dev)                                                                                    |
| Media    | [Backblaze B2](https://www.backblaze.com/cloud-storage) (S3-compatible API)                                                |
| Email    | [react-email](https://react.email) templates, sent through [Resend](https://resend.com)                                    |
| Hosting  | [Fly.io](https://fly.io), one app, one volume                                                                              |
| Tooling  | pnpm workspaces, oxlint, oxfmt, Vitest                                                                                     |

## Quick start (development)

Requires **Node 22.18 or newer** and **pnpm 10**.

```sh
pnpm install                          # install dependencies
pnpm reset-env   # writes .env.server.local and .env.web.local at the root
# fill in SESSION_SECRET and your B2 credentials, then:
pnpm dev                              # web on :5173, API on :8080
```

Open http://localhost:5173. The Vite dev server proxies `/api` to the API
server, so development uses the same single-origin setup as production.

You need a Backblaze B2 bucket to start the API server. Creating one takes a
couple of minutes and the free tier is generous;
[`docs/deployment.md`](docs/deployment.md) walks through it.

**Reading your own mail locally.** Set `ENABLE_FAKE_EMAIL=true` beside
`NODE_ENV=development` in `.env.server.local` and every message is written
as a PDF in `~/Downloads/memory-shoebox-emails` rather than sent, which is how
you read a sign-in code without a Resend account. That, and the end-to-end test
covering it, are the only things here that need a browser:

```sh
pnpm --filter @memory-shoebox/server exec playwright install chromium
```

See [`docs/emails.md`](docs/emails.md).

### Commands

```sh
pnpm dev          # run the web app and API together
pnpm dev:web      # just the web app
pnpm dev:server   # just the API
pnpm build        # build the web app
pnpm start        # run the API in production mode, serving the built web app
pnpm migrate      # apply pending database migrations
pnpm test         # run the test suite
pnpm type-check   # type-check every package
pnpm lint         # lint with oxlint
pnpm format       # format with oxfmt
pnpm check        # format, lint, types, build, and tests: run before pushing
```

## Project layout

```
memory-shoebox/
├── apps/
│   ├── web/        @memory-shoebox/web     React SPA
│   └── server/     @memory-shoebox/server  Fastify API, SQLite, Backblaze
├── packages/
│   ├── shared/     @memory-shoebox/shared  the API contract both sides share
│   └── emails/     @memory-shoebox/emails  the copy of every message we send
├── docs/                            architecture and how-to documentation
├── Dockerfile                       one image, serving both halves
└── fly.toml                         Fly.io app definition
```

## Documentation

Start at [`docs/README.md`](docs/README.md). The short version:

| Doc                                       | What it covers                                               |
| ----------------------------------------- | ------------------------------------------------------------ |
| [PRODUCT.md](docs/PRODUCT.md)             | What Memory Shoebox is, who it is for, and what it is not    |
| [DESIGN.md](DESIGN.md)                    | The visual system: palettes, type, and the rules behind them |
| [architecture.md](docs/architecture.md)   | How the pieces fit together, and why                         |
| [server.md](docs/server.md)               | The API server                                               |
| [web.md](docs/web.md)                     | The web app                                                  |
| [shared.md](docs/shared.md)               | The shared API contract                                      |
| [configuration.md](docs/configuration.md) | Every environment variable                                   |
| [deployment.md](docs/deployment.md)       | Self-hosting on Fly.io with Backblaze B2                     |

## Contributing

Contributions are welcome. Please read
[`CONTRIBUTING.md`](CONTRIBUTING.md) first, and note that this project ships
coding conventions in [`AGENTS.md`](AGENTS.md) that apply to humans and coding
agents alike.

To report a security issue, see [`SECURITY.md`](SECURITY.md). Please do not
open a public issue for a vulnerability.

## License

Copyright (C) 2026 Sunmiento LLC ([sunmiento.com](https://sunmiento.com)).

Memory Shoebox is free software: you can redistribute it and modify it under the terms
of the **GNU Affero General Public License, version 3**. See
[`LICENSE`](LICENSE) for the full text.

The AGPL means you are free to run Memory Shoebox for your own family, change it, and
share it. It also means that if you run a modified version as a service for
other people, you have to make your changes available to them under the same
license. Self-hosting for yourself, your family, and your friends carries no
such obligation.

This program is distributed in the hope that it will be useful, but WITHOUT ANY
WARRANTY, without even the implied warranty of MERCHANTABILITY or FITNESS FOR A
PARTICULAR PURPOSE.
