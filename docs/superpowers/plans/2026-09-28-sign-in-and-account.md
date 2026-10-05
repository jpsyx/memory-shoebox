# Sign in and my account implementation plan

> Historical source references. `reference/` and `@memory-shoebox/reference` below are historical shorthand for the retired surface package at commit `3e09157b`, not current paths or runnable instructions. Read that commit for the original source spelling. Product decisions remain binding; current implementation and acceptance are documented in `docs/web.md` and step 9 verification.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build surfaces 1 (Sign in) and 9 (My account) in `apps/web` against
the routes step 3a finished, replace the placeholder viewer with a real
session, and stand up the end-to-end harness the build has not had.

**Architecture:** Surface 1 keeps its state in the URL (`email`, `sent`,
`redirect`) with the last server response in component state; `unknown` is not
a client state, because a `202` renders one thing. One `GET /api/me` query
serves both the route guard and surface 9. The end-to-end run starts the API
with mail unconfigured, which makes the mail worker defer every `sign_in_code`
row back to `queued` with its six digits intact, so a test reads the code out
of SQLite with no race and no PDF.

**Tech Stack:** React 19, Mantine 9, TanStack Router 1.170 (file-based),
TanStack Query 5.103, Zod 4, Vitest with jsdom and Testing Library,
`@playwright/test` for the end-to-end layer.

**The step design this implements:**
[`docs/superpowers/specs/2026-09-28-sign-in-and-account-design.md`](../specs/2026-09-28-sign-in-and-account-design.md).
Read it once before Task 1. Its decisions 1 to 8 are the reasoning behind
everything below; this document is the how.

**Binding repository rules:** [`AGENTS.md`](../../../AGENTS.md) (red/green TDD
by default, the scope rule, no em dashes in comments, the naming shapes),
[`docs/rules/typescript.md`](../../rules/typescript.md),
[`docs/rules/styling.md`](../../rules/styling.md) (CSS modules, never inline
styles, never Tailwind), [`docs/rules/routing.md`](../../rules/routing.md)
(never hand-edit `routeTree.gen.ts`).

**Run after every task:** `pnpm check` from the repository root. It must be
green before the task is called done.

---

## File structure

> **Two corrections applied after Task 4 was reviewed, and binding on every
> later task.** The guard is `requireSignedIn`, in
> `apps/web/src/session/requireSignedIn/requireSignedIn.ts`: it returns
> `{ viewer, settings }`, so the old name no longer described it. Task 4's text
> below still uses the old name and is left as the historical record of what
> was asked for. And the `MeResponse` test fixture is now
> `createMeResponse(overrides)` from `apps/web/src/testing/createMeResponse.ts`:
> **do not hand-write another `MeResponse` literal in a test.**

> **The co-named-file rule applies everywhere, and the plan gets it wrong in
> more than one place.** A file gains its own equally-named directory as soon
> as it gains a co-named test, and stays flat beside its siblings until then
> (`apps/web/src/system/Chip/` is the worked example: `Chip.tsx` with its test
> in its own directory, `ChipRow.tsx` flat beside it). Where a task below lists
> a flat path for a file that has a co-named test, the nested path wins.

> **Layout correction, applied after Task 3 was reviewed.** `docs/rules/typescript.md`
> requires that a file with a co-named test live in an equally-named directory,
> which the plan originally got wrong for these three modules. They are
> `api/auth/auth.ts`, `api/me/me.ts` and `api/publicSettings/publicSettings.ts`,
> and every import below uses those paths. `apiFetch`'s module also now exports
> `jsonInit(method, body)`, which is what builds a JSON request body.

**Created in `apps/web/src`:**

| File                                  | Responsibility                                                            |
| ------------------------------------- | ------------------------------------------------------------------------- |
| `api/publicSettings.ts`               | The anonymous Shoebox name query                                          |
| `api/auth.ts`                         | Mint, resend, redeem, sign out                                            |
| `api/me.ts`                           | The account query, the name and switch write, the device list, the revoke |
| `session/firstSignIn/firstSignIn.ts`  | The one-time flag, set on redemption and read once                        |
| `surfaces/SignIn/signInCopy.ts`       | Every string surface 1 can show, including each failure                   |
| `surfaces/SignIn/CodeField.tsx`       | The one wide six-digit field                                              |
| `surfaces/SignIn/SignInCard.tsx`      | The state machine and the form                                            |
| `surfaces/Account/notifyKinds.ts`     | The four switches and the sentence under each                             |
| `surfaces/Account/YouSheet.tsx`       | The name, the fixed address, the banner                                   |
| `surfaces/Account/EmailSheet.tsx`     | The four switches and turn-them-all-off                                   |
| `surfaces/Account/DevicesSheet.tsx`   | The device table                                                          |
| `surfaces/Account/SignOutModal.tsx`   | Both confirmations, which differ only in copy                             |
| `surfaces/Account/AdminDoors.tsx`     | The five doors, admin only                                                |
| `surfaces/Account/LicenceSheet.tsx`   | AGPL section 13's reachable source                                        |
| `surfaces/Account/AccountSurface.tsx` | Assembles the five sheets                                                 |

**Modified in `apps/web/src`:** `session/requireSignedIn/requireSignedIn.ts`,
`routes/sign-in.tsx`, `routes/_app.tsx`, `routes/_app/account.tsx`,
`routes/_app/index.tsx`.

**Created elsewhere:** `apps/server/scripts/seedMember.ts`,
`playwright.config.ts`, `e2e/support/testServer.ts`, `e2e/support/database.ts`,
`e2e/signIn.spec.ts`, `e2e/account.spec.ts`.

**Modified elsewhere:** `reference/src/surfaces/SignIn.tsx`, both
`package.json` files, and the documentation listed in Task 13.

`src/surfaces/` is new and mirrors `reference/src/surfaces/`. It is not under
`src/routes/`, because the router plugin treats every file there as a route.
Route files stay thin: a search schema and the surface.

---

## Task 1: Correct the prototype's sign-in copy

**Files:**

- Modify: `reference/src/surfaces/SignIn.tsx`

**Why:** `auth.md` says in as many words that "We sent a six-digit code to
abuela@example.com" is a claim the server cannot make and must never be able to
make, that the conditional wording is the only correct copy for every outcome
of that route, and that this file needs the change. This step's Verification
compares every state against its prototype URL, so a reference that is
knowingly wrong makes that comparison lie.

**No test.** `AGENTS.md` exempts copy changes from TDD, and `reference` has no
test suite. It is type-checked and looked at.

- [ ] **Step 1: Add the address helper**

Above `SignInSurface`, after the `LEDE` constant:

```tsx
/**
 * The address each state's copy is about.
 *
 * `unknown` uses an address nobody here has heard of and every other state
 * uses a member's. **That is the only difference between them.** The words
 * around it are identical, deliberately: the form cannot be used to find out
 * who is a member, so it cannot claim to have sent anything
 * (`apis/auth.md`, "The copy correction this route forces").
 */
function addressFor(state: SignInState): string {
  return state === "unknown" ? "somebody@example.com" : "abuela@example.com";
}
```

- [ ] **Step 2: Collapse `unknown` into the same copy as `sent`**

Replace the whole conditional body inside the first `<Stack gap="sm">`, from
`{state === "link" ? (` to its closing `)}`, with:

```tsx
{
  state === "link" ? (
    <Prose>
      Sign in and it opens on the one you were sent. Only people in this Shoebox
      can see inside, so the link on its own will not do it.
    </Prose>
  ) : state === "email" ? (
    <Prose>
      We will email you a six-digit code. There is no password to remember and
      nothing to install.
    </Prose>
  ) : state === "resent" ? (
    <Prose>
      If <b>{addressFor(state)}</b> is in this Shoebox, a new code is on its way
      there now. The old one has stopped working. It usually arrives in about a
      minute.
    </Prose>
  ) : (
    <Prose>
      If <b>{addressFor(state)}</b> is in this Shoebox, a six-digit code is on
      its way there now. It arrives in about a minute and it works for ten.
    </Prose>
  );
}
```

- [ ] **Step 3: Use the same helper for the field's value**

Replace the email `TextInput`'s `defaultValue` expression with:

```tsx
defaultValue={state === "email" ? "" : addressFor(state)}
```

- [ ] **Step 4: Update the `unknown` state note**

In the `states` array, the `unknown` entry's `note` becomes:

```tsx
note: "Byte for byte the same as a known address, now in the copy as well as on the wire. The form cannot be used to discover who is a member.",
```

- [ ] **Step 5: Verify by eye**

```bash
pnpm --filter @memory-shoebox/reference type-check
pnpm dev:reference
```

Open `http://localhost:5174/s/sign-in?state=sent` and
`http://localhost:5174/s/sign-in?state=unknown`. Every word must match; only
the address differs.

- [ ] **Step 6: Commit**

```bash
git add reference/src/surfaces/SignIn.tsx
git commit -m "fix(reference): the sign-in copy cannot claim a code was sent"
```

---

## Task 2: `pnpm seed:member`

**Files:**

- Create: `apps/server/scripts/seedMember.ts`
- Create: `apps/server/test/seedMember.test.ts`
- Modify: `apps/server/package.json`
- Modify: `package.json` (repository root)

**Why:** Inviting belongs to step 8a, so there is no way to create a member and
therefore no way to sign in by hand or in a test. The script also writes
`public.base_url` when it is unset, and that is not incidental: `enqueueEmail`
writes a `sign_in_code` row **born terminal and already scrubbed** when that
setting is missing, which would leave Task 11's harness reading an empty
payload.

**Context you need:** `createDatabase(path)` in `apps/server/src/db/client.ts`
returns a typed Kysely handle. `migrateToLatest(database)` in
`apps/server/src/db/migrate.ts` applies migrations. `createId()` in
`apps/server/src/db/createId.ts` mints a uuidv7. The `members` columns are in
`apps/server/src/db/types/identityAndAccess.types.ts` and the `settings`
columns are in `apps/server/src/db/types/operations.types.ts`. Relative imports
in `apps/server` **must carry the `.ts` extension**.

- [ ] **Step 1: Write the failing test**

Create `apps/server/test/seedMember.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createDatabase } from "../src/db/client.ts";
import { migrateToLatest } from "../src/db/migrate.ts";
import { seedMember } from "../scripts/seedMember.ts";

async function _freshDatabase() {
  const database = createDatabase(":memory:");
  await migrateToLatest(database);
  return database;
}

describe("seedMember", () => {
  it("creates an active member at the address, ready to sign in", async () => {
    const database = await _freshDatabase();

    const seeded = await seedMember({
      database,
      email: "Abuela@Example.COM",
      role: "admin",
      baseUrl: "http://localhost:5173",
    });

    const row = await database
      .selectFrom("members")
      .selectAll()
      .where("id", "=", seeded.memberId)
      .executeTakeFirstOrThrow();
    expect(row.email).toBe("abuela@example.com");
    expect(row.role).toBe("admin");
    expect(row.status).toBe("invited");

    await database.destroy();
  });

  it("writes public.base_url, without which a sign-in code is born scrubbed", async () => {
    const database = await _freshDatabase();

    await seedMember({
      database,
      email: "abuela@example.com",
      role: "admin",
      baseUrl: "http://localhost:5173",
    });

    const setting = await database
      .selectFrom("settings")
      .select("value")
      .where("key", "=", "public.base_url")
      .executeTakeFirstOrThrow();
    expect(JSON.parse(setting.value)).toBe("http://localhost:5173");

    await database.destroy();
  });

  it("returns the member already there rather than a second row", async () => {
    const database = await _freshDatabase();
    const options = {
      database,
      email: "abuela@example.com",
      role: "admin" as const,
      baseUrl: "http://localhost:5173",
    };

    const first = await seedMember(options);
    const second = await seedMember(options);

    expect(second.memberId).toBe(first.memberId);
    expect(second.wasAlreadyThere).toBe(true);

    await database.destroy();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm --filter @memory-shoebox/server test seedMember
```

Expected: fails to resolve `../scripts/seedMember.ts`.

- [ ] **Step 3: Write the script**

Create `apps/server/scripts/seedMember.ts`:

