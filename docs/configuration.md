# Configuration

Configuration comes in two kinds, and which one a setting belongs to is decided
by whether it varies per deployment.

| Kind            | Where                                                      | For                                                                                 |
| --------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **Environment** | environment variables                                      | Secrets, paths, ports: anything that differs per machine or must never be committed |
| **Product**     | [`app.config.ts`](../app.config.ts) at the repository root | Tuning knobs that are the same on every instance and whose change deserves a review |

Everything below is the environment kind unless it says otherwise. Each is read
by the API server at startup and validated by `apps/server/src/config.ts`. The
web app has no runtime configuration at all: it always calls `/api` on its own
origin.

If a required variable is missing or malformed the server refuses to start and
names **every** problem at once, so a first-time setup can be fixed in one
pass rather than one restart at a time.

## Where to set them

| Context     | How                                                                            |
| ----------- | ------------------------------------------------------------------------------ |
| Development | `apps/server/.env.local`, copied from `apps/server/.env.example`. Gitignored.  |
| Production  | Non-secret values in `fly.toml` under `[env]`; secrets with `fly secrets set`. |

Never commit real credentials. `fly secrets set` stores values encrypted and
injects them into the machine's environment at runtime.

## Required

| Variable             | Description                                                                                                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SESSION_SECRET`     | The one secret this instance needs. **At least 32 characters.** Generate with `openssl rand -hex 32`. Unique per instance. Changing it invalidates every live sign-in code and no session. |
| `B2_KEY_ID`          | The `keyID` of a Backblaze application key.                                                                                                                                                |
| `B2_APPLICATION_KEY` | The `applicationKey` that goes with it. Backblaze shows it only once, at creation.                                                                                                         |
| `B2_BUCKET`          | Name of the private B2 bucket holding your media.                                                                                                                                          |
| `B2_ENDPOINT`        | The bucket's S3-compatible endpoint, as a URL, for example `https://s3.us-west-004.backblazeb2.com`.                                                                                       |
| `B2_REGION`          | The matching region, for example `us-west-004`. It is the middle segment of the endpoint hostname.                                                                                         |

## Optional

| Variable                   | Default                      | Description                                                                                                                                                                                                                                                                                                                                           |
| -------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                 | `development`                | Set to `production` in a deployed instance. Only the exact strings `development` and `test` count as a development environment; every other value, unset included, is treated as production, which is what decides whether `ENABLE_FAKE_EMAIL` is honoured.                                                                                           |
| `PORT`                     | `8080`                       | Port the server listens on.                                                                                                                                                                                                                                                                                                                           |
| `HOST`                     | `0.0.0.0`                    | Interface to bind. Fly.io requires `0.0.0.0`.                                                                                                                                                                                                                                                                                                         |
| `DATABASE_PATH`            | `./data/memory-shoebox.db`   | Path to the SQLite file. On Fly.io this must be on the mounted volume, for example `/data/memory-shoebox.db`. The parent directory is created if missing.                                                                                                                                                                                             |
| `WEB_DIST_PATH`            | `apps/web/dist`              | Directory holding the built web app. Resolved relative to the server package. When it does not exist, the server serves the API only, which is what happens in development.                                                                                                                                                                           |
| `B2_THUMBNAIL_PREFIX`      | `.memory-shoebox-thumbnails` | Key prefix under which Memory Shoebox writes generated thumbnails into your bucket. A trailing slash is stripped.                                                                                                                                                                                                                                     |
| `RESEND_API_KEY`           | none                         | Resend API key. Without it the server still starts and serves normally. A key alone does not make mail work: `mail.from_address` has to be set too, and while `public.base_url` is unset every message is written `failed` rather than queued. Both are instance settings, and the route that writes them arrives in step 8a. See [mail.md](mail.md). |
| `ENABLE_FAKE_EMAIL`        | `false`                      | Writes every message as a PDF in `~/Downloads/memory-shoebox-emails` instead of sending it, so a developer can read a sign-in code. Must be the exact string `true`, and is honoured only when `NODE_ENV` is `development` or `test`. Needs a browser: `pnpm --filter @memory-shoebox/server exec playwright install chromium`.                       |
| `UPSTASH_REDIS_REST_URL`   | none                         | REST endpoint of an Upstash Redis database. With the token below, the send rate limit moves out of this process into a budget shared by everything using the same Resend key. Without both, the same window is enforced in memory, which is correct for a single machine.                                                                             |
| `UPSTASH_REDIS_REST_TOKEN` | none                         | The token for that endpoint. Half a pair is no pair: either one alone reads as not configured.                                                                                                                                                                                                                                                        |

## Email

