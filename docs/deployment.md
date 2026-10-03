# Self-hosting Memory Shoebox

Memory Shoebox deploys as a single [Fly.io](https://fly.io) app backed by a
[Backblaze B2](https://www.backblaze.com/cloud-storage) bucket. One process
serves both the web app and the API, so there is one deploy, one domain, and no
CORS configuration on the app to get wrong. The bucket needs one CORS rule,
because browsers upload to it directly: see
[Let browsers upload to the bucket](#let-browsers-upload-to-the-bucket).

> Memory Shoebox is in early development and has no product features yet. Follow this
> to stand up an instance and confirm the plumbing works; do not put a real
> family archive on it until there is something to put there.

Expect the first setup to take about twenty minutes.

## What it costs, roughly

A family instance is small. A Fly machine that suspends when idle plus a 1 GB
volume runs a few dollars a month, and Backblaze charges by the gigabyte
stored. Media dominates: the database holds metadata only.

## What you need

- A [Backblaze](https://www.backblaze.com) account.
- A [Resend](https://resend.com) account and a domain you can verify, for
  sending sign-in codes. Needed once authentication exists.
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
`production` (which `fly.toml` sets), and `test/` for everything else. You set
nothing for this; `B2_KEY_PREFIX` exists to override it
([configuration.md](configuration.md#test-and-production-share-a-bucket)).

For a hard wall rather than a convention, create the application key in step 3
twice, both scoped to this bucket, and fill in the **File name prefix** field
of each:

- the production key, with the prefix `production/`, goes on the Fly.io app;
- a separate test key, with the prefix `test/`, goes in
  `apps/server/.env.local`.

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

Only needed once authentication is built, but it belongs in the plan now
because it decides whether anybody can sign in.

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

Open http://localhost:5173. The page reports whether it can reach the API.

## 4. Deploy to Fly.io

### Create the app and its volume

`fly.toml` in the repository root is a template. Pick your own app name and a
region close to your Backblaze bucket.

```sh
fly auth login
fly apps create your-shoebox-name
fly volumes create memory_shoebox_data --size 1 --region iad --app your-shoebox-name
```

Then edit `fly.toml` and set `app` to your app name and `primary_region` to
the region you used.

### Set the secrets

Non-secret settings are already in `fly.toml`. The rest are secrets:

```sh
fly secrets set --app your-shoebox-name \
  SESSION_SECRET="$(openssl rand -hex 32)" \
  B2_KEY_ID="..." \
  B2_APPLICATION_KEY="..." \
  B2_BUCKET="..." \
  B2_ENDPOINT="https://s3.us-west-004.backblazeb2.com" \
  B2_REGION="us-west-004"
```

No key prefix is needed here: `fly.toml` sets `NODE_ENV=production`, so the
app files everything under `production/`.

Setting secrets on an existing app restarts it. That is expected.

### Deploy

```sh
fly deploy
```

The image builds the web app, prunes development dependencies, and starts the
server. Migrations run automatically at boot.

Check it:

```sh
curl https://your-shoebox-name.fly.dev/api/health
# {"status":"ok","version":"0.0.0","uptimeSeconds":3}
```

Then open `https://your-shoebox-name.fly.dev` in a browser.

### Let browsers upload to the bucket

Uploads go from the browser straight to Backblaze, so the bucket needs a CORS
rule naming your instance's address: `PUT`, `GET` and `HEAD`, the
`content-type` request header, and `ETag` exposed, without which a large video
cannot finish uploading. Memory Shoebox writes the rule itself, reading the
address from the instance's `public.base_url` setting, and says so and stops
while that setting is unset. Run it on the machine, where the instance's own
secrets and catalog are:

```sh
fly ssh console --app your-shoebox-name -C "node /app/apps/server/scripts/configureBucketCors.ts"
fly ssh console --app your-shoebox-name -C "node /app/apps/server/scripts/configureBucketCors.ts --apply"
```

The first prints the bucket's current rules beside the one it needs; the
second adds it, keeping any rules the bucket already has. Locally,
`pnpm b2:cors` and `pnpm b2:cors --apply` do the same, with the development
origin as well. If Backblaze refuses to read or write the rules, the command
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

### Updating

```sh
git pull
fly deploy
```

Migrations run at startup, so there is no separate step.

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
  fly ssh console --app your-shoebox-name -C "sqlite3 /data/memory-shoebox.db '.backup /data/backup.db'"
  fly sftp get /data/backup.db --app your-shoebox-name
  ```

### Cold starts

`fly.toml` sets `auto_stop_machines = "suspend"` and
`min_machines_running = 0`, so an idle instance costs almost nothing and wakes
on the next request. The first request after a quiet period is slower. If you
would rather pay for it to stay warm, set `min_machines_running = 1`.

## Troubleshooting

| Symptom                                          | Likely cause                                                                                                               |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Server exits at boot with a configuration error  | A missing or malformed variable. The error names every one. See [configuration.md](configuration.md).                      |
| `SESSION_SECRET: must be at least 32 characters` | Generate one with `openssl rand -hex 32`.                                                                                  |
| The health check passes but the page is blank    | The web app was not built into the image. Confirm `pnpm --filter @memory-shoebox/web build` succeeds locally.              |
| Everyone is logged out after a deploy            | `SESSION_SECRET` changed. Set it once and leave it alone.                                                                  |
| Data disappears after a restart                  | `DATABASE_PATH` is not on the mounted volume. It must be under `/data`.                                                    |
| Uploads fail with a CORS error                   | The bucket has no CORS rule for this address. See [Let browsers upload to the bucket](#let-browsers-upload-to-the-bucket). |