```ts
import type { Kysely } from "kysely";
import { createDatabase } from "../src/db/client.ts";
import { createId } from "../src/db/createId.ts";
import { migrateToLatest } from "../src/db/migrate.ts";
import type { Database } from "../src/db/types/db.types.ts";

/**
 * Makes a member who can sign in, for local development and the end-to-end
 * run.
 *
 * **This exists because inviting does not yet.** The invitation lifecycle is
 * step 8a's, so until it lands there is no route that creates a member and
 * therefore nothing to sign in as. It is a development tool: it is not
 * reachable over HTTP, it is not imported by the server, and step 8a is where
 * it stops being needed.
 *
 * `status` is `invited` rather than `active` because that is what an invited
 * address really is, and because accepting an invitation is defined as the
 * first successful sign-in: `POST /api/auth/session` sets `joined_at` and
 * flips the status itself (Decision 2). Seeding `active` would skip the one
 * transition the first sign-in exists to make, and `isFirstSignIn` would come
 * back false on a member who has never signed in.
 */
export type SeededMember = {
  memberId: string;
  email: string;
  /** True when the address already had a member, which is not an error. */
  wasAlreadyThere: boolean;
};

/** What the script needs to make somebody who can sign in. */
export type SeedMemberOptions = {
  database: Kysely<Database>;
  email: string;
  role: "viewer" | "uploader" | "admin";
  /**
   * Written to `public.base_url` when that setting is unset.
   *
   * Not optional, and not cosmetic. `enqueueEmail` writes a `sign_in_code`
   * row already scrubbed when `public.base_url` is missing, so a Shoebox
   * without it queues sign-in codes whose digits are gone before anybody can
   * read them.
   */
  baseUrl: string;
};

/**
 * Seeds one member and the one setting a sign-in code needs.
 *
 * @param options.database An open, migrated database.
 * @param options.email The address, normalised here exactly as the API
 *   normalises it, so the seeded row is the row a sign-in finds.
 * @param options.role The member's role.
 * @param options.baseUrl Written to `public.base_url` if it is unset.
 * @returns The member, and whether it already existed.
 */
export async function seedMember(
  options: SeedMemberOptions,
): Promise<SeededMember> {
  const { database, role, baseUrl } = options;
  const email = options.email.trim().toLowerCase();
  const now = new Date().toISOString();

  await database
    .insertInto("settings")
    .values({
      id: createId(),
      scope: "instance",
      scope_id: null,
      key: "public.base_url",
      value: JSON.stringify(baseUrl),
      updated_at: now,
      updated_by_member_id: null,
    })
    .onConflict((conflict) => {
      return conflict.doNothing();
    })
    .execute();

  const existing = await database
    .selectFrom("members")
    .select("id")
    .where("email", "=", email)
    .executeTakeFirst();
  if (existing !== undefined) {
    return { memberId: existing.id, email, wasAlreadyThere: true };
  }

  const memberId = createId();
  await database
    .insertInto("members")
    .values({
      id: memberId,
      email,
      display_name: null,
      role,
      status: "invited",
      notify_on_upload: 1,
      notify_on_comment: 1,
      notify_on_reply: 1,
      notify_on_removal: 1,
      joined_at: null,
      last_signed_in_at: null,
      last_seen_at: null,
      removed_at: null,
      created_at: now,
    })
    .execute();

  return { memberId, email, wasAlreadyThere: false };
}

/** Reads `--role` and `--base-url`, both optional, from a bare argument list. */
function _readFlag(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? undefined : argv[index + 1];
}

/** Runs the script when it is executed rather than imported. */
async function _main(): Promise<void> {
  const argv = process.argv.slice(2);
  const email = argv.find((argument) => {
    return !argument.startsWith("--");
  });
  if (email === undefined) {
    process.stderr.write(
      "Usage: pnpm seed:member <address> [--role admin] [--base-url http://localhost:5173]\n",
    );
    process.exitCode = 1;
    return;
  }

  const database = createDatabase(
    process.env.DATABASE_PATH ?? "./data/memory-shoebox.db",
  );
  await migrateToLatest(database);
  const seeded = await seedMember({
    database,
    email,
    role: (_readFlag(argv, "role") ?? "admin") as SeedMemberOptions["role"],
    baseUrl: _readFlag(argv, "base-url") ?? "http://localhost:5173",
  });
  await database.destroy();

  process.stdout.write(
    seeded.wasAlreadyThere
      ? `${seeded.email} was already a member (${seeded.memberId})\n`
      : `${seeded.email} is now a member (${seeded.memberId})\n`,
  );
}

// `import.meta.main` is true only when Node was pointed at this file, so
// importing it from a test runs nothing.
if (import.meta.main === true) {
  await _main();
}
```

If `import.meta.main` is not available on the Node in use, fall back to
comparing `process.argv[1]` against `fileURLToPath(import.meta.url)` and say so
in a comment. Check with `node -e "console.log(process.version)"`; it is
available from Node 24.

- [ ] **Step 4: Run the tests and watch them pass**

```bash
pnpm --filter @memory-shoebox/server test seedMember
```

Expected: 3 passing.

- [ ] **Step 5: Add the scripts**

In `apps/server/package.json`, beside `migrate`:

```json
"seed:member": "node --env-file-if-exists=.env.local scripts/seedMember.ts"
```

In the root `package.json`, beside `migrate`:

```json
"seed:member": "pnpm --filter @memory-shoebox/server seed:member"
```

- [ ] **Step 6: Run it for real**

```bash
pnpm seed:member abuela@example.com --role admin
```

Expected: `abuela@example.com is now a member (018f…)`. Run it a second time
and it says `was already a member`.

- [ ] **Step 7: Commit**

```bash
git add apps/server/scripts/seedMember.ts apps/server/test/seedMember.test.ts apps/server/package.json package.json
git commit -m "feat(server): a dev script that makes somebody who can sign in"
```

---

## Task 3: The three API modules

**Files:**

- Create: `apps/web/src/api/publicSettings.ts`
- Create: `apps/web/src/api/auth.ts`
- Create: `apps/web/src/api/me.ts`
- Create: `apps/web/src/api/auth.test.ts`
- Create: `apps/web/src/api/me.test.ts`

**Context you need:** `apiFetch({ path, schema, init })` in
`apps/web/src/api/client/client.ts` prefixes `/api`, sends the cookie, throws
`ApiRequestError` on a non-2xx, and parses a `204` against the schema (pass
`z.void()`). `apps/web/src/api/health.ts` is the worked example of the
`queryOptions` shape. Every schema this task needs is already exported from
`@memory-shoebox/shared`; **add nothing to that package.** Imports in
`apps/web` carry no file extension.

The fetch-mocking pattern is in `apps/web/src/api/client/client.test.ts`: build
a `Response` and `vi.stubGlobal("fetch", …)`.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/api/auth.test.ts`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSession,
  deleteSession,
  requestSignInCode,
} from "@/api/auth/auth";

function _respondWith(body: unknown, status: number): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      return new Response(status === 204 ? null : JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("requestSignInCode", () => {
  it("posts the address to the mint route", async () => {
    _respondWith(
      { email: "abuela@example.com", expiresAt: "2026-09-28T10:10:00.000Z" },
      202,
    );

    await requestSignInCode({ email: "abuela@example.com", isResend: false });

    expect(fetch).toHaveBeenCalledWith(
      "/api/auth/sign-in-codes",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "abuela@example.com" }),
      }),
    );
  });

  it("posts to the resend route instead when asked for another", async () => {
    _respondWith(
      { email: "abuela@example.com", expiresAt: "2026-09-28T10:10:00.000Z" },
      202,
    );

    await requestSignInCode({ email: "abuela@example.com", isResend: true });

    expect(fetch).toHaveBeenCalledWith(
      "/api/auth/sign-in-codes/resend",
      expect.objectContaining({ method: "POST" }),
    );
  });
});

describe("createSession", () => {
  it("returns the parsed session, which carries the shell's settings", async () => {
    _respondWith(
      {
        me: {
          member: {
            memberId: "018f0000-0000-7000-8000-000000000000",
            displayName: "Abuela",
          },
          storedDisplayName: null,
          email: "abuela@example.com",
          role: "viewer",
          notify: {
            onUpload: true,
            onComment: true,
            onReply: true,
            onRemoval: true,
          },
          joinedAt: "2026-09-28T10:00:00.000Z",
          lastSignedInAt: "2026-09-28T10:00:00.000Z",
        },
        session: {
          sessionId: "018f0000-0000-7000-8000-000000000001",
          deviceLabel: "iPhone, Safari",
          createdAt: "2026-09-28T10:00:00.000Z",
          lastUsedAt: "2026-09-28T10:00:00.000Z",
          expiresAt: "2026-10-28T10:00:00.000Z",
          isCurrent: true,
        },
        isFirstSignIn: true,
        settings: {
          shoeboxName: "My Shoebox",
          pileArrangement: "messy",
          timezone: "Europe/Madrid",
        },
      },
      201,
    );

    const created = await createSession({
      email: "abuela@example.com",
      code: "410233",
    });

    expect(created.isFirstSignIn).toBe(true);
    expect(created.settings.shoeboxName).toBe("My Shoebox");
  });
});

describe("deleteSession", () => {
  it("accepts the 204 the route answers even on a dead cookie", async () => {
    _respondWith(undefined, 204);

    await expect(deleteSession()).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledWith(
      "/api/auth/session",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});
```

Create `apps/web/src/api/me.test.ts`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { meQueryOptions, revokeMySession, updateMe } from "@/api/me/me";

const ME_BODY = {
  me: {
    member: {
      memberId: "018f0000-0000-7000-8000-000000000000",
      displayName: "Abuela",
    },
    storedDisplayName: null,
    email: "abuela@example.com",
    role: "admin",
    notify: { onUpload: true, onComment: true, onReply: true, onRemoval: true },
    joinedAt: "2026-09-28T10:00:00.000Z",
    lastSignedInAt: "2026-09-28T10:00:00.000Z",
  },
  settings: {
    shoeboxName: "My Shoebox",
    pileArrangement: "messy",
    timezone: "Europe/Madrid",
  },
};

function _respondWith(body: unknown, status: number): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      return new Response(status === 204 ? null : JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("meQueryOptions", () => {
  it("resolves the account when somebody is signed in", async () => {
    _respondWith(ME_BODY, 200);

    await expect(meQueryOptions.queryFn()).resolves.toMatchObject({
      me: { email: "abuela@example.com" },
    });
  });

  it("resolves undefined on a 401 rather than throwing, so the guard can redirect", async () => {
    _respondWith({ error: "not_signed_in", message: "No live session." }, 401);

    await expect(meQueryOptions.queryFn()).resolves.toBeUndefined();
  });

  it("still throws on any other failure, which is not an answer", async () => {
    _respondWith({ error: "internal_error", message: "Boom." }, 500);

    await expect(meQueryOptions.queryFn()).rejects.toThrow();
  });
});

describe("updateMe", () => {
  it("patches only what it was given", async () => {
    _respondWith(ME_BODY, 200);

    await updateMe({ displayName: "Abuela Rosa" });

    expect(fetch).toHaveBeenCalledWith(
      "/api/me",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ displayName: "Abuela Rosa" }),
      }),
    );
  });
});

