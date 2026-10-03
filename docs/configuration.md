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
| Development | `.env.server.local` at the repository root. Gitignored.                        |
| Production  | Non-secret values in `fly.toml` under `[env]`; secrets with `fly secrets set`. |

Never commit real credentials. `fly secrets set` stores values encrypted and
injects them into the machine's environment at runtime.

### The two files you fill in, and the two that are written for you

```sh
pnpm reset-env   # writes .env.server.local and .env.web.local from the examples
```

Fill those two in at the repository root. `pnpm dev`, `pnpm dev:server` and
`pnpm dev:web` each copy the one they need into the package that reads it
before starting, so `apps/server/.env.local` and `apps/web/.env.local` are
**generated files: never edit them, because the next `pnpm dev` overwrites
them**. All four are gitignored.

Keeping the filled-in copy at the root rather than in the package is what makes
one edit enough. A key that both halves needed would otherwise have to be
typed twice and would drift.

**`reset-env` merges, and it is safe to run at any time.** A key the example
has gained is appended with the comment lines that explain it, and nothing
already in your file is touched: not a value, not the order, not a comment you
added yourself. It is how you find out a new variable exists, rather than by a
server refusing to start. Running it twice adds nothing the second time.

New keys land at the foot of the file under a divider naming where they came
from, rather than being threaded into the example's own positions. Appending
is the one shape that cannot put a filled-in secret at risk for the sake of
tidiness; move them wherever you like afterwards.

`pnpm reset-env -- --force` replaces the file wholesale from the example and
destroys whatever was there. `pnpm reset-env server` and `pnpm env:sync web`
narrow either command to one package.

A missing root file is reported rather than fatal, so `pnpm dev` still starts
and the server gives its own error naming every variable it wants at once.

**`apps/web/.env.example` has no keys in it yet**, because the web app reads no
environment variables: it always calls `/api` on its own origin. The file and
the plumbing exist so the first one that is needed has somewhere to go. Only a
`VITE_`-prefixed key reaches the browser, and everything in that file ends up
in the bundle, so nothing secret can ever live there.

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

## Something to look at

A member with an empty archive is not much to look at either, and the upload
surface is step 7b: the routes that create an item exist, but nothing in the
product calls them yet. The archive seed is the stand-in.

```sh
pnpm seed:archive --as you@example.com
pnpm seed:archive --as you@example.com --no-objects
```

It writes 427 items across eleven days into whatever `DATABASE_PATH` names,
shaped to reach every state the built surfaces have to draw: a day of 340
photographs for the scroll to work on, a forty-five frame burst, a burst with
one visible frame and another with none, a day holding one item, a one-day
occasion, a five-day one, two overlapping, an occasion nobody photographed,
items restricted to a group, a person with no photographs and a tag whose
every item is restricted. It seeds two members, the address given and a plain
viewer at `prima@example.com`, because an admin is handed every row untouched
and a restricted item is only restricted from somebody who is not one.

It is deterministic and idempotent: one fixed seed, and it clears the tables
it owns before writing, so running it twice leaves the same catalog. It
**empties** `items`, `bursts`, `milestones`, `people`, `tags`, their link
tables and `upload_sessions` rather than deleting only the rows it wrote, so
point it at a development catalog and nothing else.
`--no-objects` skips the bucket, which is what the end-to-end run uses and
what to use locally when Backblaze is not configured; the URLs still sign and
the pictures simply do not load. With objects, it uploads one cartoon file per
rendition under a `seed/` prefix. See [media.md](media.md).

**No number on screen comes from the seed.** It writes rows, and every count
the product draws is still computed by the server from those rows with the
viewer's own predicate applied, which is the rule
[archive.md](archive.md) exists to protect.

## Product configuration

[`app.config.ts`](../app.config.ts) holds the settings that are not per
machine. It is a TypeScript file rather than an environment variable or a row
in the `settings` table for three reasons: the default is the real answer and
almost nobody will change it, a change to one of these alters how the product
reads and should go through review, and a TypeScript file can carry the
reasoning beside the number, which a `.env` line cannot.

