# Self-hosting Famgram

Famgram deploys as a single [Fly.io](https://fly.io) app backed by a
[Backblaze B2](https://www.backblaze.com/cloud-storage) bucket. One process
serves both the web app and the API, so there is one deploy, one domain, and no
CORS configuration to get wrong.

> Famgram is in early development and has no product features yet. Follow this
> to stand up an instance and confirm the plumbing works; do not put a real
> family archive on it until there is something to put there.

Expect the first setup to take about twenty minutes.

## What it costs, roughly

A family instance is small. A Fly machine that suspends when idle plus a 1 GB
volume runs a few dollars a month, and Backblaze charges by the gigabyte
stored. Media dominates: the database holds metadata only.

## What you need

- A [Backblaze](https://www.backblaze.com) account.
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

Those four values map to `B2_KEY_ID`, `B2_APPLICATION_KEY`, `B2_BUCKET`,
`B2_ENDPOINT`, and `B2_REGION`.

## 2. Run it locally first

Worth doing: it confirms your Backblaze credentials before Fly.io is in the
picture.

```sh
git clone https://github.com/<owner>/famgram.git
cd famgram
pnpm install
cp apps/server/.env.example apps/server/.env.local
```

Fill in `apps/server/.env.local`, generating the session secret with:

```sh
openssl rand -hex 32
```

Then:

```sh
pnpm dev
```

Open http://localhost:5173. The page reports whether it can reach the API.

## 3. Deploy to Fly.io

### Create the app and its volume

`fly.toml` in the repository root is a template. Pick your own app name and a
region close to your Backblaze bucket.

```sh
fly auth login
fly apps create your-famgram-name
fly volumes create famgram_data --size 1 --region iad --app your-famgram-name
```

Then edit `fly.toml` and set `app` to your app name and `primary_region` to
the region you used.

### Set the secrets

Non-secret settings are already in `fly.toml`. The rest are secrets:

```sh
fly secrets set --app your-famgram-name \
  SESSION_SECRET="$(openssl rand -hex 32)" \
  B2_KEY_ID="..." \
  B2_APPLICATION_KEY="..." \
  B2_BUCKET="..." \
  B2_ENDPOINT="https://s3.us-west-004.backblazeb2.com" \
  B2_REGION="us-west-004"
```

Setting secrets on an existing app restarts it. That is expected.

### Deploy

```sh
fly deploy
```

The image builds the web app, prunes development dependencies, and starts the
server. Migrations run automatically at boot.

Check it:

```sh
curl https://your-famgram-name.fly.dev/api/health
# {"status":"ok","version":"0.0.0","uptimeSeconds":3}
```

Then open `https://your-famgram-name.fly.dev` in a browser.

## 4. A custom domain (optional)

```sh
fly certs add photos.example.com --app your-famgram-name
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
fly logs --app your-famgram-name
fly ssh console --app your-famgram-name
```

### Backups

Two things to back up, and they are very different:

- **Your media** lives in Backblaze. It is already durable and replicated, and
  Famgram never deletes from your bucket on its own. Consider turning on B2
  lifecycle rules to keep previous versions.
- **The SQLite catalog** lives on the Fly volume at `/data/famgram.db` and
  holds everything else: accounts, posts, captions, comments. Fly takes daily
  volume snapshots by default, but pulling your own copy periodically is wise:

  ```sh
  fly ssh console --app your-famgram-name -C "sqlite3 /data/famgram.db '.backup /data/backup.db'"
  fly sftp get /data/backup.db --app your-famgram-name
  ```

### Cold starts

`fly.toml` sets `auto_stop_machines = "suspend"` and
`min_machines_running = 0`, so an idle instance costs almost nothing and wakes
on the next request. The first request after a quiet period is slower. If you
would rather pay for it to stay warm, set `min_machines_running = 1`.

## Troubleshooting

| Symptom                                          | Likely cause                                                                                           |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Server exits at boot with a configuration error  | A missing or malformed variable. The error names every one. See [configuration.md](configuration.md).  |
| `SESSION_SECRET: must be at least 32 characters` | Generate one with `openssl rand -hex 32`.                                                              |
| The health check passes but the page is blank    | The web app was not built into the image. Confirm `pnpm --filter @famgram/web build` succeeds locally. |
| Everyone is logged out after a deploy            | `SESSION_SECRET` changed. Set it once and leave it alone.                                              |
| Data disappears after a restart                  | `DATABASE_PATH` is not on the mounted volume. It must be under `/data`.                                |