describe("revokeMySession", () => {
  it("deletes the device by its own id", async () => {
    _respondWith(undefined, 204);

    await revokeMySession("018f0000-0000-7000-8000-000000000001");

    expect(fetch).toHaveBeenCalledWith(
      "/api/me/sessions/018f0000-0000-7000-8000-000000000001",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});
```

`meQueryOptions.queryFn()` is called with no argument here, which TypeScript
permits because the query function ignores its context. If the installed types
insist on one, call it as
`meQueryOptions.queryFn({} as Parameters<typeof meQueryOptions.queryFn>[0])`
and say why in a comment.

- [ ] **Step 2: Run them and watch them fail**

```bash
pnpm --filter @memory-shoebox/web test
```

Expected: both files fail to resolve `@/api/auth` and `@/api/me`.

- [ ] **Step 3: Write `api/publicSettings.ts`**

```ts
import {
  publicSettingsResponseSchema,
  type PublicSettingsResponse,
} from "@memory-shoebox/shared";
import { queryOptions } from "@tanstack/react-query";
import { apiFetch } from "@/api/client/client";

/**
 * Query for `GET /api/public-settings`.
 *
 * The one route an anonymous caller may reach, and it exists for exactly one
 * reason: surface 1 renders the Shoebox's name before anybody is signed in.
 * It is a fingerprint of the instance rather than a membership oracle, and it
 * serves only keys carrying `isPubliclyReadable` (`auth.md` Ruling 1).
 *
 * A signed-in member needs a different answer and gets it elsewhere:
 * `pile.arrangement` and `shoebox.timezone` ride on the session bootstrap,
 * never on a second anonymous read.
 */
export const publicSettingsQueryOptions = queryOptions({
  queryKey: ["public-settings"],
  queryFn: (): Promise<PublicSettingsResponse> => {
    return apiFetch({
      path: "/public-settings",
      schema: publicSettingsResponseSchema,
    });
  },
  staleTime: Infinity,
});
```

- [ ] **Step 4: Write `api/auth.ts`**

```ts
import {
  createSessionResponseSchema,
  requestSignInCodeResponseSchema,
  type CreateSessionRequest,
  type CreateSessionResponse,
  type RequestSignInCodeResponse,
} from "@memory-shoebox/shared";
import { z } from "zod";
import { apiFetch } from "@/api/client/client";

/** A POST carrying JSON, which every write in this slice is. */
function _postJson(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

/**
 * Asks for a six-digit code at an address.
 *
 * **`isResend` picks the route rather than setting a flag on one.** The server
 * behaves identically either way, deliberately: a route that behaved
 * differently depending on whether a code was already outstanding would leak
 * that fact. The split exists so this client's state machine can tell "Send
 * another", which says plainly that the old code has stopped working, from a
 * first request (`auth.md`).
 *
 * Both routes share one per-address budget of five an hour, so a resend is not
 * a way round the cap.
 */
export function requestSignInCode(options: {
  email: string;
  isResend: boolean;
}): Promise<RequestSignInCodeResponse> {
  return apiFetch({
    path: options.isResend
      ? "/auth/sign-in-codes/resend"
      : "/auth/sign-in-codes",
    schema: requestSignInCodeResponseSchema,
    init: _postJson({ email: options.email }),
  });
}

/**
 * Redeems a code into a session, which sets the cookie.
 *
 * The destination a `link`-state sign-in was heading for is not sent and never
 * reaches the server: the client keeps it and navigates there after the `201`.
 */
export function createSession(
  body: CreateSessionRequest,
): Promise<CreateSessionResponse> {
  return apiFetch({
    path: "/auth/session",
    schema: createSessionResponseSchema,
    init: _postJson(body),
  });
}

/**
 * Signs out the device making the request.
 *
 * **It cannot fail on a dead cookie.** An absent, expired or already-dead
 * session answers `204` with the clearing header rather than `401`, because a
 * person pressing sign out and being told they are not signed in has been
 * failed by the software rather than informed by it (`conventions.md` § The
 * auth middleware).
 */
export function deleteSession(): Promise<void> {
  return apiFetch({
    path: "/auth/session",
    schema: z.void(),
    init: { method: "DELETE" },
  });
}
```

- [ ] **Step 5: Write `api/me.ts`**

```ts
import {
  listMySessionsResponseSchema,
  meResponseSchema,
  type ListMySessionsResponse,
  type MeResponse,
  type UpdateMeRequest,
} from "@memory-shoebox/shared";
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { ApiRequestError, apiFetch } from "@/api/client/client";

/** Who is signed in. The guard and My account read this one entry. */
export const ME_QUERY_KEY = ["me"] as const;

/** This member's live devices. Its own entry, because it is its own route. */
export const MY_SESSIONS_QUERY_KEY = ["me", "sessions"] as const;

/**
 * Query for `GET /api/me`, answering `undefined` when nobody is signed in.
 *
 * **The catch is load-bearing.** The route answers `401 not_signed_in` and
 * `apiFetch` turns that into a thrown `ApiRequestError`. A rejected query in a
 * route's `beforeLoad` surfaces as a route error rather than as the guard's
 * redirect, so the one refusal that is really an answer is turned back into a
 * value here. Every other failure still throws, because every other failure is
 * a fault rather than an answer.
 */
export const meQueryOptions = queryOptions({
  queryKey: ME_QUERY_KEY,
  queryFn: async (): Promise<MeResponse | undefined> => {
    try {
      return await apiFetch({ path: "/me", schema: meResponseSchema });
    } catch (error: unknown) {
      if (error instanceof ApiRequestError && error.code === "not_signed_in") {
        return undefined;
      }
      throw error;
    }
  },
  staleTime: Infinity,
});

/**
 * Corrects the display name, or sets all four notification switches.
 *
 * Every field is optional and an omitted one is left alone, but `notify` is
 * all four or none: requiring them together is what keeps a partial write from
 * looking like the "turn them all off" the button sends. There is no fifth
 * switch, no `notifyAll` column and no bulk route (Decision 16).
 *
 * `email` and `role` are not writable here or anywhere, and a request carrying
 * either is rejected rather than ignored, so a client bug surfaces at once.
 */
export function updateMe(body: UpdateMeRequest): Promise<MeResponse> {
  return apiFetch({
    path: "/me",
    schema: meResponseSchema,
    init: {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  });
}

/**
 * Query for `GET /api/me/sessions`: this member's live devices, newest use
 * first.
 *
 * `nextCursor` is always null, because a member holds a handful of devices
 * bounded by the 30-day expiry. `isCurrent` is computed at the boundary from
 * the requesting session and is what the surface turns into "this one".
 */
export const mySessionsQueryOptions = queryOptions({
  queryKey: MY_SESSIONS_QUERY_KEY,
  queryFn: (): Promise<ListMySessionsResponse> => {
    return apiFetch({
      path: "/me/sessions",
      schema: listMySessionsResponseSchema,
    });
  },
});

/**
 * Signs one of this member's own devices out.
 *
 * It stops working immediately, wherever it is, because the middleware looks
 * the session up in the database on every request. That is the promise the
 * Account banner makes about a lost or handed-down phone.
 *
 * A `404 session_not_found` means the row is not there **or is not theirs**,
 * which are deliberately the same answer: a `403` would confirm that a session
 * exists at that id.
 */
export function revokeMySession(sessionId: string): Promise<void> {
  return apiFetch({
    path: `/me/sessions/${encodeURIComponent(sessionId)}`,
    schema: z.void(),
    init: { method: "DELETE" },
  });
}
```

- [ ] **Step 6: Run the tests and watch them pass**

```bash
pnpm --filter @memory-shoebox/web test
```

Expected: every test in `auth.test.ts` and `me.test.ts` passes.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/api
git commit -m "feat(web): the auth, account and public-settings calls"
```

---

## Task 4: The real viewer, and the shell's real name

**Files:**

- Modify: `apps/web/src/session/requireViewer/requireViewer.ts`
- Modify: `apps/web/src/session/requireViewer/requireViewer.test.ts`
- Modify: `apps/web/src/routes/_app.tsx`

**Why:** Step 3b left one seam, a `PLACEHOLDER_VIEWER` constant with a
docstring naming exactly what replaces it. This is that replacement.

**One deviation from what step 3b predicted, and it is deliberate.** That
docstring says the query function is rewritten "and nothing else moves". It
was written before `MeResponse` was known to carry the three shell settings
alongside the account. Narrowing `MeResponse | undefined` to a viewer **and** a
settings block in two separate places would mean either a cast or a dead
branch, so `requireViewer` now takes the response and returns both. That is one
narrowing point, no cast, and no unreachable code. Record it in the docstring.

**Context you need:** `MemberRole` in `@/system/memberRole` is structurally the
same union as the one in `@memory-shoebox/shared`, so a role off the wire
assigns to it. `ShellSettings` is exported from `@memory-shoebox/shared`. The
existing test pins an important detail: `redirect()` in TanStack Router 1.170
returns a `Response` carrying the options under `.options`, not a plain object.

- [ ] **Step 1: Rewrite the test first**

Replace the whole body of `requireViewer.test.ts`:

```tsx
import type { MeResponse } from "@memory-shoebox/shared";
import { describe, expect, it } from "vitest";
import {
  makeViewerFromMeResponse,
  requireViewer,
} from "@/session/requireViewer/requireViewer";

const ME: MeResponse = {
  me: {
    member: {
      memberId: "018f0000-0000-7000-8000-000000000000",
      displayName: "Papá",
    },
    storedDisplayName: "Papá",
    email: "papa@example.com",
    role: "admin",
    notify: {
      onUpload: true,
      onComment: true,
      onReply: true,
      onRemoval: true,
    },
    joinedAt: "2026-09-01T10:00:00.000Z",
    lastSignedInAt: "2026-09-28T10:00:00.000Z",
  },
  settings: {
    shoeboxName: "My Shoebox",
    pileArrangement: "messy",
    timezone: "Europe/Madrid",
  },
};

describe("makeViewerFromMeResponse", () => {
  it("keeps only what the browser needs to know about who is looking", () => {
    expect(makeViewerFromMeResponse(ME)).toEqual({
      memberId: "018f0000-0000-7000-8000-000000000000",
      displayName: "Papá",
      role: "admin",
      isAdmin: true,
    });
  });

  it("does not make a viewer an admin", () => {
    const viewer = makeViewerFromMeResponse({
      ...ME,
      me: { ...ME.me, role: "viewer" },
    });

    expect(viewer.isAdmin).toBe(false);
  });
});

describe("requireViewer", () => {
  it("passes a signed-in member through with the shell's settings", () => {
    const signedIn = requireViewer({ me: ME, attemptedHref: "/items/abc" });

    expect(signedIn.viewer.displayName).toBe("Papá");
    expect(signedIn.settings.shoeboxName).toBe("My Shoebox");
  });

  it("redirects to sign in, carrying where they were going", () => {
    let thrown: unknown;
    try {
      requireViewer({ me: undefined, attemptedHref: "/items/abc" });
    } catch (error: unknown) {
      thrown = error;
    }

    // `redirect()` in the installed TanStack Router (1.170.x) returns a
    // `Response` carrying the navigation options under `.options`, not a
    // plain object with `to`/`search` at the top level.
    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response & { options: unknown }).options).toMatchObject({
      to: "/sign-in",
      search: { redirect: "/items/abc" },
    });
  });

  it("does not carry a redirect back to the pile, which is the default", () => {
    let thrown: unknown;
    try {
      requireViewer({ me: undefined, attemptedHref: "/" });
    } catch (error: unknown) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response & { options: unknown }).options).toMatchObject({
      to: "/sign-in",
      search: {},
    });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm --filter @memory-shoebox/web test requireViewer
```

Expected: `makeViewerFromMeResponse` is not exported.

- [ ] **Step 3: Rewrite `requireViewer.ts`**

Keep the `Viewer` docstring as it stands. Delete `PLACEHOLDER_VIEWER` and
`viewerQueryOptions` entirely; the query now lives in `@/api/me`. The file
becomes:

```ts
import { redirect } from "@tanstack/react-router";
import type { MeResponse, ShellSettings } from "@memory-shoebox/shared";
import type { MemberRole } from "@/system/memberRole";

/**
 * Who is looking.
 *
 * [keep the existing docstring here, unchanged]
 */
export type Viewer = Readonly<{
  memberId: string;
  displayName: string;
  role: MemberRole;
  isAdmin: boolean;
}>;

/**
 * What a signed-in route context holds: who is looking, and the three
 * instance settings the shell needs the moment it draws.
 *
 * The settings ride on `GET /api/me` rather than a second fetch, so a reload
 * has the same three values a fresh sign-in does (`auth.md` Ruling 1).
 */
export type SignedIn = Readonly<{
  viewer: Viewer;
  settings: ShellSettings;
}>;

/**
 * Narrows the account response to what the browser needs about the viewer.
 *
 * Deliberately lossy. The response carries an email address, four
 * notification switches and two timestamps, none of which is anybody's
 * business outside My account, and a `Viewer` handed down through every route
 * context would carry them everywhere.
 */
export function makeViewerFromMeResponse(me: MeResponse): Viewer {
  return {
    memberId: me.me.member.memberId,
    displayName: me.me.member.displayName,
    role: me.me.role,
    isAdmin: me.me.role === "admin",
  };
}

/**
 * The guard, and the whole of it.
 *
 * A URL in this product is an address rather than a credential, so an
 * unauthenticated request for one leads to the sign-in screen and then back to
 * where it was going (`PRODUCT.md` § Sharing). The pile is where sign-in lands
 * anyway, so a redirect to it is left off the search parameters rather than
 * written out.
 *
 * **It takes the whole response rather than a viewer**, which is a change from
 * what step 3b predicted. `MeResponse` carries the shell's settings beside the
 * account, and narrowing `MeResponse | undefined` in two places would mean
 * either a cast or a branch that cannot be reached. One narrowing point here
 * gives both callers a value that is certainly present.
 *
 * @throws A TanStack Router redirect when nobody is signed in.
 */
export function requireViewer(options: {
  me: MeResponse | undefined;
  attemptedHref: string;
}): SignedIn {
  const { me, attemptedHref } = options;
  if (me === undefined) {
    throw redirect({
      to: "/sign-in",
      search: attemptedHref === "/" ? {} : { redirect: attemptedHref },
    });
  }
  return { viewer: makeViewerFromMeResponse(me), settings: me.settings };
}
```

- [ ] **Step 4: Rewire `_app.tsx`**

Replace the import and the `beforeLoad`, and take the name off the settings:

```tsx
import { createFileRoute, Outlet, useMatches } from "@tanstack/react-router";
import { meQueryOptions } from "@/api/me/me";
import { requireViewer } from "@/session/requireViewer/requireViewer";
import { ProductBar } from "@/system/ProductBar/ProductBar";

export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ context, location }) => {
    // `query` rather than the deprecated `ensureQueryData`, with the account
    // pinned static: the guard runs on every navigation and must not ask who
    // is looking on each one.
    const me = await context.queryClient.query({
      ...meQueryOptions,
      staleTime: "static",
    });
    return requireViewer({ me, attemptedHref: location.href });
  },
  component: AppShell,
});
```

In `AppShell`, read both and drop the placeholder name and detail:

```tsx
const { viewer, settings } = Route.useRouteContext();
```

```tsx
<ProductBar
  shoeboxName={settings.shoeboxName}
  memberName={viewer.displayName}
  role={viewer.role}
/>
```

Delete the `detail="The counts arrive with the timeline, in step 5b"` prop and
update the component's docstring: the Shoebox name is no longer hardcoded here,
it comes from the account response, and `sign-in.tsx` reads its own from
`GET /api/public-settings`.

- [ ] **Step 5: Give `rendering.test.tsx` a server to talk to**

**This is the step that will surprise you.** `apps/web/src/routes/rendering.test.tsx`
navigates to all fourteen surfaces, thirteen of which now run the guard, and
the guard now fetches. jsdom has no `fetch` worth the name, so every guarded
route will throw before it renders. `routes.test.tsx` is safe: it reads the
directory and touches no router.

Add a stub above `_renderAt`, and call it in a `beforeEach`:

```tsx
const ME = {
  me: {
    member: {
      memberId: "018f0000-0000-7000-8000-000000000000",
      displayName: "Papá",
    },
    storedDisplayName: "Papá",
    email: "papa@example.com",
    role: "admin",
    notify: {
      onUpload: true,
      onComment: true,
      onReply: true,
      onRemoval: true,
    },
    joinedAt: "2026-09-01T10:00:00.000Z",
    lastSignedInAt: "2026-09-28T10:00:00.000Z",
  },
  settings: {
    shoeboxName: "My Shoebox",
    pileArrangement: "messy",
    timezone: "Europe/Madrid",
  },
};

/**
 * Somebody signed in, and a Shoebox with a name.
 *
 * Every guarded surface runs the guard, and the guard asks the server who is
 * looking, so a test that navigates to one is a test that makes a request.
 */
function _signedIn(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string) => {
      const body =
        path === "/api/public-settings"
          ? { shoeboxName: "My Shoebox", baseUrl: "http://localhost:5173" }
          : path === "/api/me/sessions"
            ? { sessions: [], nextCursor: null }
            : path === "/api/health"
              ? { status: "ok", version: "0.0.0", uptimeSeconds: 1 }
              : ME;
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
}
```

Update two entries in the `SURFACES` table, because two ledes change in this
step and the next: `/sign-in` becomes `"Sign in to My Shoebox."` now, and
`/account` becomes `"Papá, in My Shoebox."` in Task 10. Change `/sign-in` here
and leave a comment on the `/account` row saying Task 10 changes it.

- [ ] **Step 6: Run the whole web suite**

```bash
pnpm --filter @memory-shoebox/web test
```

Expected: green, including all fourteen surfaces.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/session apps/web/src/routes/_app.tsx apps/web/src/routes/rendering.test.tsx
git commit -m "feat(web): the guard asks the server who is looking"
```

---

## Task 5: Every string surface 1 can show

**Files:**

- Create: `apps/web/src/surfaces/SignIn/signInCopy.ts`
- Create: `apps/web/src/surfaces/SignIn/signInCopy.test.ts`
- Create: `apps/web/src/surfaces/SignIn/makeSafeHrefFromRedirect.ts`
- Create: `apps/web/src/surfaces/SignIn/makeSafeHrefFromRedirect.test.ts`

**Why:** `conventions.md` § Errors says `message` off the wire is English for a
log and **never the primary UI copy**, so every code has to become a sentence
somewhere. Here, in pure functions, where each one can be tested without
rendering anything.

**Note there are six states, not seven.** `unknown` is not one of them: a `202`
renders one thing, and the conditional wording is that thing. See decision 2 of
the step design.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/surfaces/SignIn/signInCopy.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ApiRequestError } from "@/api/client/client";
import {
  signInFailure,
  signInLede,
} from "@/surfaces/SignIn/signInCopy/signInCopy";

/** One refusal off the wire, as `apiFetch` would have thrown it. */
function _refusal(options: {
  status: number;
  code: string;
  details?: Record<string, unknown>;
}): ApiRequestError {
  return new ApiRequestError({
    status: options.status,
    code: options.code,
    message: "English, for a log.",
    details: options.details,
  });
}

describe("signInLede", () => {
  it("names the Shoebox before anybody has asked for a code", () => {
    expect(signInLede({ state: "email", shoeboxName: "My Shoebox" })).toBe(
      "Sign in to My Shoebox.",
    );
  });

  it("says somebody sent a link, without saying who or what", () => {
    expect(signInLede({ state: "link", shoeboxName: "My Shoebox" })).toBe(
      "Somebody sent you a link into My Shoebox.",
    );
  });

  it("points at the inbox once a code is on its way", () => {
    for (const state of ["sent", "wrong", "expired", "resent"] as const) {
      expect(signInLede({ state, shoeboxName: "My Shoebox" })).toBe(
        "Check your email.",
      );
    }
  });
});

describe("signInFailure", () => {
  it("counts the tries down in words, from the response and not a constant", () => {
    const failure = signInFailure({
      error: _refusal({
        status: 401,
        code: "sign_in_code_invalid",
        details: { attemptsRemaining: 2 },
      }),
      action: "redeem",
    });

    expect(failure).toEqual({
      field: "code",
      message:
        "That is not the code in the email. Two tries left before we send you a new one.",
      nextState: "wrong",
    });
  });

  it("uses the singular on the last try", () => {
    const failure = signInFailure({
      error: _refusal({
        status: 401,
        code: "sign_in_code_invalid",
        details: { attemptsRemaining: 1 },
      }),
      action: "redeem",
    });

    expect(failure.message).toBe(
      "That is not the code in the email. One try left before we send you a new one.",
    );
  });

  it("says what expired, how long they last, and which email to use", () => {
    const failure = signInFailure({
      error: _refusal({ status: 410, code: "sign_in_code_expired" }),
      action: "redeem",
    });

    expect(failure).toEqual({
      field: "code",
      message:
        "That code has expired. They last ten minutes. Send another and use the newest email.",
      nextState: "expired",
    });
  });

  it("promises the new code the server has already sent", () => {
    const failure = signInFailure({
      error: _refusal({
        status: 410,
        code: "sign_in_code_attempts_exhausted",
      }),
      action: "redeem",
    });

    expect(failure).toEqual({
      field: "code",
      message:
        "That was the last try, so that code has stopped working. A new one is on its way.",
      nextState: "resent",
    });
  });

  it("turns a rate limit into minutes, differently for each route", () => {
    expect(
      signInFailure({
        error: _refusal({
          status: 429,
          code: "rate_limited",
          details: { retryAfterSeconds: 1800 },
        }),
        action: "mint",
      }),
    ).toEqual({
      field: "form",
      message:
        "Wait 30 minutes, then ask for another. A code that has already arrived still works for ten minutes from when it was sent.",
      nextState: undefined,
    });

    expect(
      signInFailure({
        error: _refusal({
          status: 429,
          code: "rate_limited",
          details: { retryAfterSeconds: 60 },
        }),
        action: "redeem",
      }).message,
    ).toBe("Too many tries. Wait 1 minute and try the code again.");
  });

  it("rounds a part minute up, because waiting less than told is worse", () => {
    expect(
      signInFailure({
        error: _refusal({
          status: 429,
          code: "rate_limited",
          details: { retryAfterSeconds: 61 },
        }),
        action: "redeem",
      }).message,
    ).toBe("Too many tries. Wait 2 minutes and try the code again.");
  });

  it("puts a validation failure on the field it is about", () => {
    expect(
      signInFailure({
        error: _refusal({
          status: 400,
          code: "invalid_request",
          details: { fieldErrors: { email: ["Invalid email"] } },
        }),
        action: "mint",
      }),
    ).toEqual({
      field: "email",
      message: "That does not look like an email address.",
      nextState: undefined,
    });

    expect(
      signInFailure({
        error: _refusal({
          status: 400,
          code: "invalid_request",
          details: { fieldErrors: { code: ["Not six digits"] } },
        }),
        action: "redeem",
      }).message,
    ).toBe("The code is six digits.");
  });

  it("blames our end for anything it does not recognise, never the address", () => {
    for (const error of [
      _refusal({ status: 500, code: "internal_error" }),
      new TypeError("Failed to fetch"),
    ]) {
      expect(signInFailure({ error, action: "mint" })).toEqual({
        field: "form",
        message: "Something went wrong at our end. Try again in a moment.",
        nextState: undefined,
      });
    }
  });
});
```

Create `apps/web/src/surfaces/SignIn/makeSafeHrefFromRedirect.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { makeSafeHrefFromRedirect } from "@/surfaces/SignIn/makeSafeHrefFromRedirect/makeSafeHrefFromRedirect";

describe("makeSafeHrefFromRedirect", () => {
  it("returns a path on this origin unchanged", () => {
    expect(makeSafeHrefFromRedirect("/items/abc?find=true")).toBe(
      "/items/abc?find=true",
    );
  });

  it("lands on the pile when there is nowhere to go back to", () => {
    expect(makeSafeHrefFromRedirect(undefined)).toBe("/");
  });

  it("refuses anywhere but this origin", () => {
    for (const hostile of [
      "//evil.example.com",
      "https://evil.example.com/items",
      "javascript:alert(1)",
      "items/abc",
    ]) {
      expect(makeSafeHrefFromRedirect(hostile)).toBe("/");
    }
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

```bash
pnpm --filter @memory-shoebox/web test SignIn
```

Expected: neither module resolves.

- [ ] **Step 3: Write `signInCopy.ts`**

```ts
import { ApiRequestError } from "@/api/client/client";

/**
 * The states surface 1 can be in.
 *
 * **Six, not the seven the design spec's surface table lists.** `unknown` is
 * not one: `POST /api/auth/sign-in-codes` answers the same `202` for a member
 * and for an address nobody has heard of, so the client cannot compute the
 * difference and must never appear to. The conditional wording below is the
 * only correct copy for every outcome of that route (`auth.md`, "The copy
 * correction this route forces").
 */
export type SignInState =
  | "link"
  | "email"
  | "sent"
  | "wrong"
  | "expired"
  | "resent";

/** Which field a refusal belongs under, or the form when it belongs to none. */
export type SignInFailureField = "email" | "code" | "form";

/** One refusal, as the surface shows it. */
export type SignInFailure = {
  field: SignInFailureField;
  /** The sentence somebody reads. Never the envelope's English `message`. */
  message: string;
  /** The state this failure moves the surface to, when it moves it. */
  nextState: SignInState | undefined;
};

/** The line at the top of the card. */
export function signInLede(options: {
  state: SignInState;
  shoeboxName: string;
}): string {
  switch (options.state) {
    case "email":
      return `Sign in to ${options.shoeboxName}.`;
    case "link":
      return `Somebody sent you a link into ${options.shoeboxName}.`;
    default:
      return "Check your email.";
  }
}

/**
 * "One try" or "Two tries", in words, the way the mockup says it.
 *
 * The number comes off the response and never from a constant: the server
 * reads it off the row **after** the increment, so three tries means the first
 * wrong code gives two.
 */
function _triesLeft(attemptsRemaining: number): string {
  if (attemptsRemaining === 1) {
    return "One try left";
  }
  if (attemptsRemaining === 2) {
    return "Two tries left";
  }
  return `${attemptsRemaining} tries left`;
}

/**
 * Whole minutes, rounded up and never below one.
 *
 * Up rather than down because telling somebody to wait less than they must is
 * worse than telling them to wait a little more: they try again, they are
 * refused again, and the interface has lied to them once.
 */
function _minutes(retryAfterSeconds: number | undefined): string {
  const minutes = Math.max(1, Math.ceil((retryAfterSeconds ?? 60) / 60));
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}

/** Whatever is wrong when nothing more specific is known. */
const OUR_FAULT: SignInFailure = {
  field: "form",
  message: "Something went wrong at our end. Try again in a moment.",
  nextState: undefined,
};

/** The validation failure, put under whichever field it is about. */
function _invalidRequest(error: ApiRequestError): SignInFailure {
  const fieldErrors = error.details?.fieldErrors ?? {};
  if (fieldErrors.email !== undefined) {
    return {
      field: "email",
      message: "That does not look like an email address.",
      nextState: undefined,
    };
  }
  if (fieldErrors.code !== undefined) {
    return {
      field: "code",
      message: "The code is six digits.",
      nextState: undefined,
    };
  }
  return OUR_FAULT;
}

/**
 * Turns a refusal into the sentence somebody reads.
 *
 * **Nothing here can mention membership**, because nothing here knows it.
 * Every one of these is reached identically by a member and by an address
 * nobody has ever heard of: the unknown address has a real row with a real
 * hash, so it counts down from three tries and expires after ten minutes
 * exactly as a member's does.
 *
 * @param options.error Whatever was thrown: an `ApiRequestError`, or a
 *   dropped call, which is not one.
 * @param options.action Which call failed. A rate limit means different things
 *   on the two, so it reads differently.
 */
export function signInFailure(options: {
  error: unknown;
  action: "mint" | "redeem";
}): SignInFailure {
  const { error, action } = options;
  if (!(error instanceof ApiRequestError)) {
    return OUR_FAULT;
  }

  switch (error.code) {
    case "sign_in_code_invalid":
      return {
        field: "code",
        message: `That is not the code in the email. ${_triesLeft(
          error.details?.attemptsRemaining ?? 1,
        )} before we send you a new one.`,
        nextState: "wrong",
      };

    case "sign_in_code_expired":
      return {
        field: "code",
        message:
          "That code has expired. They last ten minutes. Send another and use the newest email.",
        nextState: "expired",
      };

    case "sign_in_code_attempts_exhausted":
      return {
        field: "code",
        message:
          "That was the last try, so that code has stopped working. A new one is on its way.",
        nextState: "resent",
      };

    case "rate_limited":
      return action === "mint"
        ? {
            field: "form",
            message: `Wait ${_minutes(
              error.details?.retryAfterSeconds,
            )}, then ask for another. A code that has already arrived still works for ten minutes from when it was sent.`,
            nextState: undefined,
          }
        : {
            field: "code",
            message: `Too many tries. Wait ${_minutes(
              error.details?.retryAfterSeconds,
            )} and try the code again.`,
            nextState: undefined,
          };

    case "invalid_request":
      return _invalidRequest(error);

    default:
      return OUR_FAULT;
  }
}
```

- [ ] **Step 4: Write `makeSafeHrefFromRedirect.ts`**

```ts
/**
 * Where to land after a sign-in, refusing anywhere but this origin.
 *
 * `redirect` comes off the URL, so it is whatever somebody put there, and this
 * form is reached by people opening links other people sent them. A value
 * beginning `//`, or naming a scheme, is an open redirect dressed up as a deep
 * link: sign in here, land somewhere else, and the somewhere else looks like
 * it was part of signing in.
 *
 * Anything that is not a plain path on this origin falls back to the pile,
 * which is where sign-in lands anyway, so the failure mode is a person seeing
 * their photographs rather than an error.
 *
 * @param redirect The `redirect` search parameter, if there was one.
 * @returns A path on this origin, always.
 */
export function makeSafeHrefFromRedirect(redirect: string | undefined): string {
  return redirect !== undefined &&
    redirect.startsWith("/") &&
    !redirect.startsWith("//")
    ? redirect
    : "/";
}
```

- [ ] **Step 5: Run them and watch them pass**

```bash
pnpm --filter @memory-shoebox/web test SignIn
```

Expected: every case green.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/surfaces/SignIn
git commit -m "feat(web): every sentence surface 1 can say, including the failures"
```

---

## Task 6: The one-time first sign-in flag

**Files:**

- Create: `apps/web/src/session/firstSignIn/firstSignIn.ts`
- Create: `apps/web/src/session/firstSignIn/firstSignIn.test.ts`
- Modify: `apps/web/src/routes/_app/index.tsx`

**Why:** `isFirstSignIn` arrives on the `201` and carries no number,
deliberately. The number in that sentence is viewer-filtered and belongs to the
timeline response, which is step 4a's and is not merged. This step owns
carrying the flag and nothing else, and **the sentence is incomplete until 4a
lands**: render the half that is honest rather than inventing a count.

A module rather than the query cache, because this is not a server fact and
nothing should be able to refetch it. Not `sessionStorage` either: the line is
one-time, and a line that survives a reload is not.

- [ ] **Step 1: Write the failing test**

```ts
import { beforeEach, describe, expect, it } from "vitest";
import {
  setFirstSignIn,
  takeFirstSignIn,
} from "@/session/firstSignIn/firstSignIn";

beforeEach(() => {
  takeFirstSignIn();
});

describe("the first sign-in flag", () => {
  it("is not set by default", () => {
    expect(takeFirstSignIn()).toBe(false);
  });

  it("is readable exactly once", () => {
    setFirstSignIn(true);

    expect(takeFirstSignIn()).toBe(true);
    expect(takeFirstSignIn()).toBe(false);
  });

  it("stays unset when somebody has signed in before", () => {
    setFirstSignIn(false);

    expect(takeFirstSignIn()).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm --filter @memory-shoebox/web test firstSignIn
```

- [ ] **Step 3: Write the module**

```ts
/**
 * Whether the member who just signed in had never signed in before.
 *
 * Module state, and that is the design rather than a shortcut. It is not a
 * server fact, so it does not belong in the query cache where something could
 * refetch it, and it is not durable, so it does not belong in `sessionStorage`
 * where a reload would bring it back. The line it drives is shown once, on the
 * way in from a redemption, and never again.
 */
let _isFirstSignIn = false;

/**
 * Records what `POST /api/auth/session` answered.
 *
 * @param isFirstSignIn `isFirstSignIn` off the `201`.
 */
export function setFirstSignIn(isFirstSignIn: boolean): void {
  _isFirstSignIn = isFirstSignIn;
}

/**
 * Reads the flag and clears it, so the line cannot be shown twice.
 *
 * @returns True on the one render after a first sign-in.
 */
export function takeFirstSignIn(): boolean {
  const wasFirstSignIn = _isFirstSignIn;
  _isFirstSignIn = false;
  return wasFirstSignIn;
}
```

- [ ] **Step 4: Show the half of the line that is honest**

In `apps/web/src/routes/_app/index.tsx`, inside `TimelinePage`, above the
existing `Lede`:

```tsx
function TimelinePage() {
  // Read once per mount, and cleared by the read: the line is one-time.
  const [isFirstSignIn] = useState(takeFirstSignIn);

  return (
    <Page wide>
      {isFirstSignIn ? (
        <Banner icon={<IconPhoto {...ICON_PROPS} />}>
          <b>Welcome in.</b> Everything already here is yours to look through,
          and nothing is marked new, because none of it arrived since you
          joined. The count that finishes this sentence comes from the timeline,
          which is built in step 4a.
        </Banner>
      ) : null}
      <Lede>The timeline.</Lede>
      <Prose onPanel>
        Surfaces 2, 5 and 6. Built in step 5b, against the timeline step 4a
        delivers.
      </Prose>
    </Page>
  );
}
```

Add the imports: `useState` from `react`, `takeFirstSignIn` from
`@/session/firstSignIn/firstSignIn`, `Banner` from `@/system/Chrome/Banner`,
`ICON_PROPS` from `@/system/icons`, and `IconPhoto` from
`@tabler/icons-react`.

**Leave the last sentence in.** It says out loud that the number is missing and
where it comes from, which is better than a sentence that reads as finished and
is not. Step 5b deletes it along with the placeholder.

- [ ] **Step 5: Run the suite**

```bash
pnpm --filter @memory-shoebox/web test
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/session/firstSignIn apps/web/src/routes/_app/index.tsx
git commit -m "feat(web): carry the first sign-in line from the redemption"
```

---

## Task 7: Surface 1

**Files:**

- Create: `apps/web/src/surfaces/SignIn/CodeField.tsx`
- Create: `apps/web/src/surfaces/SignIn/SignInBody.tsx`
- Create: `apps/web/src/surfaces/SignIn/SignInCard/SignInCard.tsx`
- Create: `apps/web/src/surfaces/SignIn/SignInCard/SignInCard.test.tsx`
- Modify: `apps/web/src/routes/sign-in.tsx`

**Context you need:** the prototype at `reference/src/surfaces/SignIn.tsx`
(corrected in Task 1) is the reference for the markup, and `pnpm
dev:reference` then `/s/sign-in?state=sent` is the reference for how it
should look. Read it. **Do not import from it**: `AGENTS.md` forbids anything
in `apps/` importing from `reference/`.

- [ ] **Step 1: Write `CodeField.tsx`**

```tsx
import { TextInput } from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { ICON_PROPS } from "@/system/icons";
import classes from "@/system/system.module.css";

type Props = {
  value: string;
  onChange: (value: string) => void;
  error: string | undefined;
};

/**
 * The code field.
 *
 * One wide field with tracked tabular figures rather than six separate boxes:
 * six boxes are fiddly to fill on a phone, they break paste, and they are the
 * sort of invented control this audience has to be taught.
 *
 * **The prototype's `maxLength={6}` is deliberately not carried across.** A
 * value pasted out of a mail client routinely arrives as "410 233", or with a
 * trailing space the client selected along with it, and `maxLength` truncates
 * that at the seventh character before anything can clean it up. Surviving a
 * paste is the reason this is one box rather than six, so the digits are
 * filtered and capped here instead, where the whitespace can be dropped first.
 */
export function CodeField({
  value,
  onChange,
  error,
}: Readonly<Props>): ReactNode {
  return (
    <TextInput
      label="The six digits we just emailed you"
      inputMode="numeric"
      autoComplete="one-time-code"
      value={value}
      onChange={(event) => {
        onChange(event.currentTarget.value.replace(/\D/g, "").slice(0, 6));
      }}
      error={
        error === undefined ? undefined : (
          <>
            <IconAlertCircle {...ICON_PROPS} />
            {error}
          </>
        )
      }
      classNames={{ input: classes.codeField }}
    />
  );
}
```

- [ ] **Step 2: Write `SignInBody.tsx`**

```tsx
import type { ReactNode } from "react";
import type { SignInState } from "@/surfaces/SignIn/signInState";
import { Prose } from "@/system/typography/Prose";

type Props = {
  state: SignInState;
  /** The address as typed, which is the only thing this copy is sure of. */
  email: string;
};

/**
 * The paragraph under the lede.
 *
 * **The conditional wording is not hedging.** `POST /api/auth/sign-in-codes`
 * answers the same `202` whether or not the address belongs to a member, so
 * "We sent a six-digit code to abuela@example.com" is a claim this surface
 * cannot make and must never be able to make: it would turn the form into a
 * way of finding out who is in the family (`auth.md`).
 */
export function SignInBody({ state, email }: Readonly<Props>): ReactNode {
  if (state === "link") {
    return (
      <Prose>
        Sign in and it opens on the one you were sent. Only people in this
        Shoebox can see inside, so the link on its own will not do it.
      </Prose>
    );
  }
  if (state === "email") {
    return (
      <Prose>
        We will email you a six-digit code. There is no password to remember and
        nothing to install.
      </Prose>
    );
  }
  if (state === "resent") {
    return (
      <Prose>
        If <b>{email}</b> is in this Shoebox, a new code is on its way there
        now. The old one has stopped working. It usually arrives in about a
        minute.
      </Prose>
    );
  }
  return (
    <Prose>
      If <b>{email}</b> is in this Shoebox, a six-digit code is on its way there
      now. It arrives in about a minute and it works for ten.
    </Prose>
  );
}
```

- [ ] **Step 3: Write `SignInCard.tsx`**

```tsx
import { Anchor, Button, Stack, TextInput } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useState, type FormEvent, type ReactNode } from "react";
import { createSession, requestSignInCode } from "@/api/auth/auth";
import { meQueryOptions } from "@/api/me/me";
import { publicSettingsQueryOptions } from "@/api/publicSettings/publicSettings";
import { setFirstSignIn } from "@/session/firstSignIn/firstSignIn";
import { CodeField } from "@/surfaces/SignIn/CodeField";
import { makeSafeHrefFromRedirect } from "@/surfaces/SignIn/makeSafeHrefFromRedirect/makeSafeHrefFromRedirect";
import { SignInBody } from "@/surfaces/SignIn/SignInBody";
import { type SignInState } from "@/surfaces/SignIn/signInState";
import {
  signInFailure,
  signInLede,
  type SignInFailure,
} from "@/surfaces/SignIn/signInCopy/signInCopy";
import { Card } from "@/system/Chrome/Card";
import { Centred } from "@/system/Chrome/Centred";
import { TopBar } from "@/system/Chrome/TopBar";
import { Lede } from "@/system/typography/Lede";
import { Prose } from "@/system/typography/Prose";

/**
 * What the bar says before the anonymous settings read has landed.
 *
 * A fallback rather than a spinner, deliberately: somebody who cannot see the
 * instance's name can still sign in, and somebody staring at a spinner cannot.
 */
const UNNAMED_SHOEBOX = "Shoebox";

/** Which state the surface opens in, from the URL alone. */
function getStateFromSearch(search: {
  redirect?: string;
  sent?: boolean;
}): SignInState {
  if (search.sent === true) {
    return "sent";
  }
  return search.redirect === undefined ? "email" : "link";
}

/**
 * Surface 1, live.
 *
 * **The state is in the URL, and that is not incidental.** Reload this page
 * mid-flow with the state in React alone and the address is gone, so the
 * person retypes it, presses the only button on the surface, and mints a
 * fresh code that stops the one already sitting in their inbox from working.
 * The URL survives a reload and a back button.
 *
 * There are six states and not the seven the design spec's table lists, for
 * the reason `signInCopy.ts` gives: `unknown` is not something this surface
 * can know.
 */
export function SignInCard(): ReactNode {
  const search = useSearch({ from: "/sign-in" });
  const navigate = useNavigate({ from: "/sign-in" });
  const queryClient = useQueryClient();

  const { data: publicSettings } = useQuery(publicSettingsQueryOptions);
  const shoeboxName = publicSettings?.shoeboxName ?? UNNAMED_SHOEBOX;

  const [email, setEmail] = useState(search.email ?? "");
  const [code, setCode] = useState("");
  const [failure, setFailure] = useState<SignInFailure | undefined>(undefined);
  const [state, setState] = useState<SignInState>(getStateFromSearch(search));

  const wantsCode = state !== "email" && state !== "link";

  const mint = useMutation({
    mutationFn: (variables: { isResend: boolean }) => {
      return requestSignInCode({ email, isResend: variables.isResend });
    },
    onSuccess: (_response, variables) => {
      setFailure(undefined);
      setCode("");
      setState(variables.isResend ? "resent" : "sent");
      // `replace`, so the back button leaves the flow rather than stepping
      // back inside it to a state whose code has already been superseded.
      void navigate({
        search: { ...search, email, sent: true },
        replace: true,
      });
    },
    onError: (error: unknown) => {
      setFailure(signInFailure({ error, action: "mint" }));
    },
  });

  const redeem = useMutation({
    mutationFn: () => {
      return createSession({ email, code });
    },
    onSuccess: (created) => {
      // The guard reads this entry on the very next navigation, so it is
      // written rather than invalidated: a refetch here would be a second
      // round trip for an answer already in hand.
      queryClient.setQueryData(meQueryOptions.queryKey, {
        me: created.me,
        settings: created.settings,
      });
      setFirstSignIn(created.isFirstSignIn);
      void navigate({
        href: makeSafeHrefFromRedirect(search.redirect),
        replace: true,
      });
    },
    onError: (error: unknown) => {
      const refusal = signInFailure({ error, action: "redeem" });
      setFailure(refusal);
      if (refusal.nextState !== undefined) {
        setState(refusal.nextState);
      }
      if (refusal.nextState === "resent") {
        // The server has already minted a replacement, so the digits in the
        // field are not just wrong, they are for a code that no longer exists.
        setCode("");
      }
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (wantsCode) {
      redeem.mutate();
    } else {
      mint.mutate({ isResend: false });
    }
  }

  const isBusy = mint.isPending || redeem.isPending;

  return (
    <>
      <TopBar title={shoeboxName} detail="Sign in" />
      <Centred>
        <Card>
          <Stack gap="sm">
            <Lede>{signInLede({ state, shoeboxName })}</Lede>
            <SignInBody state={state} email={email} />
          </Stack>

          <form onSubmit={handleSubmit}>
            <Stack gap="md" mt="lg">
              <TextInput
                label="Your email"
                type="email"
                autoComplete="email"
                inputMode="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => {
                  setEmail(event.currentTarget.value);
                }}
                error={failure?.field === "email" ? failure.message : undefined}
              />

              {wantsCode ? (
                <CodeField
                  value={code}
                  onChange={setCode}
                  error={
                    failure?.field === "code" ? failure.message : undefined
                  }
                />
              ) : null}

              {failure?.field === "form" ? (
                // Announced, because it sits outside every field's own
                // `aria-describedby` and a rate limit is the one refusal
                // somebody can do nothing about except read it.
                <Prose role="alert">{failure.message}</Prose>
              ) : null}

              <Button type="submit" loading={isBusy}>
                {wantsCode ? "Open the photos" : "Email me a code"}
              </Button>

              {wantsCode ? (
                <Prose>
                  No code?{" "}
                  <Anchor
                    component="button"
                    type="button"
                    onClick={() => {
                      mint.mutate({ isResend: true });
                    }}
                  >
                    Send another
                  </Anchor>
                  . Check the junk folder too: it comes from a machine, and
                  machines end up there.
                </Prose>
              ) : (
                <Prose>
                  Only people who have been invited can sign in. There is no way
                  to make an account here.
                </Prose>
              )}
            </Stack>
          </form>
        </Card>
      </Centred>
    </>
  );
}
```

If `Prose` does not accept a `role` prop, give it one by widening its props to
`ComponentPropsWithoutRef<"p">` in `@/system/typography/Prose`, which is a
one-line change and is how the rest of the system's typography is typed. Say so
in the commit message if you do it.

- [ ] **Step 4: Rewire the route**

`apps/web/src/routes/sign-in.tsx` becomes:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { SignInCard } from "@/surfaces/SignIn/SignInCard/SignInCard";

const searchSchema = z.object({
  /** Where to go once they are in. A link is an address, never a credential. */
  redirect: z.string().optional(),
  /**
   * The address, pre-filled.
   *
   * `z.string()` rather than `z.email()` on purpose. An invitation link
   * carries the address as a plain query parameter purely so the field
   * arrives filled in, and **nothing validates it before submission**
   * (Decision 2). A schema that rejected a malformed one would put the match
   * into error and show somebody a broken page instead of a form they could
   * correct.
   */
  email: z.string().optional(),
  /** Whether a code has been asked for, so the code field is shown. */
  sent: z.boolean().optional(),
});

export const Route = createFileRoute("/sign-in")({
  validateSearch: searchSchema,
  component: SignInCard,
});
```

- [ ] **Step 5: Write the surface's test**

Create `apps/web/src/surfaces/SignIn/SignInCard/SignInCard.test.tsx`. Render through the
real router the way `apps/web/src/routes/rendering.test.tsx` does, with
`createMemoryHistory({ initialEntries: [path] })`, and stub `fetch` per case.

```tsx
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { routeTree } from "@/routeTree.gen";
import { cssVariablesResolver } from "@/theme/cssVariablesResolver";
import { theme } from "@/theme/theme";

const PUBLIC_SETTINGS = {
  shoeboxName: "My Shoebox",
  baseUrl: "http://localhost:5173",
};

/**
 * Answers each path with whatever the case needs, and records the calls.
 *
 * A map rather than a sequence, because the surface fetches the Shoebox name
 * and posts the form in whatever order React gets round to.
 */
function _respondWith(
  routes: Record<string, { body: unknown; status: number }>,
): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string) => {
      const answer = routes[path] ?? { body: PUBLIC_SETTINGS, status: 200 };
      return new Response(
        answer.status === 204 ? null : JSON.stringify(answer.body),
        {
          status: answer.status,
          headers: { "content-type": "application/json" },
        },
      );
    }),
  );
}

function _renderAt(path: string) {
  const router = createRouter({
    routeTree,
    context: { queryClient: new QueryClient() },
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MantineProvider
        theme={theme}
        cssVariablesResolver={cssVariablesResolver}
      >
        <RouterProvider router={router as never} />
      </MantineProvider>
    </QueryClientProvider>,
  );
  return router;
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});
```

Then these cases, each asserting on rendered text rather than on internals:

```tsx
describe("surface 1", () => {
  it("opens asking for an address, naming the Shoebox", async () => {
    _respondWith({
      "/api/public-settings": { body: PUBLIC_SETTINGS, status: 200 },
    });
    _renderAt("/sign-in");

    expect(
      await screen.findByRole("heading", { name: "Sign in to My Shoebox." }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Email me a code" }),
    ).toBeVisible();
    expect(screen.queryByLabelText(/six digits/i)).not.toBeInTheDocument();
  });

  it("says somebody sent a link, and names nothing else about it", async () => {
    _respondWith({});
    _renderAt("/sign-in?redirect=%2Fitems%2Fabc");

    expect(
      await screen.findByRole("heading", {
        name: "Somebody sent you a link into My Shoebox.",
      }),
    ).toBeVisible();
    expect(screen.queryByText(/abc/)).not.toBeInTheDocument();
  });

  it("says the same words about a member and about a stranger", async () => {
    // Answer /api/auth/sign-in-codes with the same 202 for both addresses,
    // because that is what the server does. Submit each in turn and collect
    // the card's textContent with the address itself removed. The two
    // strings must be equal.
    //
    // Expected in both: "If  is in this Shoebox, a six-digit code is on its
    // way there now. It arrives in about a minute and it works for ten."
  });

  it("counts the tries down from the response, not from a constant", async () => {
    // At /sign-in?email=abuela@example.com&sent=true, answer
    // /api/auth/session with 401 { error: "sign_in_code_invalid",
    // details: { attemptsRemaining: 2 } }.
    //
    // Type "410233", press "Open the photos", then:
    // expect(await screen.findByText(
    //   "That is not the code in the email. Two tries left before we send you a new one.",
    // )).toBeVisible();
  });

  it("clears the field and promises a new code when the tries run out", async () => {
    // Same setup, answering 410 { error: "sign_in_code_attempts_exhausted" }.
    //
    // expect(await screen.findByText(
    //   "That was the last try, so that code has stopped working. A new one is on its way.",
    // )).toBeVisible();
    // expect(screen.getByLabelText(/six digits/i)).toHaveValue("");
    // And the body has moved to the resent wording:
    // expect(screen.getByText(/The old one has stopped working/)).toBeVisible();
  });

  it("strips a pasted code of its spaces and anything that is not a digit", async () => {
    // At ...&sent=true, type "410 233" into the code field.
    // expect(screen.getByLabelText(/six digits/i)).toHaveValue("410233");
    //
    // Then type "4102339" and assert it still holds "410233": six digits is
    // the cap, and the seventh character is dropped rather than truncating
    // the paste that carried it.
  });

  it("goes back where the link was pointing", async () => {
    // At /sign-in?email=abuela@example.com&sent=true&redirect=%2Fitems%2Fabc,
    // answer /api/auth/session with the 201 body from `auth.test.ts`.
    //
    // Type the code, submit, then:
    // await waitFor(() => {
    //   expect(router.state.location.pathname).toBe("/items/abc");
    // });
  });

  it("refuses to be sent anywhere but this origin", async () => {
    // The same, with redirect=https%3A%2F%2Fevil.example.com.
    // await waitFor(() => {
    //   expect(router.state.location.pathname).toBe("/");
    // });
  });

  it("remembers the address across a reload, so a code is not wasted", async () => {
    // Render at /sign-in?email=abuela@example.com&sent=true directly, which
    // is what a reload mid-flow is, and assert the address field already
    // holds it and the code field is showing. Nothing is fetched to do this.
  });
});
```

Write each of those out in full, using the exact strings in the comments: they
are the strings `signInCopy.ts` produces, and a test that paraphrases them is
a test that passes while the copy is wrong. Every case navigates to its own
URL, pre-filling `?email=abuela@example.com&sent=true` where it needs the code
field, so no case depends on a previous one.

`_renderAt` returns the router, which is what the two redirect cases assert
`router.state.location.pathname` on.

- [ ] **Step 6: Run and watch them pass, then look at it**

```bash
pnpm --filter @memory-shoebox/web test SignIn
pnpm dev
```

With the API running, open `http://localhost:5173/sign-in` and compare against
`http://localhost:5174/s/sign-in?state=email` side by side.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/surfaces/SignIn apps/web/src/routes/sign-in.tsx
git commit -m "feat(web): surface 1, live against the sign-in routes"
```

---

## Task 8: Surface 9, the name and the switches

**Files:**

- Create: `apps/web/src/surfaces/Account/notifyKinds.ts`
- Create: `apps/web/src/surfaces/Account/accountCopy/accountCopy.ts`
- Create: `apps/web/src/surfaces/Account/accountCopy/accountCopy.test.ts`
- Create: `apps/web/src/surfaces/Account/YouSheet.tsx`
- Create: `apps/web/src/surfaces/Account/EmailSheet.tsx`
- Create: `apps/web/src/surfaces/Account/AccountSheets.test.tsx`

**Context you need:** `reference/src/surfaces/Account.tsx` is the reference
for the markup, the copy and the four switch labels. Read it and carry the
copy across word for word. The saving behaviour is **not** in the prototype and
is decision 4 of the step design: a switch writes the moment it is flipped,
sending all four; the name gets a button that enables once the text differs.

Both sheets take their data and their mutation as props, so neither fetches. The
assembly in Task 10 owns the query.

- [ ] **Step 1: Write `notifyKinds.ts`**

Carry the four entries straight out of the prototype's `NOTIFY_KINDS`, typed
against the shared `NotifyPreferences`:

```ts
import type { NotifyPreferences } from "@memory-shoebox/shared";

/** One switch, and the sentence that says what turning it off stops. */
export type NotifyKind = {
  readonly key: keyof NotifyPreferences;
  readonly label: string;
  readonly note: string;
};

/**
 * The four switches, each carrying the sentence that says what it stops.
 *
 * One switch was easier to build and worse to live with: the member who wants
 * the daily upload mail but not the comment threads had exactly one move, and
 * it was to turn the whole thing off and stop coming back.
 */
export const NOTIFY_KINDS: readonly NotifyKind[] = [
  {
    key: "onUpload",
    label: "Somebody puts photographs up",
    note: "One email for the whole batch, however many it was, saying how many of them you can see.",
  },
  {
    key: "onComment",
    label: "Somebody writes on something of yours",
    note: "Only things you uploaded.",
  },
  {
    key: "onReply",
    label: "Somebody writes on something you wrote on",
    note: "So a conversation you joined does not carry on without you.",
  },
  {
    key: "onRemoval",
    label: "Somebody asks for a photograph to come down",
    note: "You get these because you can act on them. A viewer never does.",
  },
];

/** Every switch off, which is what the button sends. */
export const NOTIFY_NONE: NotifyPreferences = {
  onUpload: false,
  onComment: false,
  onReply: false,
  onRemoval: false,
};

/** Every switch on, which is what turning them back on sends. */
export const NOTIFY_ALL: NotifyPreferences = {
  onUpload: true,
  onComment: true,
  onReply: true,
  onRemoval: true,
};
```

- [ ] **Step 2: Write `accountCopy.ts`, the same shape as `signInCopy.ts`**

`conventions.md` § Errors applies here too: the envelope's `message` is never
the copy. One pure function, tested the same way:

```ts
import { ApiRequestError } from "@/api/client/client";

/** Turns a refusal on My account into the sentence somebody reads. */
export function accountFailure(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (
      error.code === "invalid_request" &&
      error.details?.fieldErrors?.displayName !== undefined
    ) {
      // `conventions.md` § String lengths: 80, "enough for Abuela Rosa, short
      // enough that a comment chip cannot be used as a billboard".
      return "That is longer than the space we have. Eighty characters at most.";
    }
    if (error.code === "session_not_found") {
      return "That device had already gone.";
    }
  }
  return "That did not save. Try again.";
}
```

Test all three branches, asserting the exact strings.

- [ ] **Step 3: Write the failing tests for the sheets**

`AccountSheets.test.tsx`, rendering each sheet inside a `MantineProvider` the
way `apps/web/src/system/Chrome/Chrome.test.tsx` does:

```tsx
describe("the You sheet", () => {
  it("shows the resolved name as a placeholder when none was ever typed", () => {
    // storedDisplayName null, member.displayName "abuela" (the local part).
    // Assert the input's value is "" and its placeholder is "abuela".
  });

  it("keeps the save button disabled until the name actually changes", async () => {
    // Assert disabled, type a character, assert enabled, undo it, assert
    // disabled again.
  });

  it("saves the trimmed name", async () => {
    // Type "  Abuela Rosa  ", press the button, assert onSave was called with
    // { displayName: "Abuela Rosa" }.
  });

  it("clears the name back to the fallback when emptied", async () => {
    // Empty the field, press the button, assert onSave was called with
    // { displayName: null }.
  });

  it("shows the address as unchangeable, and says why", () => {
    // Assert the email input is readOnly and the banner text is present.
  });
});

describe("the Email sheet", () => {
  it("sends all four switches when one is flipped", async () => {
    // Flip "Somebody writes on something you wrote on", assert onSave was
    // called with all four booleans and only that one changed.
  });

  it("turns them all off in one write", async () => {
    // Press "Turn them all off", assert onSave got four falses.
  });

  it("offers to turn them back on only once they are all off", () => {
    // With one on, "Turn them back on" is absent; with none on, it is there
    // and "Turn them all off" is disabled.
  });

  it("says that sign-in codes are not on the list", () => {
    // The banner, which is the thing that stops somebody silencing their own
    // way back in.
  });
});
```

Write the assertions out in full. Use `userEvent` from
`@testing-library/user-event`, and a `vi.fn()` for `onSave`.

- [ ] **Step 4: Run them and watch them fail**

```bash
pnpm --filter @memory-shoebox/web test Account
```

- [ ] **Step 5: Write `YouSheet.tsx`**

Props: `{ me: MeDto; onSave: (body: UpdateMeRequest) => void; isSaving: boolean; savedAt: number | undefined; error: string | undefined }`.

The markup is the prototype's `You` sheet, with three changes:

- the name `TextInput` becomes controlled, with
  `placeholder={me.member.displayName}` and `value` starting at
  `me.storedDisplayName ?? ""`. **That is what `storedDisplayName` is for**: it
  is the raw column, so the resolved fallback shows as a placeholder rather
  than as text the member appears to have typed.
- a `Button` reading `Save your name`, `disabled` when the trimmed value equals
  `me.storedDisplayName ?? ""` or `isSaving` is true, calling
  `onSave({ displayName: trimmed === "" ? null : trimmed })`.
- a `Prose` reading `Saved.` when `savedAt` is set and the field has not
  changed since, and the `error` string under the field when there is one.

Keep the email `TextInput` exactly as the prototype has it: `readOnly`, with
`classNames={{ input: classes.fieldFixed }}`, and keep the whole banner.

- [ ] **Step 6: Write `EmailSheet.tsx`**

Props: `{ notify: NotifyPreferences; onSave: (notify: NotifyPreferences) => void; isSaving: boolean; error: string | undefined }`.

The markup is the prototype's `Email` sheet. The difference is that
`onChange` calls `onSave({ ...notify, [kind.key]: checked })` rather than
setting local state, and "Turn them all off" sends `NOTIFY_NONE` while "Turn
them back on" sends `NOTIFY_ALL`. Keep both banners.

The switches read their checked state from the `notify` prop, which the
assembly keeps in sync with the server's answer, so a failed write shows the
old position rather than the one somebody just pressed.

- [ ] **Step 7: Run them and watch them pass**

```bash
pnpm --filter @memory-shoebox/web test Account
```

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/surfaces/Account
git commit -m "feat(web): the name and the four switches on my account"
```

---

## Task 9: Surface 9, the devices

**Files:**

- Create: `apps/web/src/surfaces/Account/deviceLabels/deviceLabels.ts`
- Create: `apps/web/src/surfaces/Account/deviceLabels/deviceLabels.test.ts`
- Create: `apps/web/src/surfaces/Account/DevicesSheet/DevicesSheet.tsx`
- Create: `apps/web/src/surfaces/Account/SignOutModal.tsx`
- Create: `apps/web/src/surfaces/Account/DevicesSheet/DevicesSheet.test.tsx`

**Why the split:** the prototype's fixtures carry `lastUsed` and `daysIdle` as
strings and numbers somebody wrote by hand. The contract sends **timestamps
only**, because a formatted or relative date must never appear in a payload:
the browser formats it, where the reader's locale is. So "3 days ago", "30 days
left" and "Falls out in 4 days" are all computed here, and they are worth
testing without rendering anything.

- [ ] **Step 1: Write the failing test for the labels**

```ts
import { describe, expect, it } from "vitest";
import {
  daysLeftLabel,
  lastUsedLabel,
} from "@/surfaces/Account/deviceLabels/deviceLabels";

const NOW = new Date("2026-09-28T12:00:00.000Z");

describe("lastUsedLabel", () => {
  it("says today for something used in the last day", () => {
    expect(
      lastUsedLabel({ lastUsedAt: "2026-09-28T09:00:00.000Z", now: NOW }),
    ).toBe("Today");
  });

  it("says yesterday rather than 1 day ago", () => {
    expect(
      lastUsedLabel({ lastUsedAt: "2026-09-27T09:00:00.000Z", now: NOW }),
    ).toBe("Yesterday");
  });

  it("counts the days after that", () => {
    expect(
      lastUsedLabel({ lastUsedAt: "2026-09-25T09:00:00.000Z", now: NOW }),
    ).toBe("3 days ago");
  });
});

describe("daysLeftLabel", () => {
  it("says how long a device stays signed in", () => {
    expect(
      daysLeftLabel({ expiresAt: "2026-10-28T12:00:00.000Z", now: NOW }),
    ).toBe("30 days left");
  });

  it("warns when it is about to fall out on its own", () => {
    expect(
      daysLeftLabel({ expiresAt: "2026-10-02T12:00:00.000Z", now: NOW }),
    ).toBe("Falls out in 4 days");
  });

  it("does not count below a day", () => {
    expect(
      daysLeftLabel({ expiresAt: "2026-09-28T18:00:00.000Z", now: NOW }),
    ).toBe("Falls out today");
  });
});
```

The threshold between the two phrasings is the prototype's: `daysIdle >= 26`,
which is four days or fewer left. Keep that number in a named constant with the
prototype cited beside it.

- [ ] **Step 2: Run it, watch it fail, write `deviceLabels.ts`**

Two exported functions, each taking `now` so a test never depends on the clock.
Compute whole days with `Math.floor` on the millisecond difference for "used",
and `Math.ceil` for "left", because a device with 29.2 days left has 30 days
and one with 0.2 days left falls out today.

- [ ] **Step 3: Write the failing test for the sheet**

```tsx
describe("the devices sheet", () => {
  it("marks the device you are holding", () => {
    // isCurrent true renders "· this one" beside the label.
  });

  it("offers a plainer sign-out for another device", async () => {
    // Press "Sign out" on a row that is not current, assert the modal names
    // that device and says it stops working straight away.
  });

  it("warns differently about the device you are on", async () => {
    // Press "Sign out here", assert the copy about needing a fresh code.
  });

  it("says what a lost phone is for", () => {
    // The banner.
  });
});
```

- [ ] **Step 4: Write `SignOutModal.tsx` and `DevicesSheet.tsx`**

`SignOutModal` props:
`{ device: SessionDto | undefined; onConfirm: () => void; onCancel: () => void; isSigningOut: boolean }`.
Carry both strings from the prototype verbatim. The two differ **only in
copy**, because the consequence is different, not the route.

`DevicesSheet` props:
`{ sessions: readonly SessionDto[]; now: Date; onSignOut: (device: SessionDto) => void; deviceSigningOut: SessionDto | undefined; onConfirm: () => void; onCancel: () => void; isSigningOut: boolean }`.

The table is the prototype's, with `lastUsedLabel` and `daysLeftLabel`
supplying the two `classes.tabular` cells and `device.isCurrent` driving both
the "· this one" suffix and the `danger` button variant.

- [ ] **Step 5: Run the tests and watch them pass, then commit**

```bash
pnpm --filter @memory-shoebox/web test Account
git add apps/web/src/surfaces/Account
git commit -m "feat(web): the device list, and signing one out"
```

---

## Task 10: Surface 9, assembled

**Files:**

- Create: `apps/web/src/surfaces/Account/AdminDoors.tsx`
- Create: `apps/web/src/surfaces/Account/LicenceSheet.tsx`
- Create: `apps/web/src/surfaces/Account/AccountSurface/AccountSurface.tsx`
- Create: `apps/web/src/surfaces/Account/AccountSurface/AccountSurface.test.tsx`
- Modify: `apps/web/src/routes/_app/account.tsx`

- [ ] **Step 1: Write `AdminDoors.tsx`**

The prototype's "Running this archive" sheet. Five `Button`s wrapped in
`Link`s, rendered only when the viewer is an admin. Keep the prose and the
banner verbatim.

| Door                 | `to`                |
| -------------------- | ------------------- |
| Shoebox settings     | `/settings`         |
| Members and groups   | `/members`          |
| Milestones           | `/milestones`       |
| Who has been looking | `/presence`         |
| Removal requests     | `/removal-requests` |

**Drop the prototype's "· 2" from the removal requests door.** That count comes
from the removal slice, which step 7a owns, and this step will not invent one.
Put a comment saying so, so the next reader does not think it was forgotten.

Use `BarLink`'s approach for the anchor colour problem: an anchor arrives
carrying the browser's own blue and an underline. `apps/web/src/system/ProductBar/BarLink.tsx`
already solves this with `classes.barLink`; reuse that class rather than
inventing a second one.

- [ ] **Step 2: Write `LicenceSheet.tsx`**

The prototype's Licence sheet, with the button made real:

```tsx
/**
 * Where the source of this instance lives.
 *
 * **AGPL-3.0 section 13 makes this a product requirement rather than a
 * footnote**: a modified version offered over a network has to offer its
 * source to the people using it, so "the interface needs a reachable way to
 * get at the source" (`PRODUCT.md` § How it works).
 *
 * A constant because there is nowhere to configure it: `SETTING_DEFINITIONS`
 * has nine keys and none of them is a source URL. **A self-hoster who modifies
 * this code has to edit this line**, which is a real gap rather than a design:
 * whoever builds surface 11 should consider a `shoebox.source_url` key.
 */
const SOURCE_URL = "https://github.com/jpsyx/memory-shoebox";
```

Read the running version from `healthQueryOptions` in `@/api/health`, which
already exists and already returns the server's package version. Render it
beside the button as "You are running version 0.0.0", falling back to no
version line while the query is in flight. The version matters because section
13 is about the source of the exact version running here.

- [ ] **Step 3: Write `AccountSurface.tsx`**

This is the only component in the surface that fetches. It owns:

```tsx
const { viewer, settings } = useRouteContext({ from: "/_app" });
const { data: me } = useSuspenseQuery(meQueryOptions);
const { data: sessions } = useQuery(mySessionsQueryOptions);
```

`meQueryOptions` is already in the cache, put there by the guard, so this is a
read rather than a second request.

Three mutations, and each one writes the answer back into the cache rather
than invalidating, because every one of them returns the post-mutation shape:

```tsx
// The name's save. It has a button, so a round trip is expected and the
// answer is written when it lands.
const saveMe = useMutation({
  mutationFn: updateMe,
  onSuccess: (updated) => {
    queryClient.setQueryData(meQueryOptions.queryKey, updated);
  },
});

// **The switches are different, and this is not optional.** A switch moves
// when it is flipped, not when the server answers: the cache is written in
// `onMutate`, before the request goes out, and rolled back in `onError`.
// `EmailSheet` holds no state and reads `checked` straight off the prop, so
// without this the control does nothing at all until the round trip
// finishes, which on a phone means being tapped a second time. See decision
// 4 of the design, which settles the apparent conflict with "a switch must
// never look flipped while unsaved".
const saveNotify = useMutation({
  mutationFn: (notify: NotifyPreferences) => {
    return updateMe({ notify });
  },
  onMutate: async (notify) => {
    await queryClient.cancelQueries({ queryKey: meQueryOptions.queryKey });
    const previous = queryClient.getQueryData(meQueryOptions.queryKey);
    queryClient.setQueryData(meQueryOptions.queryKey, (current) => {
      return current === undefined
        ? current
        : { ...current, me: { ...current.me, notify } };
    });
    return { previous };
  },
  onError: (_error, _notify, context) => {
    queryClient.setQueryData(meQueryOptions.queryKey, context?.previous);
  },
  onSuccess: (updated) => {
    queryClient.setQueryData(meQueryOptions.queryKey, updated);
  },
});

const signOutDevice = useMutation({
  mutationFn: (device: SessionDto) => {
    return device.isCurrent
      ? deleteSession()
      : revokeMySession(device.sessionId);
  },
  onSuccess: async (_answer, device) => {
    if (device.isCurrent) {
      // Everything cached was about a session that no longer exists.
      queryClient.clear();
      await navigate({ to: "/sign-in" });
      return;
    }
    await queryClient.invalidateQueries({ queryKey: MY_SESSIONS_QUERY_KEY });
  },
});
```

**Why the current device uses a different route.** `DELETE /api/auth/session`
and `DELETE /api/me/sessions/:id` with your own id have the same effect; the
first exists so a client need not know its own session id to leave. The
difference the member sees is entirely in the copy, which is `SignOutModal`'s
job, not the route's.

A `404 session_not_found` on the revoke means the row had already gone, which
is not a failure worth a dialogue: show "That device had already gone." and
refetch the list. Handle it in `onError` by checking
`error instanceof ApiRequestError && error.code === "session_not_found"`.

Compose the five sheets in the prototype's order inside `Page wide`, with the
prototype's `TopBar back="Back to the pile"` above them, and the `Lede` reading
`${me.me.member.displayName}, in ${settings.shoeboxName}.`

Set `staticData: { hasOwnBar: true }` on the route, because this surface draws
its own top bar with a back link and `_app.tsx` stands aside for exactly that.

- [ ] **Step 4: Rewire the route**

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { AccountSurface } from "@/surfaces/Account/AccountSurface/AccountSurface";

export const Route = createFileRoute("/_app/account")({
  staticData: { hasOwnBar: true },
  component: AccountSurface,
});
```

- [ ] **Step 5: Update the `/account` lede in `rendering.test.tsx`**

The surface no longer says "Your account.": it says the member's name and the
Shoebox's. Change that row of `SURFACES` to `"Papá, in My Shoebox."`, matching
the stubbed `MeResponse` Task 4 added, and delete the comment Task 4 left on
that row.

`/account` also now draws its own bar, so if the "is the product bar" test
uses it, point that test at a surface that does not.

- [ ] **Step 6: Write `AccountSurface.test.tsx`**

Render through the router at `/account` with `fetch` stubbed for `/api/me`,
`/api/me/sessions` and `/api/health`, following the pattern in
`SignInCard.test.tsx`. Cover:

- the five admin doors are there for an admin and **absent for a viewer**
- the lede names the member and the Shoebox
- saving a name issues one `PATCH` carrying only `displayName`
- flipping a switch issues one `PATCH` carrying all four booleans
- signing out the current device calls `DELETE /api/auth/session` and lands on
  `/sign-in`
- signing out another device calls `DELETE /api/me/sessions/<id>` and leaves
  the surface where it is

- [ ] **Step 7: Run, look, commit**

```bash
pnpm --filter @memory-shoebox/web test Account
pnpm dev
```

Open `http://localhost:5173/account` beside
`http://localhost:5174/s/account?state=default` and compare.

```bash
git add apps/web/src/surfaces/Account apps/web/src/routes/_app/account.tsx
git commit -m "feat(web): surface 9, live against the account routes"
```

---

## Task 11: The end-to-end harness, and the arrival flow

**Files:**

- Create: `playwright.config.ts`
- Create: `e2e/support/e2eEnvironment.ts`
- Create: `e2e/support/globalSetup.ts`
- Create: `e2e/support/database.ts`
- Create: `e2e/signIn.spec.ts`
- Modify: `package.json` (root): `@playwright/test` and a `test:e2e` script
- Modify: `.gitignore`: the run's database and Playwright's output

**Why this exists:** five of this step's verification items cannot be proven
without a browser, and the build has no harness: no `playwright.config.ts`, no
`e2e/`, and `@playwright/test` is not a dependency. `playwright` the library is
already a dev dependency of `apps/server`, where it renders fake emails to PDF;
match its version.

**How a test reads a six-digit code, which is the question to settle first.**
`makeScrubPatchFromKind` wipes `payload_json` and the subject once a
`sign_in_code` row reaches `sent`. So the run starts the server **with mail
unconfigured**: no `RESEND_API_KEY` and `ENABLE_FAKE_EMAIL` unset, which makes
`getEmailServiceKind` answer `none`. The worker then takes
`runMailQueueOnce`'s `_defer` path, which puts the row back to `queued`, leaves
`attempts` where it was, and writes no scrub patch. The digits sit in
`payload_json` indefinitely.

**`public.base_url` has to be set or this does not work**, because
`enqueueEmail` writes the row already terminal when it is missing. Task 2's
seed script sets it, which is why it does both jobs.

- [ ] **Step 1: Install the dependency**

```bash
pnpm add -Dw @playwright/test@$(node -p "require('./apps/server/package.json').devDependencies.playwright")
pnpm exec playwright install chromium
```

- [ ] **Step 2: Write `e2e/support/e2eEnvironment.ts`**

```ts
/**
 * The one place the end-to-end stack's shape is written.
 *
 * The config, the global setup and the database helpers all read it, so the
 * port and the catalog cannot drift apart between them.
 */

/** Away from `pnpm dev`'s 8080, so a running dev server is not in the way. */
export const E2E_PORT = 8099;

/** The catalog this run owns. Deleted at the start of every run. */
export const E2E_DATABASE_PATH = "apps/server/data/e2e.db";

/** Where the browser points. */
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;

/**
 * The environment the server under test runs in.
 *
 * **`RESEND_API_KEY` and `ENABLE_FAKE_EMAIL` are absent on purpose.** With no
 * service configured the mail worker defers every message back to `queued`
 * without scrubbing it, which is what leaves a sign-in code readable. The B2
 * values are placeholders that could not reach Backblaze if anything tried.
 */
export const E2E_SERVER_ENVIRONMENT = {
  NODE_ENV: "test",
  PORT: String(E2E_PORT),
  HOST: "127.0.0.1",
  DATABASE_PATH: E2E_DATABASE_PATH,
  SESSION_SECRET: "e2e-session-secret-at-least-32-characters",
  WEB_DIST_PATH: "apps/web/dist",
  B2_KEY_ID: "key-id",
  B2_APPLICATION_KEY: "application-key",
  B2_BUCKET: "memory-shoebox-media",
  B2_ENDPOINT: "https://s3.us-west-004.backblazeb2.com",
  B2_REGION: "us-west-004",
};
```

- [ ] **Step 3: Write `playwright.config.ts`**

```ts
import { defineConfig, devices } from "@playwright/test";
import {
  E2E_BASE_URL,
  E2E_SERVER_ENVIRONMENT,
} from "./e2e/support/e2eEnvironment";

/**
 * The end-to-end layer.
 *
 * **One Fastify process serves both the API and the built app**, which is the
 * production topology (`docs/architecture.md`): one origin, no CORS, no proxy,
 * and the static-serving path exercised rather than assumed. The cost is a
 * build before the run, which `pnpm check` does anyway.
 *
 * **One worker, and not for speed.** There is one SQLite catalog and one
 * member in it, and the specs sign devices in and out of that member. Two
 * workers would be two runs fighting over the same device list.
 *
 * This is not part of `pnpm check`: it needs a browser installed and a port.
 * It is `pnpm test:e2e`, run deliberately.
 */
export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/support/globalSetup.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: process.env.CI !== undefined,
  retries: process.env.CI === undefined ? 0 : 1,
  reporter: "list",
  use: {
    baseURL: E2E_BASE_URL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm build && pnpm --filter @memory-shoebox/server start",
    url: `${E2E_BASE_URL}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: E2E_SERVER_ENVIRONMENT,
  },
});
```

- [ ] **Step 4: Write `e2e/support/globalSetup.ts`**

```ts
import { rmSync } from "node:fs";
import { E2E_DATABASE_PATH } from "./e2eEnvironment";