Signing in means sending a six-digit code, so a deployment needs transactional
mail. We use [Resend](https://resend.com), and `RESEND_API_KEY` is the only
variable a deployment has to set in order to send. The three below it in the
table change how mail behaves rather than whether it works.

**An existing deployment that already sets the two Upstash variables should
know that they now do something.** They were parsed and ignored until the mail
path gained a rate limiter. An instance carrying them moves from a send window
held inside one process to one shared across every process using the same
Resend key, which is the point of setting them and is also the only thing that
changes. Clear them to keep the in-process window.

`ENABLE_FAKE_EMAIL` is a development convenience with a gate on it, and the
gate is not the negation of production: see
[mail.md § Fake email writes a PDF and reports success](mail.md) for the two
conditions and why the second one is spelled the way it is.
[emails.md](emails.md) covers the templates themselves.

**The sending identity is not an environment variable.** It is the
`mail.from_address` and `mail.from_name` instance settings, edited on the
Shoebox's own settings surface, so that the admin's mail health banner has one
place to point at when the address is missing. See [mail.md](mail.md) for the
queue those settings feed and what happens while either is unset.

## Somebody to sign in as

A fresh catalog has no members, and until step 8a there is no route that
creates one: inviting somebody is an admin surface that does not exist yet. So
a local Shoebox had nothing to sign in as, and surface 1 could not be opened
past its first screen.

```sh
pnpm seed:member you@example.com --role admin
```

`--role` is one of `viewer`, `uploader` or `admin` and defaults to `admin`,
because the five admin doors on My account are one of the things worth
looking at. `--base-url` defaults to `http://localhost:5173`, the Vite dev
server.

It writes two things. A member row at that address with status **`invited`**
rather than `active`, which is what an invited address really is: accepting an
invitation is defined as the first successful sign-in, and
`POST /api/auth/session` is what sets `joined_at` and flips the status. Seeding
`active` would skip the one transition the first sign-in exists to make. And
`public.base_url`, if that setting is unset, because `enqueueEmail` writes a
`sign_in_code` row already scrubbed when it is missing: a Shoebox without it
queues codes whose digits are gone before anybody can read them.

Running it again for an address that is already a member says so and changes
nothing.

**Reading the code it sends.** With no `RESEND_API_KEY` and no
`ENABLE_FAKE_EMAIL`, the mail worker defers the message back to `queued`
without scrubbing it, so the six digits are in
`outbound_emails.payload_json` in `apps/server/data/memory-shoebox.db`. With
`ENABLE_FAKE_EMAIL=true` the message is written as a PDF in
`~/Downloads/memory-shoebox-emails` instead, which is the same digits with a
picture of the email around them. [e2e.md](e2e.md) covers why the end-to-end
run deliberately picks the first of those.

The script is a development tool: it is not reachable over HTTP, it is not
imported by the server, and step 8a is where it stops being needed.

## Product configuration

[`app.config.ts`](../app.config.ts) holds the settings that are not per
machine. It is a TypeScript file rather than an environment variable or a row
in the `settings` table for three reasons: the default is the real answer and
almost nobody will change it, a change to one of these alters how the product
reads and should go through review, and a TypeScript file can carry the
reasoning beside the number, which a `.env` line cannot.

| Setting                      | Default | What it does                                                                                                         |
| ---------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------- |
| `burst.maxGapSeconds`        | `10`    | The largest gap between consecutive frames that still counts as one burst. Capture time is the only detection signal |
| `burst.minimumFrameCount`    | `3`     | The fewest frames that form a stack. A run of two stays two plain prints                                             |
| `timeline.pageItemBudget`    | `400`   | The soft item budget for one page of the day stream. A day is atomic, so the page stops after the day that passes it |
| `media.signedUrlTtlSeconds`  | `3600`  | How long a signed media URL lives. Longer than a scroll, short enough that the bearer-link trade stays small         |
| `upload.draftExpiryHours`    | `168`   | How long a draft upload survives untouched before `upload-abandon-sweep` cancels it                                  |
| `upload.abandonGraceMinutes` | `60`    | How long a batch may sit with no activity before `upload-abandon-sweep` marks its unfinished files abandoned         |

Read the comments in the file before changing any of them: each carries the
reasoning beside the number. `upload.abandonGraceMinutes` takes its default
from [`apis/upload.md` § Configuration this slice reads](prds/2026-09-27-memory-shoebox/tech-specs/apis/upload.md),
which is the source of the sixty and of the two failure modes it sits between:
too short fails a slow file, too long delays the email.

`timeline.pageItemBudget` and `media.signedUrlTtlSeconds` both come from
[`apis/timeline.md`](prds/2026-09-27-memory-shoebox/tech-specs/apis/timeline.md),
the first from § Performance and the second from Ruling 3, and
[archive.md](archive.md) says what each one buys: a page a phone on a train can
hold, and a URL that outlives an uninterrupted scroll without a re-signing
route behind it.

The two burst settings are safe to change after the fact:
`bursts.threshold_seconds` and `bursts.detector_version` record what produced
each burst, so a new value can re-derive the automatic groupings without
disturbing anybody's manual one.

## Notes

**`SESSION_SECRET` protects sign-in codes, not the cookie.** The session cookie
is an opaque random token whose only meaning is a row in the database, so
nothing about it is signed or encrypted. What the secret does is derive the
pepper that `sign_in_codes.code_hash` is computed under: six digits is a space
of a million, and without a pepper a copied database file yields every live
code instantly. Treat it like a private key, and note that changing it
invalidates live codes rather than sessions.

**Backblaze keys should be scoped.** Create an application key restricted to
the single bucket Memory Shoebox uses, rather than a master key. See
[deployment.md](deployment.md#1-create-a-backblaze-b2-bucket).

**The database is metadata only.** It holds no media bytes, so a 1 GB Fly
volume is generous even for a large family archive.
