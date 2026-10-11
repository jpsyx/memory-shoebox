# Self-hosting Memory Shoebox

Memory Shoebox deploys as a single [Fly.io](https://fly.io) app backed by a
[Backblaze B2](https://www.backblaze.com/cloud-storage) bucket. One process
serves both the web app and the API, so there is one deploy, one domain, and no
CORS configuration on the app to get wrong. The bucket needs one CORS rule,
because browsers upload to it directly: see
[Let browsers upload to the bucket](#let-browsers-upload-to-the-bucket).

Expect the first setup to take about twenty minutes.

## What it costs, roughly

A family instance is small. A Fly machine that suspends when idle plus a 1 GB
volume runs a few dollars a month, and Backblaze charges by the gigabyte
stored. Media dominates: the database holds metadata only.

## What you need

- A [Backblaze](https://www.backblaze.com) account.
- A [Resend](https://resend.com) account and a domain you can verify, for
  sending sign-in codes.
- A [Fly.io](https://fly.io) account and the [`flyctl`](https://fly.io/docs/flyctl/install/) CLI.
- Node 22.18 or newer and pnpm 10, if you want to run it locally first.

## 1. Create a Backblaze B2 bucket

In the Backblaze console:

1. **Create a bucket.** Give it a unique name. Set **Files in Bucket** to
   **Private**. Leave encryption and object lock at their defaults.
2. Note the bucket's **Endpoint**, shown in the bucket list, for example
   `s3.us-west-004.backblazeb2.com`. Your `B2_ENDPOINT` is that with
   `https://` in front. Your `B2_REGION` is the middle segment,
   `us-west-004`.
3. **Create an application key** under **Application Keys**. Scope it to
   **only this bucket** and give it read and write access. Do not use your
   master key.
4. Copy the **keyID** and the **applicationKey**. The applicationKey is shown
   **once**. If you lose it, delete the key and make a new one.
5. **Required: set the bucket's Lifecycle Settings to "Keep only the last
   version of the file".** That is the B2 lifecycle rule
   `daysFromHidingToDeleting: 1` (with `daysFromUploadingToHiding` left
   empty) over the whole bucket. If you also add the safety net in
   [Cancel unfinished large files](#cancel-unfinished-large-files-after-a-few-days),
   put both settings in one custom rule.

The values from steps 2 to 4 map to `B2_KEY_ID`, `B2_APPLICATION_KEY`,
`B2_BUCKET`, `B2_ENDPOINT`, and `B2_REGION`.

### Keep test and production apart

Test and production can share this one bucket, because the server files every
object under a key prefix: `production/` for an instance whose `NODE_ENV` is
`production` (required by deployment preflight), and `test/` for everything else. You set
nothing for this; `B2_KEY_PREFIX` exists to override it
([configuration.md](configuration.md#test-and-production-share-a-bucket)).

**A test or staging app deployed from the Docker image must set
`B2_KEY_PREFIX=test` itself.** The image sets `NODE_ENV=production`, and the
prefix follows `NODE_ENV`, so without it that app files its uploads under
`production/`, in the live instance's own folder:
set `B2_KEY_PREFIX=test` in that app's `.env.server.production`.

**If the bucket already holds media from before prefixes existed**, copy it
under `production/` before deploying, because the server stops seeing bare keys:
see [Objects written before prefixes existed](configuration.md#test-and-production-share-a-bucket).

For a hard wall rather than a convention, create the application key in step 3
twice, both scoped to this bucket, and fill in the **File name prefix** field
of each:

- the production key, with the prefix `production/`, goes on the Fly.io app;
- a separate test key, with the prefix `test/`, goes in `.env.server.local` at
  the repository root, which `pnpm dev` copies into `apps/server`.

Backblaze then enforces the prefix on every request the key makes, so the test
key cannot read, write or delete anything under `production/` whatever the app
does. This is optional: without it the prefix still keeps the two apart, and a
production instance never asks for a key outside its own catalog.

**Why the lifecycle rule is not optional.** A B2 bucket keeps every version
of every file, and a delete through the S3 API that names no version, which is
the only kind Memory Shoebox sends, does not remove anything: it hides the
file behind a marker and keeps the bytes, billed, for good. Every delete the
catalog makes would then free no storage at all: a photograph somebody
deleted, and the leftovers of an upload that was cut short, abandoned or
failed.
"Keep only the last version" is what turns a hidden file into a deleted one,
a day later. That day is also your only undo for a deletion, so see
[Backups](#backups) for keeping a copy elsewhere.

## 2. Create a Resend account

Authentication sends six-digit codes, so mail configuration decides whether
invited members can sign in.

1. Sign up at [Resend](https://resend.com) and **verify a sending domain**.
   An unverified domain cannot send, and there is no fallback: no mail means
   no sign-in codes.
2. Create an API key.
3. Keep the key for `RESEND_API_KEY`. The sending address is not an
   environment variable: you set it in the Shoebox's own settings after your
   first sign-in, so that the mail health banner has one place to point at.

### Upstash, which you probably do not need

Resend allows two requests a second, and that budget belongs to the API key
rather than to any one process. A single Shoebox spaces its own sends and
stays inside it, which is why `UPSTASH_REDIS_REST_URL` and
`UPSTASH_REDIS_REST_TOKEN` are optional and most installs leave them empty.

Set them only if something else sends with the same key: a second instance, or
a script you run beside the server. Then the budget is enforced across all of
them instead of each one separately.

Two things worth knowing before you do. Setting one without the other reads as
not configured, because a URL with no token cannot reach Upstash. And if
Upstash is unreachable the Shoebox does not stop sending: it falls back to
spacing sends in this process, and writes one warning to the server's error
output when it first does.

That warning is currently the only notice you get. The limiter knows it is
degraded and says so as `upstash_unreachable`, but nothing reads that yet: the
mail health surface which will is not built. So if you rely on Upstash, watch
the logs rather than expecting a banner.

**If you are upgrading an instance that already had these two variables set,
they now take effect.** They were read and ignored by earlier versions. Clear
them to keep the old behaviour.

## 3. Run it locally first

Worth doing: it confirms your Backblaze credentials before Fly.io is in the
picture.

```sh
git clone https://github.com/jpsyx/memory-shoebox.git
cd memory-shoebox
pnpm install
pnpm reset-env
```

Fill in `.env.server.local` at the repository root, generating the session
secret with:

```sh
openssl rand -hex 32
```

Then:

```sh
pnpm dev
```

Open http://localhost:38473 and confirm the sign-in page loads.

## 4. Deploy to Fly.io

### Prepare the three production files

From a fresh checkout with Node 22.18+ and pnpm 10:

```sh
pnpm install
cp apps/server/.env.example .env.server.production
cp apps/web/.env.example .env.web.production
cp .env.deploy.example .env.deploy
openssl rand -hex 32
```

Fill the server file with the generated `SESSION_SECRET` and the B2 credentials.
Set `NODE_ENV=production`, `HOST=0.0.0.0`, `PORT=8080`, and
`DATABASE_PATH=/data/memory-shoebox.db`. Set `RESEND_API_KEY` when ready to send
mail. Keep `ENABLE_FAKE_EMAIL` blank; leave both Upstash keys blank for one
machine. Blank mail is supported for initial setup, but invited members cannot
receive sign-in codes until mail is configured. Set the sending identity and
public base URL in Shoebox settings; see [mail.md](mail.md).

Keep `.env.web.production` even though the current web example has no keys.
Any future keys here must start with `VITE_` and are public browser content.
These files are ignored by Git and Docker. They are parsed as single-line
dotenv data, never sourced: dollar signs and backslashes are literal, including
inside quotes. Use the other quote character to include a quote in a quoted
value; multiline values are unsupported. No interpolation or shell execution
occurs.

Fill `.env.deploy`: `FLY_APP` is the chosen unique app name, `FLY_REGION` the
three-letter region, and `FLY_VOLUME_NAME` the one persistent volume name.
The example uses `/data`, a 1 GB volume minimum, 512 MB, and idle suspension.
`FLY_VOLUME_SIZE_GB` is a positive whole-GB minimum; larger existing volumes are
valid. Set the health-check interval and timeout with
`FLY_CHECK_INTERVAL_SECONDS` and `FLY_CHECK_TIMEOUT_SECONDS` (positive whole
seconds), and startup grace with `FLY_CHECK_GRACE_PERIOD_SECONDS` (zero or more).
Set `FLY_MIN_MACHINES_RUNNING=1` to stay warm. Optional `FLY_API_TOKEN` can hold a
scoped app deploy token; blank uses saved `fly auth login` credentials. An
inherited shell `FLY_API_TOKEN` or `FLY_ACCESS_TOKEN` is not used. Both aliases
are cleared before supplying the file's optional token, so blank falls back to
saved login credentials. All instance Fly settings come
from this file; no tracked `fly.toml` needs editing.

### Precreate the app and its volume

Install the current [Fly CLI](https://fly.io/docs/flyctl/install/). Substitute
the exact app name, region, volume name and size chosen above. This example
precreates a 2 GB volume for `FLY_VOLUME_SIZE_GB=2`; replace `2` with the chosen
minimum before running it:

```sh
fly auth login
fly apps create your-shoebox-name
fly volumes create shoebox_data --size 2 --region iad --app your-shoebox-name
fly volumes list --app your-shoebox-name
fly machine list --app your-shoebox-name
```

Use exactly one healthy matching volume in that region, at least the configured
minimum size. If an existing catalog is smaller, extend it before deploying:

```sh
fly volumes extend vol_your_catalog_id --size 2 --app your-shoebox-name
```

Use its actual volume ID and the desired size; volumes cannot be shrunk.
Initial setup has no application machine; subsequent deploys require exactly one
Fly-managed v2 machine (`config.metadata.fly_platform_version=v2`) in the `app`
process group, mounted to this exact volume ID at the configured path.
Unmanaged machines or a different platform version are refused because Fly's
deployment planner excludes them from the app's managed machines. Multiple
machines, duplicate matching volumes, region/group mismatches, or an
unexpected volume attachment are refused before secret changes. The deploy
command does not create the app or its initial catalog volume.

### Deploy and check

```sh
pnpm run deploy
curl --fail https://your-shoebox-name.fly.dev/api/health
```

Use **`pnpm run deploy`**, because pnpm 10's built-in `pnpm deploy` is a different
workspace packaging command and shadows the script. The script reports colored
phases: local preflight, Fly validation, secret staging, build/deploy and
completion. Preflight names all missing files and active example keys, rejects
required blanks and invalid runtime settings, and makes no remote writes on
failure. `DATABASE_PATH` must be an absolute file within `FLY_MOUNT_PATH`.

Server values are imported via stdin using `fly secrets import --stage` and
injected at runtime. Absent known runtime keys, including `B2_KEY_PREFIX` and
`WEB_DIST_PATH`, are removed with `fly secrets unset --stage`; unrelated
operator secrets are retained. This makes the production file authoritative
without restarting the old machine during staging. Secret errors omit values.

The web file reaches the Docker builder through a BuildKit `web_env` secret
mount. `WEB_ENV_DIGEST` invalidates the web build cache when content changes.
The file itself never enters image layers; public `VITE_` values enter the
browser bundle. Development dependencies are installed explicitly to build,
then production dependencies are retained for the server and email templates.

The Docker context excludes local catalogs at `data/` and `apps/server/data/`,
`spike-media/`, design prototypes, agent tooling, logs, coverage, and editor
state. Keep these exclusions in `.dockerignore`: Git ignore rules do not
control Docker uploads. The build still needs `scripts/skills/postinstall.sh`
and `scripts/deploy/webBuild/`.

Deployment uses `--ha=false --strategy immediate`: stop the old application
before new code runs catalog migrations. There is brief downtime. HTTP and jobs
start only after successful migrations. No Fly `release_command` is used,
because its machine has no persistent catalog mount. Temporary config is removed
on success and command failure; Fly's live build/deploy output is retained with
server values redacted.

Open the app after health succeeds. The admin's Shoebox settings page shows the
deployed package version. See [releases.md](releases.md) for release tags and
GitHub automation requirements.

### Let browsers upload to the bucket

Uploads go from the browser straight to Backblaze, so the bucket needs a CORS
rule naming your instance's address: `PUT`, `GET` and `HEAD`, the
`content-type` request header, and `ETag` exposed, without which a large video
cannot finish uploading. Memory Shoebox writes the rule itself, reading the
address from the instance's `public.base_url` setting, and says so and stops
while that setting is unset. Run it on the machine, where the instance's own
secrets and catalog are:

```sh
fly ssh console --app your-shoebox-name -C "node /app/apps/server/scripts/configureBucketCors/configureBucketCors.ts"
fly ssh console --app your-shoebox-name -C "node /app/apps/server/scripts/configureBucketCors/configureBucketCors.ts --apply"
```

The first prints the bucket's current rules beside the one it needs; the
second adds it, keeping any rules the bucket already has. Locally,
`pnpm b2:cors` and `pnpm b2:cors --apply` do the same, with the development
origin (`http://localhost:38473`) as well. Rerun it after changing the
development port, and update the local Shoebox public URL if it still names the
old port. If Backblaze refuses to read or write the rules, the command
prints Backblaze's own answer and the `b2` command-line command that sets the
rule instead: the web console's CORS presets cannot express it. Run that
command signed in (`b2 account authorize`) with a key allowed to write bucket
settings, such as your master key: the application key from step 1 may only
reach the bucket's files. That command
replaces every CORS rule on the bucket, so read the existing ones first, as it
says. Run it again whenever the instance's address changes, for example after
adding a custom domain.

### Cancel unfinished large files after a few days

A video at or over 32 MiB goes up as a multipart upload, and Backblaze bills its
parts until the upload is finished or cancelled. Memory Shoebox cancels the
ones it abandons, and retries a cancel that fails, but one case has nothing
left to retry it from: an upload opened by a request that then failed to
record it, and whose cancel failed too. As a safety net, give the bucket a
lifecycle rule that cancels unfinished large files after a few days
(`daysFromStartingToCancelingUnfinishedLargeFiles` in Backblaze's lifecycle
rules). A real upload never stays unfinished that long, because the abandon
sweep gives up on a batch after an hour and a half with no activity.

## 5. A custom domain (optional)

```sh
fly certs add photos.example.com --app your-shoebox-name
```

`flyctl` prints the DNS records to add at your registrar. Once they resolve,
Fly issues the certificate automatically.

## Operating an instance

### Updating and retrying a failed deploy

Choose a published `vX.Y.Z` tag rather than a moving development branch:

```sh
git fetch --tags origin
git checkout v1.0.0  # replace with the release selected for this instance
pnpm install --frozen-lockfile
pnpm run deploy
curl --fail https://your-shoebox-name.fly.dev/api/health
```

Check the three examples for new active keys before deploying. Preflight names
missing keys instead of silently inserting values. Keep the existing session
secret. Startup takes a verified pre-upgrade catalog backup before pending
migrations; no separate migration command is needed. Copy backups off-volume.
Read [migrations.md](migrations.md) before an upgrade or restore.

If Fly validation fails, inspect the app, machine and volume with the commands
above and correct `.env.deploy` or the unsupported layout. If secret staging or
build fails, fix the input/tooling and rerun `pnpm run deploy`; staged secrets
are not deployed to the old machine. A staging failure can leave partial staged
changes, so always rerun the complete script, not `fly secrets deploy`. If new
code fails migration validation, it never opens HTTP. Inspect `fly logs` and use
the retained backup and matching release for offline recovery. Do not deploy old
code against a successfully upgraded catalog without checking schema compatibility.

### Logs and shell access

```sh
fly logs --app your-shoebox-name
fly ssh console --app your-shoebox-name
```

### Backups

Two things to back up, and they are very different:

- **Your media** lives in Backblaze. It is already durable and replicated.
  Memory Shoebox deletes from your bucket only what the catalog no longer
  names: a photograph somebody deleted, and whatever an upload that was cut
  short, abandoned or failed left behind. **Do not keep previous versions in
  this bucket**: it must keep only the last version (step 1), or none of
  those deletes frees any storage. A hidden file is deleted a day after it is
  hidden, which is a one-day undo and no more. If you want a copy that
  survives a deletion, copy the bucket somewhere else on a schedule with a
  tool that does not carry deletions across (`rclone copy`, not
  `rclone sync`).
- **The SQLite catalog** lives on the Fly volume at `/data/memory-shoebox.db` and
  holds everything else: accounts, posts, captions, comments. Fly takes daily
  volume snapshots by default, but pulling your own copy periodically is wise:

  ```sh
  fly ssh console --app your-shoebox-name -C "node /app/apps/server/scripts/backupDatabase.ts /data/memory-shoebox.db /data/backup.db"
  fly sftp get /data/backup.db --app your-shoebox-name
  ```

Choose a new backup filename each time; the backup tool refuses an existing
destination.

For offline restoration, stop all application processes, preserve the failed
catalog and its WAL/SHM sidecars, and restore a verified backup with the matching
release. The exact mounted-filesystem commands are in
[migrations.md](migrations.md#offline-restore). The production image ships the
Node backup tool; no `sqlite3` shell is required. Same-volume backups protect
against upgrade mistakes, not volume loss. Retain off-volume copies.

### Cold starts

The deploy example sets `FLY_AUTO_STOP_MACHINES=suspend` and
`FLY_MIN_MACHINES_RUNNING=0`. An idle instance wakes on the next request. The
first request after a quiet period is slower; use `FLY_MIN_MACHINES_RUNNING=1`
and redeploy to stay warm.

## Troubleshooting

| Symptom                                          | Likely cause                                                                                                               |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Server exits at boot with a configuration error  | A missing or malformed variable. The error names every one. See [configuration.md](configuration.md).                      |
| `SESSION_SECRET: must be at least 32 characters` | Generate one with `openssl rand -hex 32`.                                                                                  |
| The health check passes but the page is blank    | The web app was not built into the image. Confirm `pnpm --filter @memory-shoebox/web build` succeeds locally.              |
| Everyone is logged out after a deploy            | `SESSION_SECRET` changed. Set it once and leave it alone.                                                                  |
| Data disappears after a restart                  | `DATABASE_PATH` is not on the mounted volume. It must be under `/data`.                                                    |
| Uploads fail with a CORS error                   | The bucket has no CORS rule for this address. See [Let browsers upload to the bucket](#let-browsers-upload-to-the-bucket). |