/**
 * Throws the last run's catalog away.
 *
 * Runs before the server starts, which is the only moment the file is not
 * open. The server migrates a fresh one at boot, so every run begins with an
 * empty Shoebox and a specification that cannot depend on yesterday.
 */
export default function globalSetup(): void {
  for (const suffix of ["", "-wal", "-shm"]) {
    rmSync(`${E2E_DATABASE_PATH}${suffix}`, { force: true });
  }
}
```

- [ ] **Step 5: Write `e2e/support/database.ts`**

```ts
import { signInCodeEmailPayloadSchema } from "@memory-shoebox/shared";
import { createDatabase } from "../../apps/server/src/db/client.ts";
import { seedMember } from "../../apps/server/scripts/seedMember.ts";
import { E2E_BASE_URL, E2E_DATABASE_PATH } from "./e2eEnvironment";

/**
 * Runs `work` against the catalog the server under test is using, then closes.
 *
 * A second handle on the same file rather than a route, because none of this
 * is something the product does: there is no route that creates a member (that
 * is step 8a) and there must never be one that reads a sign-in code.
 */
async function _withDatabase<T>(
  work: (database: ReturnType<typeof createDatabase>) => Promise<T>,
): Promise<T> {
  const database = createDatabase(E2E_DATABASE_PATH);
  try {
    return await work(database);
  } finally {
    await database.destroy();
  }
}

