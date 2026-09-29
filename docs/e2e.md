# End-to-end tests (`e2e/`)

Fifteen Playwright tests that drive a real browser against a real Fastify
process. They are the layer above `pnpm test`: Vitest renders a component
against a mocked `apiFetch`, and there is a class of promise this product
makes that no mock can check. That a cookie survives a reload. That a device
signed out in one browser stops working in another on its next request. That a
six-digit code the server actually minted, in a message it actually rendered,
gets somebody in.

`e2e/signIn.spec.ts` covers surface 1, `e2e/account.spec.ts` covers surface 9,
and `e2e/support/` holds the four modules they share.

## How to run it

```sh
pnpm exec playwright install chromium   # once per machine
pnpm test:e2e
```

**It is not part of `pnpm check`**, deliberately. It needs a browser binary
that a fresh clone does not have and a free port that a shared machine may not
have, and it builds the web app before it starts. `pnpm check` has to be
runnable by anybody who has just cloned the repository; this is run
deliberately, before a step is called done.

## The topology it runs in

**One Fastify process serves both the API and the built web app**, on one
origin, which is exactly how this deploys (see
[architecture.md](architecture.md)). Nothing is proxied and nothing is
stubbed, so the static-serving path is exercised rather than assumed and there
is no CORS configuration to get wrong in a test that production would not
have. The cost is a `pnpm build` before the run.

`e2e/support/e2eEnvironment.ts` is the one place that shape is written: the
port (8099, away from `pnpm dev`'s 8080 so a running dev server is not in the
way), the catalog the run owns, and the environment the server under test
starts in. Every path in it is absolute, because Playwright runs the specs
from the repository root while the server starts in `apps/server`, and a
relative `DATABASE_PATH` would name two different files.

**One worker, and not for speed.** There is one SQLite catalog and the specs
sign devices in and out of members inside it. Two workers would be two runs
fighting over the same device list.

## Why the run leaves mail unconfigured

A test has to read a sign-in code, and the only honest place to read one from
is where the product put it.

`E2E_SERVER_ENVIRONMENT` sets `RESEND_API_KEY` and `ENABLE_FAKE_EMAIL` to the
empty string. With no sender configured the mail worker defers every message
back to `queued` **without scrubbing it**, so the six digits stay in
`outbound_emails.payload_json` and `readSignInCode` can select them. Configure
a sender and the row reaches `sent`, `makeScrubPatchFromKind` wipes both the
payload and the subject, and that helper fails loudly and correctly rather
than reading a stale code.

Both variables are named and emptied rather than merely left out: a key
exported in a developer's shell would otherwise send real mail and scrub the
digits. The Upstash pair is emptied for the same reason, so an inherited
credential cannot put this run's rate-limit counters in somebody's shared
Redis.

This is also why the helper reads the database directly rather than through a
route. There is no route that creates a member (that is step 8a) and there
must never be one that reads a sign-in code.

## The catalog lock

Every run starts by deleting last run's catalog, so a specification cannot
depend on yesterday. `e2e/support/deleteE2eCatalog.ts` does it as the **first
link of the web server command**, not in a Playwright `globalSetup`:
Playwright starts `webServer` and waits for it to answer before `globalSetup`
runs, so a deletion there would unlink the file under a server that already
had it open. The server would go on writing to the unlinked inode while the
specs read a fresh empty file at the same path.

Before deleting anything it takes a lock file beside the catalog, recording
the pid of the shell the run was spawned on. A second run started over a live
one is refused with a message rather than quietly corrupting both. A crashed
run leaves a lock whose pid is dead, and the next run recognises that and
takes it anyway, so nobody has to know the file exists; a half-hour maximum
age covers the remaining case of a pid the operating system has reissued.
`globalTeardown` gives the lock back, which is tidiness rather than
correctness.

## The per-IP mint budget

`signInCodeRequestPerIp` allows twenty sign-in codes an hour. **The whole
suite shares that one bucket**, because every request in a run comes from
`127.0.0.1`, while the per-address caps are spent two at a time by specs that
each own their own address.

`e2e/support/signIn.ts` counts the run's mints against the rule the server
actually applies, read from `RATE_LIMIT_RULES` rather than copied into a
comment, and throws at the mint that would exceed it. Without that guard the
budget was enforced by prose: the total was right, but only because somebody
had added it up by hand across two files. A sign-in added anywhere would spend
the budget and surface as a bare `toBeVisible` timeout on the code field, in
whichever spec ran next, with the real cause visible only in the trace.

The count is a floor rather than a mirror, since a worker replaced mid-run
starts from zero while the server's bucket does not. Under-counting costs
nothing that was not already being paid: it lands the failure back on the
`429`.

**Every way of asking for a code goes through that file**, including the
keyboard-only one. A helper that reached past the driver to mint its own code
put the guard one behind the server, which is exactly the failure it exists to
prevent.

## What the specs may and may not do

Nothing in `e2e/support/signIn.ts` posts to the API. A helper that
short-circuited the form by calling `POST /api/auth/session` itself would hand
the account tests a session the product did not make, and what those tests are
for is proving that a session the product made actually works. `signInAs`
hands nothing back either, so the next spec wanting a shortcut does not find a
credential here; the one test that needs the digits it spent reads them from
`readSignInCode`.

`trace: "retain-on-failure"` and `screenshot: "only-on-failure"` cost nothing
on a passing run, because Playwright throws away what it recorded for a test
that passed.