| Setting                              | Default                                          | What it does                                                                                                         |
| ------------------------------------ | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `burst.maxGapSeconds`                | `10`                                             | The largest gap between consecutive frames that still counts as one burst. Capture time is the only detection signal |
| `burst.minimumFrameCount`            | `3`                                              | The fewest frames that form a stack. A run of two stays two plain prints                                             |
| `burst.detectorVersion`              | `1`                                              | Written on every automatic burst, so a better detector can re-derive them later. Bump it when detection changes      |
| `timeline.pageItemBudget`            | `400`                                            | The soft item budget for one page of the day stream. A day is atomic, so the page stops after the day that passes it |
| `media.signedUrlTtlSeconds`          | `3600`                                           | How long a signed media URL lives. Longer than a scroll, short enough that the bearer-link trade stays small         |
| `upload.draftExpiryHours`            | `168`                                            | How long a draft upload survives untouched before `upload-abandon-sweep` cancels it                                  |
| `upload.abandonGraceMinutes`         | `90`                                             | How long a batch may sit with no activity before `upload-abandon-sweep` marks its unfinished files abandoned         |
| `upload.acceptedContentTypes`        | JPEG, HEIC, HEIF, PNG, WebP, GIF, QuickTime, MP4 | What the manifest accepts. Anything else is refused there, before a byte moves                                       |
| `upload.maxFileBytes`                | 8 GiB                                            | The largest file accepted: a long 4K phone video, well inside multipart's 10,000 parts                               |
| `upload.multipartThresholdBytes`     | 32 MiB                                           | At or over it a file goes up in parts. Under it one PUT must finish inside the abandon grace at the floor rate       |
| `upload.multipartPartSizeBytes`      | 16 MiB                                           | One part. S3's floor is 5 MiB for every part but the last                                                            |
| `upload.presignTtlSeconds`           | `3600`                                           | How long an upload URL lives. Long enough for one part at the floor rate                                             |
| `upload.transferFloorBytesPerSecond` | 16 KiB/s                                         | The slowest link the timing relations survive. The browser's re-presign arithmetic reads it too                      |
| `upload.maxParallelTransfers`        | `2`                                              | Files in flight at once, per browser. The spike measured four buying a phone nothing                                 |
| `upload.offlineWaitCeilingMinutes`   | `20`                                             | The longest one file waits, in all, for an offline browser to come back. Well inside the abandon grace               |
| `upload.stalledPutTimeoutSeconds`    | `90`                                             | How long a PUT may go with no upload progress before the browser gives up on it and retries                          |
| `upload.derivatives`                 | 2048 px, 480 px, 10 MiB                          | The `display` and `thumb` long edges, the JPEG quality per engine, and the largest derivative `complete` accepts     |
| `upload.heicWorkerRecycleCount`      | `8`                                              | HEIC files a worker decodes before it is replaced, because the WASM heap never shrinks                               |

Read the comments in the file before changing any of them: each carries the
reasoning beside the number. The upload values were the contract's `upload.*`
settings and are deployment constants instead, by the contract's own Ruling 4;
the step design's decision 7 is where each default comes from. Several of
them are sized against each other: at `upload.transferFloorBytesPerSecond` a
part must cross inside `upload.presignTtlSeconds`, and a file just under
`upload.multipartThresholdBytes`, which is one PUT with no server contact,
must cross inside `upload.abandonGraceMinutes`; 32 MiB takes about 34 minutes
at the floor. The grace must also outlast the longest a transfer that is
alive can go without a word to the server: the browser starts every PUT only
on a URL that can carry it to the end at the floor, so the last one ends
inside its URL's hour, and then `upload.stalledPutTimeoutSeconds` and
`upload.offlineWaitCeilingMinutes` can pass before the next try re-presigns.
That is about 82 minutes, which is why the grace is 90 rather than the 60
that
[`apis/upload.md` § Configuration this slice reads](prds/2026-09-27-memory-shoebox/tech-specs/apis/upload.md)
first gave, between the two failure modes it names: too short fails a slow
file, too long delays the email.

`timeline.pageItemBudget` and `media.signedUrlTtlSeconds` both come from
[`apis/timeline.md`](prds/2026-09-27-memory-shoebox/tech-specs/apis/timeline.md),
the first from § Performance and the second from Ruling 3, and
[archive.md](archive.md) says what each one buys: a page a phone on a train can
hold, and a URL that outlives an uninterrupted scroll without a re-signing
route behind it.

The burst settings are safe to change after the fact:
`bursts.threshold_seconds` and `bursts.detector_version` record what produced
each burst, so a new value can re-derive the automatic groupings without
disturbing anybody's manual one. Bump `burst.detectorVersion` whenever
detection changes what it groups.

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