/**
 * Makes somebody who can sign in.
 *
 * @param options.email The address to invite.
 * @param options.role Their role. Defaults to admin, because the five admin
 *   doors are one of the things surface 9 has to show.
 */
export function seedMemberAtAddress(options: {
  email: string;
  role?: "viewer" | "uploader" | "admin";
}): Promise<{ memberId: string }> {
  return _withDatabase(async (database) => {
    const seeded = await seedMember({
      database,
      email: options.email,
      role: options.role ?? "admin",
      baseUrl: E2E_BASE_URL,
    });
    return { memberId: seeded.memberId };
  });
}

/**
 * Reads the six digits most recently mailed to an address.
 *
 * **This works because the run's mail is unconfigured.** The worker defers a
 * message it cannot send back to `queued` without scrubbing it, so the digits
 * stay in `payload_json`. A run with a working sender would find the row
 * scrubbed and this would fail, loudly and correctly.
 *
 * Ordered by `id` rather than `created_at`: ids are uuidv7 with a
 * sub-millisecond counter, so they order two rows written in the same
 * millisecond and a timestamp does not.
 *
 * @param email The address the code went to.
 * @returns The six digits.
 */
export async function readSignInCode(email: string): Promise<string> {
  const row = await _withDatabase((database) => {
    return database
      .selectFrom("outbound_emails")
      .select(["payload_json", "state"])
      .where("to_address", "=", email.trim().toLowerCase())
      .where("kind", "=", "sign_in_code")
      .orderBy("id", "desc")
      .limit(1)
      .executeTakeFirst();
  });

  if (row === undefined) {
    throw new Error(`No sign-in code was queued for ${email}.`);
  }

  const payload = signInCodeEmailPayloadSchema.safeParse(
    JSON.parse(row.payload_json),
  );
  if (!payload.success) {
    throw new Error(
      `The sign-in code row for ${email} is ${row.state} and its payload has been scrubbed. ` +
        "The run's mail must be unconfigured: no RESEND_API_KEY, no ENABLE_FAKE_EMAIL.",
    );
  }
  return payload.data.code;
}
```

- [ ] **Step 6: Add the script and the ignores**

Root `package.json` scripts:

```json
"test:e2e": "playwright test"
```

`.gitignore`, with a comment saying what they are:

```
# The end-to-end run's own catalog and output
apps/server/data/e2e.db*
/test-results/
/playwright-report/
```

- [ ] **Step 7: Prove the plumbing before writing a single assertion**

```bash
pnpm test:e2e --list
```

Then write one throwaway spec that seeds an address, posts to
`/api/auth/sign-in-codes` with `request.post`, and prints `readSignInCode`'s
answer. Run it. **If it prints six digits, everything else in this task is
ordinary test writing.** If it does not, stop and report: the likeliest causes
are `public.base_url` unset (the row is born scrubbed) or a Resend key leaking
in from a `.env.local` the server loaded.

One more thing to check here rather than discover later: the session cookie
carries `Secure`, and browsers accept a `Secure` cookie over
`http://localhost` because localhost is a trustworthy origin. Confirm the
cookie is actually stored by signing in once and reading
`context.cookies()`. If it is not, report it rather than working around it.

