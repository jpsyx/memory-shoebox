# Configuration

Every setting is an environment variable read by the API server at startup and
validated by `apps/server/src/config.ts`. The web app has no runtime
configuration at all: it always calls `/api` on its own origin.

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

| Variable             | Description                                                                                                                                        |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SESSION_SECRET`     | Encrypts the session cookie. **At least 32 characters.** Generate with `openssl rand -hex 32`. Unique per instance. Changing it logs everyone out. |
| `B2_KEY_ID`          | The `keyID` of a Backblaze application key.                                                                                                        |
| `B2_APPLICATION_KEY` | The `applicationKey` that goes with it. Backblaze shows it only once, at creation.                                                                 |
| `B2_BUCKET`          | Name of the private B2 bucket holding your media.                                                                                                  |
| `B2_ENDPOINT`        | The bucket's S3-compatible endpoint, as a URL, for example `https://s3.us-west-004.backblazeb2.com`.                                               |
| `B2_REGION`          | The matching region, for example `us-west-004`. It is the middle segment of the endpoint hostname.                                                 |

## Optional

| Variable              | Default                      | Description                                                                                                                                                                 |
| --------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`            | `development`                | Set to `production` in a deployed instance.                                                                                                                                 |
| `PORT`                | `8080`                       | Port the server listens on.                                                                                                                                                 |
| `HOST`                | `0.0.0.0`                    | Interface to bind. Fly.io requires `0.0.0.0`.                                                                                                                               |
| `DATABASE_PATH`       | `./data/memory-shoebox.db`   | Path to the SQLite file. On Fly.io this must be on the mounted volume, for example `/data/memory-shoebox.db`. The parent directory is created if missing.                   |
| `WEB_DIST_PATH`       | `apps/web/dist`              | Directory holding the built web app. Resolved relative to the server package. When it does not exist, the server serves the API only, which is what happens in development. |
| `B2_THUMBNAIL_PREFIX` | `.memory-shoebox-thumbnails` | Key prefix under which Memory Shoebox writes generated thumbnails into your bucket. A trailing slash is stripped.                                                           |

## Email, once authentication exists

Signing in means sending a six-digit code, so a deployment needs transactional
mail. We use [Resend](https://resend.com).

| Variable         | Description                                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `RESEND_API_KEY` | API key from the Resend dashboard.                                                                                             |
| `MAIL_FROM`      | The sending identity, for example `Memory Shoebox <hello@your-domain.example>`. The domain has to be verified in Resend first. |

Neither is read by the server yet, because authentication is not built. They
are documented now because they change what a self-hoster has to set up, and
because a deployment whose mail is broken cannot let anybody in at all, the
admin included.

## Notes

**`SESSION_SECRET` is not a password.** It is the key that makes session
cookies unforgeable. Anyone who learns it can mint a valid session for your
instance, so treat it like a private key.

**Backblaze keys should be scoped.** Create an application key restricted to
the single bucket Memory Shoebox uses, rather than a master key. See
[deployment.md](deployment.md#1-create-a-backblaze-b2-bucket).

**The database is metadata only.** It holds no media bytes, so a 1 GB Fly
volume is generous even for a large family archive.