- [ ] **Step 8: Write `e2e/signIn.spec.ts`**

Cover, each against the real server:

1. **The whole arrival flow.** Seed an address, open `/sign-in`, type it, press
   "Email me a code", read the code from the catalog, type it, press "Open the
   photos", and land on the pile. Assert the first-sign-in banner is there.
2. **`sent` and `unknown` are indistinguishable.** Submit the seeded address,
   screenshot the card; reload, submit an address nobody has heard of,
   screenshot the card; assert the two images match after masking the address
   itself. This is the honest version of the test the step asks for: it
   compares two server answers, not two client branches.
3. **The countdown.** Submit three wrong codes. Assert "Two tries left", then
   "One try left", then the exhaustion copy, and assert a **new** code row
   exists in the catalog whose digits differ from the first.
4. **Expiry.** Submit a code, then supersede it by pressing "Send another", then
   submit the first code. Assert the expired copy.
5. **Deep entry.** Open `/items/abc` signed out, assert the redirect to
   `/sign-in?redirect=%2Fitems%2Fabc`, sign in, and assert the browser ends on
   `/items/abc`.
6. **The open redirect is refused.** Open
   `/sign-in?redirect=https%3A%2F%2Fexample.com`, sign in, assert the browser
   is on `/` and still on this origin.
7. **Keyboard only.** Reach and complete the whole flow with `keyboard.press`
   alone: `Tab` to the field, type, `Enter`, `Tab`, type, `Enter`.
8. **Phone width and 200% zoom.** At 400x800 and at 640x450, assert
   `document.documentElement.scrollWidth <= clientWidth` and that the button is
   visible.

- [ ] **Step 9: Run it**

```bash
pnpm test:e2e signIn
```

- [ ] **Step 10: Commit**

```bash
git add playwright.config.ts e2e package.json pnpm-lock.yaml .gitignore
git commit -m "test: an end-to-end harness that can read a sign-in code"
```

---

## Task 12: The account, end to end

**Files:**

- Create: `e2e/account.spec.ts`
- Create: `e2e/support/signIn.ts`

- [ ] **Step 1: Write `e2e/support/signIn.ts`**

One helper that drives a `Page` through the real sign-in and returns once the
pile is showing, so no account test restates the flow:

```ts
export async function signInAs(options: {
  page: Page;
  email: string;
}): Promise<void>;
```

It posts nothing directly: it types into the surface, because a helper that
short-circuited the form would stop the account tests proving that a session
made by the product works.

- [ ] **Step 2: Write `e2e/account.spec.ts`**

1. **The name.** Sign in, open `/account`, assert the field is empty with the
   email local part as its placeholder, type a name, press "Save your name",
   assert "Saved.", reload, assert the name persisted and now appears in the
   product bar.
2. **The switches.** Flip one, reload, assert it stayed flipped. Press "Turn
   them all off", reload, assert all four are off and "Turn them back on" is
   offered.
3. **The admin doors.** Assert all five are present for the seeded admin and
   that each one navigates.
4. **A device signed out in one browser stops working in the other.** Two
   browser contexts, both signed in as the same member. In context A, open
   `/account`, find the row that is not "· this one", sign it out, confirm. In
   context B, reload and assert it lands on `/sign-in`. **This is the promise
   the Account banner makes**, and it is the reason sessions are rows rather
   than tokens.
5. **Signing out the one you are on.** In context A, press "Sign out here",
   confirm, assert it lands on `/sign-in`, then navigate to `/account` and
   assert it redirects back to `/sign-in`.
6. **Keyboard only, and 200% zoom**, as in Task 11.

- [ ] **Step 3: Run the whole harness and commit**

```bash
pnpm test:e2e
git add e2e
git commit -m "test: my account, end to end, including a device dying remotely"
```

---

## Task 13: The documentation, and the step's own status

**Files:**

- Modify: `docs/web.md`
- Create: `docs/e2e.md`
- Modify: `docs/configuration.md`
- Modify: `docs/architecture.md`
- Modify: `docs/reference.md`
- Modify: `docs/prds/2026-09-27-memory-shoebox/plan/step-4b.md`
- Modify: `docs/prds/2026-09-27-memory-shoebox/plan/README.md`

`AGENTS.md` makes this part of the definition of done rather than an
afterthought.

- [ ] **Step 1: `docs/web.md`**

§ Routing currently says the guard "currently resolves a hardcoded placeholder
viewer and never touches the network" and that step 4b replaces one function
body. Rewrite that paragraph to describe what is actually there: one `/me`
query serving both the guard and My account, `requireSignedIn` taking the
response and returning the viewer and the shell's settings, and why the 401 is
caught rather than thrown.

Add a section on the two surfaces: surface 1's state in the URL and the six
states rather than seven, and surface 9's saving model.

§ Tests gains the end-to-end layer, pointing at `docs/e2e.md`.

- [ ] **Step 2: `docs/e2e.md`**

A new document. What the harness is, the production topology it runs in, why
the run leaves mail unconfigured, how a test reads a sign-in code and why that
is deterministic, why there is one worker, and how to run it including
`playwright install chromium`.

- [ ] **Step 3: `docs/configuration.md`**

How to get somebody to sign in as locally, which has not been possible before:
`pnpm seed:member <address>`, what it writes, and that inviting properly
arrives with step 8a.

- [ ] **Step 4: `docs/architecture.md`**

§ What is not built yet says "Three are done" and then describes two. Bring it
up to date: steps 1, 2, 3a, 3b and 4b, and correct the count.

- [ ] **Step 5: `docs/reference.md`**

Record the sign-in copy correction from Task 1 and why, so the next reader
finds it explained rather than discovering it.

- [ ] **Step 6: The step's own record**

`step-4b.md`'s `**Status:**` line becomes `done`, with a short paragraph above
"What this step delivers" saying what was verified by hand and what the
end-to-end harness proves, in the shape step 3a's file uses. The plan
`README.md` table's 4b row gets `done`, and its "Work that is not a numbered
step" section stops describing the harness as unbuilt.

- [ ] **Step 7: Run everything and commit**

```bash
pnpm check
pnpm test:e2e
git add docs
git commit -m "docs: sign in and my account, and the harness that proves them"
```

---

## Self-review notes

Three things a reader of this plan should know were checked rather than
assumed:

1. **`queryClient.query()` exists in the installed TanStack Query (5.103)** and
   `ensureQueryData` is deprecated in favour of it, which is why `_app.tsx`
   already calls it. It returns the selected type, so `meQueryOptions`'
   `MeResponse | undefined` is what `beforeLoad` gets.
2. **`navigate({ href })` is supported** and documented as "instead of `to` to
   navigate to a fully built href", which is what Task 7 needs for a redirect
   whose value is a string off the URL. It is also why
   `makeSafeHrefFromRedirect` exists: an arbitrary href is exactly what an open
   redirect needs.
3. **`redirect()` returns a `Response`** in this router version, carrying the
   options under `.options`. The existing test pins this; keep the comment.
