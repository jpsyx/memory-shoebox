# Identity and Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build step 3a of Memory Shoebox: the eight authentication routes, the
anonymous public settings read, the auth middleware behind step 2's seam, and
the visibility predicate with its generation-keyed cache.

**Architecture:** A request arrives carrying a `shoebox_session` cookie. An
`onRequest` hook (already registered by step 2) resolves it to a `Viewer` by
looking the session up in SQLite on **every** request, reads
`visibility.generation`, expands that member's visible visibility-rule ids
(cached per generation), and slides the session's expiry at most once a day.
Handlers read `request.viewer`; every later archive read composes one
`applyVisibilityFilter` function rather than rewriting the predicate.

**Tech Stack:** Fastify 5, Kysely over better-sqlite3, Zod 4, Vitest, Node's
own `node:crypto`. No new runtime dependency is added by this plan.

---

## Read before starting

The step design is
[`docs/superpowers/specs/2026-09-28-identity-and-access-design.md`](../specs/2026-09-28-identity-and-access-design.md).
It carries the reasoning; this plan carries the code. The contract it
implements is:

| Document                                                                | What it settles                                                    |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `docs/prds/2026-09-27-memory-shoebox/tech-specs/apis/auth.md`           | All eight routes, their errors, their transformations, its Rulings |
| `docs/prds/2026-09-27-memory-shoebox/tech-specs/apis/conventions.md`    | The middleware, the predicate, errors, rate limits, the envelope   |
| `docs/prds/2026-09-27-memory-shoebox/tech-specs/data-models.md`         | Every column touched here, and Decisions 1, 2, 3 and 7             |
| `docs/prds/2026-09-27-memory-shoebox/tech-specs/apis/notifications.md`  | § 1 `sign_in_code`: trigger, idempotency, recipient, copy          |
| `docs/prds/2026-09-27-memory-shoebox/tech-specs/apis/administration.md` | `GET /api/public-settings` only                                    |

## Conventions this plan assumes

Read `AGENTS.md` and `docs/rules/typescript.md` once before Task 1. The five
that bite hardest here:

- **Relative imports include the `.ts` extension** in `apps/server/**` and
  `packages/shared/**`. Node's type stripping resolves them literally.
- **`type`, never `interface`. Never `any`.** Prefer `undefined` to `null`,
  except where the wire or the database requires `null`, which in this slice
  is most of the columns and several payload fields.
- **Top-level functions use the `function` keyword; nested ones are arrow
  functions.** Non-exported top-level helpers are prefixed `_`.
- **Every exported function has a docstring.** Single-line it when it fits in
  80 characters.
- **No em dash (`—`) anywhere**, in code, comments, documents or commit
  messages. Use a colon, a comma, or parentheses.

Naming follows `AGENTS.md` § Naming conventions: `make{Target}From{Source}`
for a free function returning a new value, `get{Target}From{Source}` for one
reading a value out of its source, `create{Thing}` only for a genuine
constructor, and **never** `resolve...`.

Run tests with the package filter, for example:

```sh
pnpm --filter @memory-shoebox/server test test/auth/sessionCookie.test.ts
pnpm --filter @memory-shoebox/shared test
```

`pnpm check` (format, lint, types, build, tests) is the gate before the last
commit.

## File structure

```
packages/shared/src/
├── settings.ts                    MODIFY: ShellSettings, PublicSettingsResponse,
│                                  PUBLIC_SETTING_KEYS
├── auth.ts                        CREATE: every schema in the auth slice
└── index.ts                       MODIFY: export the new names

apps/server/src/
├── config.ts                      MODIFY: signInCodePepper, derived from SESSION_SECRET
├── app.ts                         MODIFY: default authenticator, app.clock, three route modules
├── db/
│   ├── client.ts                  MODIFY: register the create_id() SQL function
│   └── runInImmediateTransaction.ts  CREATE
├── auth/
│   ├── sessionCookie.ts           CREATE: read, set and clear the one cookie
│   ├── sessionToken.ts            CREATE: the token and its SHA-256
│   ├── signInCodeHelpers.ts       CREATE: digits, HMAC, constant-time compare
│   ├── auth.constants.ts        CREATE: ten minutes, three tries, thirty days
│   ├── getDeviceLabelFromUserAgent.ts  CREATE
│   ├── mintSignInCode.ts          CREATE: supersede, insert, enqueue
│   └── createAuthenticator.ts     CREATE: the middleware's lookup and slide
├── members/
│   ├── getDisplayNameFromMember.ts  CREATE: the Decision 1 fallback
│   └── getMeDtoFromMemberId.ts    CREATE: the self-scoped read shape
├── settings/readShellSettings.ts  CREATE: the three the shell needs
├── visibility/
│   ├── getVisibleRuleIdsFromMemberId.ts  CREATE: the expansion query
│   ├── createVisibleRuleIdsCache.ts     CREATE: keyed by generation
│   ├── applyVisibilityFilter.ts         CREATE: the one sanctioned reader
│   └── bumpVisibilityGeneration.ts      CREATE: for steps 5a, 6a and 8a
├── http/
│   ├── ApiError.ts                MODIFY: two named constructors
│   └── rateLimit/rateLimit.constants.ts  MODIFY: publicReadPerIp
└── routes/
    ├── auth.ts                    CREATE: four sign-in and session routes
    ├── me.ts                      CREATE: account, notifications, devices
    └── publicSettings.ts          CREATE: the anonymous read

apps/server/test/
├── auth/                          one file per module above, plus authGuarantees.test.ts
├── members/, settings/, visibility/, db/
└── routes/                        one file per route module
```

---

## Task 1: `ShellSettings`, `PublicSettingsResponse` and the public key list

**Files:**

- Modify: `packages/shared/src/settings.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/test/settings.test.ts` (exists; add to it)

- [ ] **Step 1: Write the failing tests**

Append to `packages/shared/test/settings.test.ts`:

```ts
describe("PUBLIC_SETTING_KEYS", () => {
  it("holds exactly the keys carrying isPubliclyReadable", () => {
    const flagged = SETTING_KEYS.filter((key) => {
      return SETTING_DEFINITIONS[key].isPubliclyReadable;
    });
    expect([...PUBLIC_SETTING_KEYS].sort()).toEqual([...flagged].sort());
  });
});

describe("shellSettingsSchema", () => {
  it("accepts the three the shell needs", () => {
    const parsed = shellSettingsSchema.parse({
      shoeboxName: "My Shoebox",
      pileArrangement: "messy",
      timezone: "Europe/Madrid",
    });
    expect(parsed.pileArrangement).toBe("messy");
  });

  it("rejects an arrangement outside the two", () => {
    expect(() => {
      return shellSettingsSchema.parse({
        shoeboxName: "My Shoebox",
        pileArrangement: "neat",
        timezone: "Europe/Madrid",
      });
    }).toThrow();
  });

  it("rejects a zone Intl cannot resolve", () => {
    expect(() => {
      return shellSettingsSchema.parse({
        shoeboxName: "My Shoebox",
        pileArrangement: "tidy",
        timezone: "Mars/Olympus",
      });
    }).toThrow();
  });
});

describe("publicSettingsResponseSchema", () => {
  it("accepts a Shoebox whose base URL is not set yet", () => {
    const parsed = publicSettingsResponseSchema.parse({
      shoeboxName: "My Shoebox",
      baseUrl: null,
    });
    expect(parsed.baseUrl).toBeNull();
  });

  it("rejects a relative base URL", () => {
    expect(() => {
      return publicSettingsResponseSchema.parse({
        shoeboxName: "My Shoebox",
        baseUrl: "/shoebox",
      });
    }).toThrow();
  });
});
```

Extend the file's existing import from `../src/settings.ts` with
`PUBLIC_SETTING_KEYS`, `SETTING_KEYS`, `shellSettingsSchema` and
`publicSettingsResponseSchema`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @memory-shoebox/shared test`
Expected: FAIL, with `PUBLIC_SETTING_KEYS` and the two schemas undefined.

- [ ] **Step 3: Add the three exports**

In `packages/shared/src/settings.ts`, above `publicBaseUrlDefinition`, add the
shared URL form and use it in that definition:

```ts
/** An absolute `http` or `https` URL, which is `public.base_url`'s form. */
const absoluteUrlSchema = z.url({ protocol: /^https?$/ });
```

Change `publicBaseUrlDefinition`'s `schema` to `absoluteUrlSchema.nullable()`.

At the end of the file, after `getSettingValueFromStoredValue`:

```ts
/**
 * The keys `GET /api/public-settings` serves, which is every key carrying
 * `isPubliclyReadable`.
 *
 * Written out rather than filtered from the registry so that the two keys have
 * literal types and the route's response can be built from them without a
 * cast. `settings.test.ts` asserts that this list and the flag still agree, so
 * marking a tenth key publicly readable fails a test until the route serves
 * it. That test is the guard the flag promises to be.
 */
export const PUBLIC_SETTING_KEYS = [
  "shoebox.name",
  "public.base_url",
] as const satisfies readonly SettingKey[];

/**
 * The three instance settings the app shell needs the moment it renders.
 *
 * They ride on `POST /api/auth/session` and `GET /api/me` rather than on a
 * second fetch (`auth.md` Ruling 1), and `pile.arrangement` in particular must
 * not become anonymously readable, which is why this is not the public shape
 * below.
 */
export const shellSettingsSchema = z.object({
  shoeboxName: z.string().min(1),
  pileArrangement: z.enum(["tidy", "messy"]),
  timezone: ianaTimezoneSchema,
});

/** The three instance settings the app shell needs as it renders. */
export type ShellSettings = z.infer<typeof shellSettingsSchema>;

/**
 * `GET /api/public-settings`: the Shoebox's name before anybody is signed in.
 *
 * A fingerprint of the instance, not a membership oracle: it reveals no
 * member, no address, no count and no content (`administration.md`).
 */
export const publicSettingsResponseSchema = z.object({
  shoeboxName: z.string().min(1),
  /** Absolute, from `public.base_url`. Null before first-run setup. */
  baseUrl: absoluteUrlSchema.nullable(),
});

/** What `GET /api/public-settings` answers. */
export type PublicSettingsResponse = z.infer<
  typeof publicSettingsResponseSchema
>;
```

- [ ] **Step 4: Export them from the barrel**

In `packages/shared/src/index.ts`, add to the existing `./settings.ts` export
block, keeping its alphabetical-ish grouping: `PUBLIC_SETTING_KEYS`,
`publicSettingsResponseSchema`, `shellSettingsSchema`, and the types
`PublicSettingsResponse` and `ShellSettings`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @memory-shoebox/shared test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/settings.ts packages/shared/src/index.ts packages/shared/test/settings.test.ts
git commit -m "feat(shared): the shell's three settings, and the public two"
```

---

## Task 2: The auth slice's schemas

**Files:**

- Create: `packages/shared/src/auth.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/test/auth.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/shared/test/auth.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  createSessionRequestSchema,
  listMySessionsResponseSchema,
  meDtoSchema,
  requestSignInCodeRequestSchema,
  updateMeRequestSchema,
} from "../src/auth.ts";

const MEMBER_ID = "0192f2a0-7d3c-7000-8000-000000000001";

describe("requestSignInCodeRequestSchema", () => {
  it("normalises the address before anything else touches it", () => {
    const parsed = requestSignInCodeRequestSchema.parse({
      email: "  Abuela@Example.COM ",
    });
    expect(parsed.email).toBe("abuela@example.com");
  });

  it("rejects a value that is not an address", () => {
    expect(() => {
      return requestSignInCodeRequestSchema.parse({ email: "abuela" });
    }).toThrow();
  });
});

describe("createSessionRequestSchema", () => {
  it("takes exactly six digits", () => {
    const parsed = createSessionRequestSchema.parse({
      email: "abuela@example.com",
      code: "410233",
    });
    expect(parsed.code).toBe("410233");
  });

  it.each(["41023", "4102333", "41023a", ""])(
    "rejects %s, which is not six digits",
    (code) => {
      expect(() => {
        return createSessionRequestSchema.parse({
          email: "abuela@example.com",
          code,
        });
      }).toThrow();
    },
  );
});

describe("updateMeRequestSchema", () => {
  it("leaves an omitted field absent rather than undefined", () => {
    expect(updateMeRequestSchema.parse({})).toEqual({});
  });

  it("clears the display name with null", () => {
    expect(updateMeRequestSchema.parse({ displayName: null })).toEqual({
      displayName: null,
    });
  });

  it("trims the display name", () => {
    expect(updateMeRequestSchema.parse({ displayName: "  Rosa " })).toEqual({
      displayName: "Rosa",
    });
  });

  it("rejects a display name over the cap", () => {
    expect(() => {
      return updateMeRequestSchema.parse({ displayName: "r".repeat(81) });
    }).toThrow();
  });

  it("rejects email, which is never writable anywhere", () => {
    expect(() => {
      return updateMeRequestSchema.parse({ email: "new@example.com" });
    }).toThrow();
  });

  it("rejects role, because nobody promotes themselves", () => {
    expect(() => {
      return updateMeRequestSchema.parse({ role: "admin" });
    }).toThrow();
  });

  it("requires all four switches when notify is present", () => {
    expect(() => {
      return updateMeRequestSchema.parse({ notify: { onUpload: false } });
    }).toThrow();
  });
});

describe("meDtoSchema", () => {
  it("carries the caller's own address and the raw stored name", () => {
    const parsed = meDtoSchema.parse({
      member: { memberId: MEMBER_ID, displayName: "Abuela Rosa" },
      storedDisplayName: null,
      email: "abuela@example.com",
      role: "viewer",
      notify: {
        onUpload: true,
        onComment: true,
        onReply: true,
        onRemoval: true,
      },
      joinedAt: "2026-09-27T10:00:00.000Z",
      lastSignedInAt: "2026-09-27T10:00:00.000Z",
    });
    expect(parsed.storedDisplayName).toBeNull();
  });
});

describe("listMySessionsResponseSchema", () => {
  it("is the collection envelope with a null cursor", () => {
    const parsed = listMySessionsResponseSchema.parse({
      sessions: [
        {
          sessionId: MEMBER_ID,
          deviceLabel: "iPhone, Safari",
          createdAt: "2026-09-27T10:00:00.000Z",
          lastUsedAt: "2026-09-27T10:00:00.000Z",
          expiresAt: "2026-10-27T10:00:00.000Z",
          isCurrent: true,
        },
      ],
      nextCursor: null,
    });
    expect(parsed.sessions[0]?.isCurrent).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @memory-shoebox/shared test test/auth.test.ts`
Expected: FAIL, cannot resolve `../src/auth.ts`.

- [ ] **Step 3: Write the module**

Create `packages/shared/src/auth.ts`:

```ts
import { z } from "zod";
import { collectionSchema } from "./collectionSchema.ts";
import { idSchema, memberRefSchema, timestampSchema } from "./dtos.ts";
import { LIMITS } from "./limits.ts";
import { shellSettingsSchema } from "./settings.ts";

/**
 * The authentication slice's contract: `tech-specs/apis/auth.md`.
 *
 * Surface 1 (Sign in) and surface 9 (My account). Every schema name here is
 * the one that document fixes, so the two can be read side by side.
 */

/**
 * An address as the server stores it: trimmed and lowercased before anything
 * else touches it (`auth.md`).
 *
 * The normalisation is in the schema rather than in each handler because the
 * rate limiter keys on the same normalised form, and two normalisations are
 * two chances to disagree about who has asked five times.
 */
export const normalisedEmailSchema = z
  .string()
  .transform((value) => {
    return value.trim().toLowerCase();
  })
  .pipe(z.email());

/** The strict ladder, compared in app code (`data-models.md` § `members`). */
export const memberRoleSchema = z.enum(["viewer", "uploader", "admin"]);

/** One of the three roles. */
export type MemberRole = z.infer<typeof memberRoleSchema>;

/**
 * The four switches on My account. Four boolean columns on `members`, not
 * settings rows (Decision 16).
 *
 * All four, always: requiring them whenever `notify` is present is what keeps
 * a partial write from looking like the "turn them all off" the button sends.
 */
export const notifyPreferencesSchema = z.object({
  /** Somebody puts photographs up. One email per batch. */
  onUpload: z.boolean(),
  /** Somebody comments on something they uploaded. */
  onComment: z.boolean(),
  /** Somebody comments on something they commented on. */
  onReply: z.boolean(),
  /** Stored for every role; only admins and uploaders are ever sent one. */
  onRemoval: z.boolean(),
});

/** The four switches on My account. */
export type NotifyPreferences = z.infer<typeof notifyPreferencesSchema>;

/**
 * The signed-in member's own account.
 *
 * Self-scoped, which is the only reason an email address appears in it: it is
 * the caller's own. `MemberRef` carries no email and is not widened
 * (`conventions.md` § The frozen DTOs).
 */
export const meDtoSchema = z.object({
  /** `displayName` is resolved, falling back to the email local part. */
  member: memberRefSchema,
  /** The raw column: null when none has ever been set, so the form can show
   * the fallback as a placeholder rather than as text somebody typed. */
  storedDisplayName: z.string().nullable(),
  /** Never writable, anywhere. This is the identity, not a field on it. */
  email: z.email(),
  role: memberRoleSchema,
  notify: notifyPreferencesSchema,
  /** First successful sign-in. */
  joinedAt: timestampSchema.nullable(),
  /** Written on every redemption, unlike the middleware's `lastSeenAt`. */
  lastSignedInAt: timestampSchema.nullable(),
});

/** The signed-in member's own account. */
export type MeDto = z.infer<typeof meDtoSchema>;

/** One row of `sessions`. What My account calls a device. */
export const sessionDtoSchema = z.object({
  sessionId: idSchema,
  /** "iPhone, Safari". Parsed once at creation and stored. */
  deviceLabel: z.string().min(1),
  createdAt: timestampSchema,
  /** Slides, but only when the remaining lifetime has moved by over a day. */
  lastUsedAt: timestampSchema,
  /** `lastUsedAt + 30 days`. */
  expiresAt: timestampSchema,
  /** `row.id === viewer.sessionId`, computed at the boundary. */
  isCurrent: z.boolean(),
});

/** One row of `sessions`. What My account calls a device. */
export type SessionDto = z.infer<typeof sessionDtoSchema>;

/** Body of `POST /api/auth/sign-in-codes` and its `/resend` twin. */
export const requestSignInCodeRequestSchema = z.object({
  email: normalisedEmailSchema,
});

/** Body of `POST /api/auth/sign-in-codes`. */
export type RequestSignInCodeRequest = z.infer<
  typeof requestSignInCodeRequestSchema
>;

/**
 * `202` from both mint routes.
 *
 * The echoed address proves nothing: it is the caller's own input. `expiresAt`
 * is ten minutes out and is identical whether or not the address is a member.
 */
export const requestSignInCodeResponseSchema = z.object({
  email: z.email(),
  expiresAt: timestampSchema,
});

/** `202` from both mint routes. */
export type RequestSignInCodeResponse = z.infer<
  typeof requestSignInCodeResponseSchema
>;

/** Body of `POST /api/auth/session`. */
export const createSessionRequestSchema = z.object({
  email: normalisedEmailSchema,
  /** Exactly six digits, as typed. The client strips a pasted value. */
  code: z.string().regex(/^\d{6}$/, "must be exactly six digits"),
});

/** Body of `POST /api/auth/session`. */
export type CreateSessionRequest = z.infer<typeof createSessionRequestSchema>;

/**
 * `201` from `POST /api/auth/session`.
 *
 * **It must not reveal how many items were seeded** (`auth.md`): no
 * `seededCount`, no `itemCount`, and no array whose length tracks one.
 * `isFirstSignIn` is permitted because it carries no count: it says only that
 * this member has not signed in before, which they know.
 */
export const createSessionResponseSchema = z.object({
  me: meDtoSchema,
  /** The device this request just created. `isCurrent` is always true here. */
  session: sessionDtoSchema,
  isFirstSignIn: z.boolean(),
  /** The three resolved values the shell needs (`auth.md` Ruling 1). */
  settings: shellSettingsSchema,
});

/** `201` from `POST /api/auth/session`. */
export type CreateSessionResponse = z.infer<typeof createSessionResponseSchema>;

/**
 * `200` from `GET /api/me` and from `PATCH /api/me`.
 *
 * `auth.md` writes both as a bare `MeDto`. The settings block is a sibling
 * field rather than a fourth member field, so that `MeDto` stays exactly the
 * shape that document froze and a reload has the same three values a fresh
 * sign-in does. `PATCH` answers the same shape because a mutation returns the
 * resource in its post-mutation read shape (`conventions.md` § Envelope).
 */
export const meResponseSchema = z.object({
  me: meDtoSchema,
  settings: shellSettingsSchema,
});

/** `200` from `GET /api/me` and from `PATCH /api/me`. */
export type MeResponse = z.infer<typeof meResponseSchema>;

/**
 * Body of `PATCH /api/me`. Every field is optional; an omitted field is left
 * alone.
 *
 * **Strict**: an unknown field is rejected rather than ignored, `email` and
 * `role` among them, so a client bug surfaces immediately instead of silently
 * doing nothing.
 */
export const updateMeRequestSchema = z.strictObject({
  /** Trimmed. `null` or `""` clears it back to the email local part. */
  displayName: z
    .string()
    .transform((value) => {
      return value.trim();
    })
    .pipe(z.string().max(LIMITS.memberDisplayNameMaxLength))
    .nullable()
    .optional(),
  /** All four, always, when present. There is no fifth field. */
  notify: notifyPreferencesSchema.optional(),
});

/** Body of `PATCH /api/me`. */
export type UpdateMeRequest = z.infer<typeof updateMeRequestSchema>;

/**
 * `200` from `GET /api/me/sessions`.
 *
 * `nextCursor` is always null: a member holds a handful of live devices,
 * bounded by the 30-day expiry, so there is nothing to page.
 */
export const listMySessionsResponseSchema = collectionSchema({
  resourceKey: "sessions",
  itemSchema: sessionDtoSchema,
});

/** `200` from `GET /api/me/sessions`. */
export type ListMySessionsResponse = z.infer<
  typeof listMySessionsResponseSchema
>;

/** Path parameters of `DELETE /api/me/sessions/:sessionId`. */
export const revokeMySessionParamsSchema = z.object({
  sessionId: idSchema,
});

/** Path parameters of `DELETE /api/me/sessions/:sessionId`. */
export type RevokeMySessionParams = z.infer<typeof revokeMySessionParamsSchema>;
```

- [ ] **Step 4: Export it from the barrel**

In `packages/shared/src/index.ts`, add a block in the existing style, listing
every name (no `export *`):

```ts
export {
  createSessionRequestSchema,
  createSessionResponseSchema,
  listMySessionsResponseSchema,
  meDtoSchema,
  meResponseSchema,
  memberRoleSchema,
  normalisedEmailSchema,
  notifyPreferencesSchema,
  requestSignInCodeRequestSchema,
  requestSignInCodeResponseSchema,
  revokeMySessionParamsSchema,
  sessionDtoSchema,
  updateMeRequestSchema,
  type CreateSessionRequest,
  type CreateSessionResponse,
  type ListMySessionsResponse,
  type MeDto,
  type MemberRole,
  type MeResponse,
  type NotifyPreferences,
  type RequestSignInCodeRequest,
  type RequestSignInCodeResponse,
  type RevokeMySessionParams,
  type SessionDto,
  type UpdateMeRequest,
} from "./auth.ts";
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @memory-shoebox/shared test`
Expected: PASS.

If `.transform(...).pipe(...)` on `displayName` rejects `null` before the
transform runs, the order is wrong: `.nullable()` must wrap the pipe, which is
what is written above. Do not "fix" it by dropping the trim.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/auth.ts packages/shared/src/index.ts packages/shared/test/auth.test.ts
git commit -m "feat(shared): the authentication slice's schemas"
```

---

## Task 3: Two named refusals on `ApiError`

**Files:**

- Modify: `apps/server/src/http/ApiError.ts`
- Test: `apps/server/test/http/ApiError.test.ts` (exists; add to it)

- [ ] **Step 1: Write the failing test**

Append to `apps/server/test/http/ApiError.test.ts`:

```ts
describe("signInCodeInvalid", () => {
  it("is a 401 that is not not_signed_in, carrying the tries left", () => {
    const error = ApiError.signInCodeInvalid(2);
    expect(error.statusCode).toBe(401);
    expect(error.code).toBe("sign_in_code_invalid");
    expect(error.details).toEqual({ attemptsRemaining: 2 });
  });
});

describe("signInCodeAttemptsExhausted", () => {
  it("is a 410 whose message says a new code is on its way", () => {
    const error = ApiError.signInCodeAttemptsExhausted();
    expect(error.statusCode).toBe(410);
    expect(error.code).toBe("sign_in_code_attempts_exhausted");
    expect(error.message).toMatch(/on its way/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @memory-shoebox/server test test/http/ApiError.test.ts`
Expected: FAIL, `ApiError.signInCodeInvalid is not a function`.

- [ ] **Step 3: Add the constructors**

In `apps/server/src/http/ApiError.ts`, after `notSignedIn`:

```ts
  /**
   * `401`: a live code exists, the digits are wrong, and there are tries left.
   *
   * A 401 that is deliberately not `not_signed_in`: the client shows the
   * "Two tries left" copy from `attemptsRemaining`, which is read off the row
   * after the increment rather than computed from a constant.
   */
  static signInCodeInvalid(attemptsRemaining: number): ApiError {
    return new ApiError({
      statusCode: 401,
      code: "sign_in_code_invalid",
      message: "That is not the code we sent.",
      details: { attemptsRemaining },
    });
  }

  /**
   * `410`: that wrong attempt was the last one, and a replacement has been
   * issued.
   *
   * The message says so because the copy promises it: "Two tries left before
   * we send you a new one" (`auth.md` Ruling 2). A `410` whose body did not
   * say it would leave the status and the interface disagreeing.
   */
  static signInCodeAttemptsExhausted(): ApiError {
    return new ApiError({
      statusCode: 410,
      code: "sign_in_code_attempts_exhausted",
      message: "That was the last try. A new code is on its way.",
    });
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @memory-shoebox/server test test/http/ApiError.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/http/ApiError.ts apps/server/test/http/ApiError.test.ts
git commit -m "feat(server): the two refusals the sign-in code path needs"
```

---

## Task 4: `publicReadPerIp`

**Files:**

- Modify: `apps/server/src/http/rateLimit/rateLimit.constants.ts`
- Test: `apps/server/test/http/rateLimit/registerRateLimit.test.ts` (exists;
  add to it)

- [ ] **Step 1: Write the failing test**

Append to `apps/server/test/http/rateLimit/registerRateLimit.test.ts`, using
whatever app-building helper that file already uses for its other rules (read
it first and follow it exactly):

```ts
describe("publicReadPerIp", () => {
  it("allows a page reload far more often than a sign-in code", () => {
    expect(RATE_LIMIT_RULES.publicReadPerIp).toEqual({
      scope: "ip",
      windows: [{ limit: 120, windowSeconds: 60 }],
    });
  });
});
```

Import `RATE_LIMIT_RULES` from
`../../../src/http/rateLimit/rateLimit.constants.ts` if the file does not
already.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @memory-shoebox/server test test/http/rateLimit/registerRateLimit.test.ts`
Expected: FAIL, `publicReadPerIp` does not exist on the rules object.

- [ ] **Step 3: Add the rule**

In `rateLimit.constants.ts`, add `"publicReadPerIp"` to `RULE_NAMES` and to
`RATE_LIMIT_RULES`:

```ts
  /**
   * `GET /api/public-settings`, the one route an unauthenticated visitor can
   * call repeatedly.
   *
   * **An addition to `conventions.md` § Rate limits**, recorded the way
   * `auth.md` records the shared address bucket. `administration.md` says this
   * route "takes the per-IP bucket", and the only per-IP row in that table is
   * twenty an hour, which is a cap on mail somebody can aim at an inbox. This
   * route renders the sign-in page's top bar, so twenty an hour would lock out
   * anybody who reloads a slow page. The document's intent, that the anonymous
   * read has a cap, is kept; its number, aimed at a different route, is not.
   */
  publicReadPerIp: {
    scope: "ip",
    windows: [{ limit: 120, windowSeconds: 60 }],
  },
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @memory-shoebox/server test test/http/rateLimit/registerRateLimit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/http/rateLimit/rateLimit.constants.ts apps/server/test/http/rateLimit/registerRateLimit.test.ts
git commit -m "feat(server): a per-IP cap the sign-in page can survive"
```

---

## Task 5: The sign-in code pepper

**Files:**

- Modify: `apps/server/src/config.ts`
- Modify: `apps/server/.env.example`
- Test: `apps/server/test/config.test.ts` (exists; add to it)

`data-models.md` § `sign_in_codes` puts the pepper "in the app config", and the
config has none. It has `SESSION_SECRET`, documented as encrypting the login
cookie and read by nothing: the contract's cookie is 256 bits of CSPRNG output
whose SHA-256 is stored in `sessions`, so there is no cookie to sign.

- [ ] **Step 1: Write the failing test**

Append to `apps/server/test/config.test.ts`:

```ts
describe("signInCodePepper", () => {
  it("is 32 bytes derived from the session secret", () => {
    const config = parseConfig({ ...VALID_ENVIRONMENT });
    expect(config.signInCodePepper).toHaveLength(32);
  });

  it("is the same for the same secret", () => {
    const first = parseConfig({ ...VALID_ENVIRONMENT });
    const second = parseConfig({ ...VALID_ENVIRONMENT });
    expect(first.signInCodePepper.equals(second.signInCodePepper)).toBe(true);
  });

  it("is not the secret itself, and differs with it", () => {
    const config = parseConfig({ ...VALID_ENVIRONMENT });
    const other = parseConfig({
      ...VALID_ENVIRONMENT,
      SESSION_SECRET: "b".repeat(32),
    });
    expect(config.signInCodePepper.toString("utf8")).not.toBe(
      config.sessionSecret,
    );
    expect(config.signInCodePepper.equals(other.signInCodePepper)).toBe(false);
  });
});
```

Read the top of `config.test.ts` first: it already builds a valid environment
for its other cases. Reuse that object rather than adding a second one, and
name it `VALID_ENVIRONMENT` if it has no name yet.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @memory-shoebox/server test test/config.test.ts`
Expected: FAIL, `signInCodePepper` is undefined.

- [ ] **Step 3: Derive it**

In `apps/server/src/config.ts`, add the import and the helper:

```ts
import { hkdfSync } from "node:crypto";
```

```ts
/**
 * The pepper every sign-in code is HMAC'd with, derived from the one secret a
 * self-hoster generates.
 *
 * `data-models.md` § `sign_in_codes` explains what it buys: six digits is a
 * 10^6 space, so a leaked table of plain SHA-256 hashes is reversed instantly
 * with a rainbow table of a million entries, and a read-only database leak (a
 * copied volume, a stray backup) yields nothing without this value.
 *
 * Derived rather than used raw so that a later use of `SESSION_SECRET` for
 * something else cannot also be a use of the pepper. Rotating the secret
 * invalidates every live code, which last ten minutes, and no session, because
 * a session is a row rather than a signed token.
 */
function _makeSignInCodePepperFromSecret(secret: string): Buffer {
  return Buffer.from(
    hkdfSync("sha256", secret, "", "memory-shoebox:sign-in-code-pepper", 32),
  );
}
```

Add the field to `Config`, correcting the neighbouring comment:

```ts
/**
 * The one secret a self-hoster generates. At least 32 characters.
 *
 * It protects sign-in codes rather than the session cookie: the cookie is an
 * opaque random token whose SHA-256 is a row in `sessions`, so nothing about
 * it is signed or encrypted.
 */
sessionSecret: string;
/** `HKDF-SHA256(sessionSecret)`. Never logged, never served. */
signInCodePepper: Buffer;
```

And in the returned object, after `sessionSecret`:

```ts
    signInCodePepper: _makeSignInCodePepperFromSecret(parsed.SESSION_SECRET),
```

- [ ] **Step 4: Correct `.env.example`**

Replace the `# --- Sessions ---` block's body with:

```
# The one secret this instance needs. Must be at least 32 characters.
# Generate one with: openssl rand -hex 32
#
# It protects the six-digit sign-in codes: they are stored as an HMAC under a
# pepper derived from this value, so a copied database file is worth nothing
# during the ten minutes a code is alive. The session cookie is not encrypted
# with it, and does not need to be: the cookie is an opaque random token whose
# only meaning is a row in the database.
#
# Changing it invalidates every live sign-in code and no session.
SESSION_SECRET=
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @memory-shoebox/server test test/config.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/config.ts apps/server/.env.example apps/server/test/config.test.ts
git commit -m "feat(server): the pepper sign-in codes are stored under"
```

---

## Task 6: The session cookie

**Files:**

- Create: `apps/server/src/auth/sessionCookie.ts`
- Test: `apps/server/test/auth/sessionCookie.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/server/test/auth/sessionCookie.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  SESSION_COOKIE_NAME,
  clearSessionCookie,
  getSessionTokenFromRequest,
  setSessionCookie,
} from "../../src/auth/sessionCookie.ts";

/** A request carrying whatever `Cookie` header a test wants to present. */
function _requestWithCookie(cookie: string | undefined): FastifyRequest {
  return { headers: { cookie } } as unknown as FastifyRequest;
}

/** A reply that records the headers it was given. */
function _recordingReply(): {
  reply: FastifyReply;
  headers: Record<string, string>;
} {
  const headers: Record<string, string> = {};
  const reply = {
    header: (name: string, value: string) => {
      headers[name] = value;
      return reply;
    },
  } as unknown as FastifyReply;
  return { reply, headers };
}

describe("getSessionTokenFromRequest", () => {
  it("finds the cookie among others", () => {
    const request = _requestWithCookie(
      `theme=dark; ${SESSION_COOKIE_NAME}=abc123; locale=es`,
    );
    expect(getSessionTokenFromRequest(request)).toBe("abc123");
  });

  it("is undefined when no cookie header was sent at all", () => {
    expect(
      getSessionTokenFromRequest(_requestWithCookie(undefined)),
    ).toBeUndefined();
  });

  it("is undefined when the header carries other cookies only", () => {
    expect(
      getSessionTokenFromRequest(_requestWithCookie("theme=dark")),
    ).toBeUndefined();
  });

  it("is undefined for an empty value rather than an empty string", () => {
    const request = _requestWithCookie(`${SESSION_COOKIE_NAME}=`);
    expect(getSessionTokenFromRequest(request)).toBeUndefined();
  });

  it("does not match a cookie whose name merely ends with ours", () => {
    const request = _requestWithCookie(`not_shoebox_session=abc123`);
    expect(getSessionTokenFromRequest(request)).toBeUndefined();
  });
});

describe("setSessionCookie", () => {
  it("carries every attribute the contract fixes", () => {
    const { reply, headers } = _recordingReply();
    setSessionCookie({ reply, token: "abc123" });
    expect(headers["set-cookie"]).toBe(
      "shoebox_session=abc123; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000",
    );
  });
});

describe("clearSessionCookie", () => {
  it("repeats the attributes, or the browser keeps the cookie", () => {
    const { reply, headers } = _recordingReply();
    clearSessionCookie(reply);
    expect(headers["set-cookie"]).toBe(
      "shoebox_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @memory-shoebox/server test test/auth/sessionCookie.test.ts`
Expected: FAIL, cannot resolve `../../src/auth/sessionCookie.ts`.

- [ ] **Step 3: Write the module**

Create `apps/server/src/auth/sessionCookie.ts`:

```ts
import type { FastifyReply, FastifyRequest } from "fastify";

/**
 * The one cookie in the product (`conventions.md` § The auth middleware).
 *
 * Read and written here rather than through `@fastify/cookie`, which would be
 * a dependency, a plugin registration and a signing facility this product must
 * not use, for the twenty lines below. The value is opaque: 256 bits of CSPRNG
 * output whose SHA-256 is a row in `sessions`, so there is nothing to sign.
 */

/** The cookie's name. */
export const SESSION_COOKIE_NAME = "shoebox_session";

/** Thirty days, which is what `conventions.md` fixes as its `Max-Age`. */
const SESSION_COOKIE_MAX_AGE_SECONDS = 2_592_000;

/**
 * The attributes, written once.
 *
 * `Secure` is unconditional, including in development: browsers treat
 * `http://localhost` as a secure context, so the local flow works, and a
 * conditional attribute would mean development exercises a different cookie
 * from the one production sets. One origin serves both the app and the API
 * (`docs/architecture.md`), so `SameSite=Lax` costs nothing.
 */
const COOKIE_ATTRIBUTES = "Path=/; HttpOnly; Secure; SameSite=Lax";

/** The session cookie this request presented, or undefined. */
export function getSessionTokenFromRequest(
  request: FastifyRequest,
): string | undefined {
  const header = request.headers.cookie;
  if (header === undefined) {
    return undefined;
  }
  const prefix = `${SESSION_COOKIE_NAME}=`;
  const pair = header
    .split(";")
    .map((part) => {
      return part.trim();
    })
    .find((part) => {
      return part.startsWith(prefix);
    });
  if (pair === undefined) {
    return undefined;
  }
  const value = decodeURIComponent(pair.slice(prefix.length));
  // An empty value is a cleared cookie a browser is still sending. It is not a
  // token, and treating it as one would send an empty string to the lookup.
  return value === "" ? undefined : value;
}

/**
 * Sets the session cookie for thirty days.
 *
 * @param options.reply The reply to write the header on.
 * @param options.token The cookie value, as `createSessionToken` minted it.
 */
export function setSessionCookie(options: {
  reply: FastifyReply;
  token: string;
}): void {
  void options.reply.header(
    "set-cookie",
    `${SESSION_COOKIE_NAME}=${options.token}; ${COOKIE_ATTRIBUTES}; Max-Age=${SESSION_COOKIE_MAX_AGE_SECONDS}`,
  );
}

/**
 * Clears the session cookie.
 *
 * The attributes are repeated deliberately: a browser ignores a `Set-Cookie`
 * that does not match the original on `Path` and `Secure`, which would leave
 * the device holding a cookie the server has already deleted the row for.
 */
export function clearSessionCookie(reply: FastifyReply): void {
  void reply.header(
    "set-cookie",
    `${SESSION_COOKIE_NAME}=; ${COOKIE_ATTRIBUTES}; Max-Age=0`,
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @memory-shoebox/server test test/auth/sessionCookie.test.ts`
Expected: PASS, seven cases.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/auth/sessionCookie.ts apps/server/test/auth/sessionCookie.test.ts
git commit -m "feat(server): the session cookie, read and written in one place"
```

---

## Task 7: The session token and its hash

**Files:**

- Create: `apps/server/src/auth/sessionToken.ts`
- Test: `apps/server/test/auth/sessionToken.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/server/test/auth/sessionToken.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  createSessionToken,
  makeTokenHashFromToken,
} from "../../src/auth/sessionToken.ts";

describe("createSessionToken", () => {
  it("is 256 bits, url-safe, and never the same twice", () => {
    const token = createSessionToken();
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token).not.toBe(createSessionToken());
  });
});

describe("makeTokenHashFromToken", () => {
  it("is a stable 64-character hex digest", () => {
    expect(makeTokenHashFromToken("abc123")).toHaveLength(64);
    expect(makeTokenHashFromToken("abc123")).toBe(
      makeTokenHashFromToken("abc123"),
    );
  });

  it("is not the token", () => {
    expect(makeTokenHashFromToken("abc123")).not.toContain("abc123");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @memory-shoebox/server test test/auth/sessionToken.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the module**

Create `apps/server/src/auth/sessionToken.ts`:

```ts
import { createHash, randomBytes } from "node:crypto";

/**
 * Mints a session cookie value: 256 bits of CSPRNG output.
 *
 * `base64url` because the value travels in a cookie, where the alphabet
 * matters and percent-encoding a `+` or a `/` is one more thing to get wrong.
 */
export function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * The `sessions.token_hash` for a cookie value.
 *
 * A fast hash is correct here, and deliberately different from what
 * `sign_in_codes` does: the token has real entropy, so there is nothing to
 * enumerate, whereas six digits is a space of a million and needs the pepper
 * (`data-models.md` § `sessions`).
 */
export function makeTokenHashFromToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @memory-shoebox/server test test/auth/sessionToken.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/auth/sessionToken.ts apps/server/test/auth/sessionToken.test.ts
git commit -m "feat(server): the session token and the hash that is stored"
```

---

## Task 8: The six digits, their HMAC, and the compare

**Files:**

- Create: `apps/server/src/auth/auth.constants.ts`
- Create: `apps/server/src/auth/signInCodeHelpers.ts`
- Test: `apps/server/test/auth/signInCodeHelpers.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/server/test/auth/signInCodeHelpers.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  createSignInCodeDigits,
  isMatchingCodeHash,
  makeCodeHashFromDigits,
} from "../../src/auth/signInCodeHelpers.ts";

const PEPPER = Buffer.from("a".repeat(64), "hex");
const OTHER_PEPPER = Buffer.from("b".repeat(64), "hex");

describe("createSignInCodeDigits", () => {
  it("is always exactly six digits, including the low ones", () => {
    const codes = Array.from({ length: 200 }, () => {
      return createSignInCodeDigits();
    });
    codes.forEach((code) => {
      expect(code).toMatch(/^\d{6}$/);
    });
  });

  it("does not repeat itself over two hundred draws", () => {
    const codes = new Set(
      Array.from({ length: 200 }, () => {
        return createSignInCodeDigits();
      }),
    );
    expect(codes.size).toBeGreaterThan(150);
  });
});

describe("makeCodeHashFromDigits", () => {
  it("is stable for the same digits and pepper", () => {
    expect(makeCodeHashFromDigits({ digits: "410233", pepper: PEPPER })).toBe(
      makeCodeHashFromDigits({ digits: "410233", pepper: PEPPER }),
    );
  });

  it("is not the digits, and is not a bare SHA-256 of them", () => {
    const hash = makeCodeHashFromDigits({ digits: "410233", pepper: PEPPER });
    expect(hash).not.toContain("410233");
    expect(hash).not.toBe(
      makeCodeHashFromDigits({ digits: "410233", pepper: OTHER_PEPPER }),
    );
  });
});

describe("isMatchingCodeHash", () => {
  it("accepts two hashes of the same digits", () => {
    const stored = makeCodeHashFromDigits({ digits: "410233", pepper: PEPPER });
    const submitted = makeCodeHashFromDigits({
      digits: "410233",
      pepper: PEPPER,
    });
    expect(isMatchingCodeHash({ left: stored, right: submitted })).toBe(true);
  });

  it("rejects a different code", () => {
    const stored = makeCodeHashFromDigits({ digits: "410233", pepper: PEPPER });
    const submitted = makeCodeHashFromDigits({
      digits: "000000",
      pepper: PEPPER,
    });
    expect(isMatchingCodeHash({ left: stored, right: submitted })).toBe(false);
  });

  it("returns false rather than throwing on a malformed stored hash", () => {
    const stored = makeCodeHashFromDigits({ digits: "410233", pepper: PEPPER });
    expect(isMatchingCodeHash({ left: "not-hex", right: stored })).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @memory-shoebox/server test test/auth/signInCodeHelpers.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the constants**

Create `apps/server/src/auth/auth.constants.ts`:

```ts
/**
 * The numbers the sign-in path is built from, each stated in the interface or
 * the email and therefore written once.
 */

/** Ten minutes, stated in the UI and in the email. */
export const SIGN_IN_CODE_LIFETIME_MINUTES = 10;

/**
 * Three tries. Stored on the row as `max_attempts`, so "two tries left" is
 * computable from the row and a change here does not retroactively burn a live
 * code (`data-models.md` § `sign_in_codes`).
 */
export const SIGN_IN_CODE_MAX_ATTEMPTS = 3;

/** Thirty days idle, which is what a device's "Stays until" counts down. */
export const SESSION_LIFETIME_DAYS = 30;

/**
 * The slide threshold: `sessions.last_used_at`, `sessions.expires_at` and
 * `members.last_seen_at` move only when the remaining lifetime has moved by
 * more than this (`conventions.md` § The auth middleware).
 *
 * Without it, one timeline page of thumbnails is dozens of writes serialising
 * on SQLite's single writer.
 */
export const SESSION_SLIDE_THRESHOLD_MS = 24 * 60 * 60 * 1000;
```

- [ ] **Step 4: Write the helpers**

Create `apps/server/src/auth/signInCodeHelpers.ts`:

```ts
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

/** Six digits from a CSPRNG, zero-padded so 42 is `000042`. */
export function createSignInCodeDigits(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/**
 * The `sign_in_codes.code_hash` for six digits.
 *
 * `HMAC-SHA256(digits, pepper)` rather than a bare digest: six digits is a
 * space of 10^6, so a leaked table of plain SHA-256 hashes is reversed
 * instantly with a rainbow table of a million entries. The pepper lives in the
 * app config, so a read-only database leak yields nothing during the ten
 * minutes a code is alive (`data-models.md` § `sign_in_codes`).
 *
 * @param options.digits The six digits, as typed or as minted.
 * @param options.pepper `config.signInCodePepper`.
 */
export function makeCodeHashFromDigits(options: {
  digits: string;
  pepper: Buffer;
}): string {
  return createHmac("sha256", options.pepper)
    .update(options.digits)
    .digest("hex");
}

/**
 * Compares two hex hashes in constant time.
 *
 * The comparison is length-independent because both sides are hashes of the
 * same width, which is the reason the submitted digits are hashed before
 * anything is compared rather than after.
 *
 * A stored value that is not hex returns false rather than throwing: a corrupt
 * row must refuse a sign-in, not crash the route.
 */
export function isMatchingCodeHash(options: {
  left: string;
  right: string;
}): boolean {
  const left = Buffer.from(options.left, "hex");
  const right = Buffer.from(options.right, "hex");
  if (left.length === 0 || left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @memory-shoebox/server test test/auth/signInCodeHelpers.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/auth/auth.constants.ts apps/server/src/auth/signInCodeHelpers.ts apps/server/test/auth/signInCodeHelpers.test.ts
git commit -m "feat(server): six digits, their pepper, and a constant-time compare"
```

---

## Task 9: The device label

**Files:**

- Create: `apps/server/src/auth/getDeviceLabelFromUserAgent.ts`
- Test: `apps/server/test/auth/getDeviceLabelFromUserAgent.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/server/test/auth/getDeviceLabelFromUserAgent.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getDeviceLabelFromUserAgent } from "../../src/auth/getDeviceLabelFromUserAgent.ts";

/**
 * The strings these browsers actually send. The nesting is the whole point:
 * Edge claims Chrome, Chrome claims Safari, and Samsung Internet claims both,
 * so the order the patterns are tried in is what makes the label right.
 */
const USER_AGENTS = [
  {
    label: "iPhone, Safari",
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  },
  {
    label: "iPhone, Chrome",
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/125.0.6422.80 Mobile/15E148 Safari/604.1",
  },
  {
    label: "iPad, Safari",
    userAgent:
      "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  },
  {
    label: "Mac, Safari",
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  },
  {
    label: "Windows, Edge",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0",
  },
  {
    label: "Windows, Firefox",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0",
  },
  {
    label: "Android, Chrome",
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36",
  },
  {
    label: "Android, Samsung Internet",
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36",
  },
] as const;

describe("getDeviceLabelFromUserAgent", () => {
  it.each(USER_AGENTS)("reads $label", ({ label, userAgent }) => {
    expect(getDeviceLabelFromUserAgent(userAgent)).toBe(label);
  });

  it("names the device when it recognises only the platform", () => {
    expect(
      getDeviceLabelFromUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X)"),
    ).toBe("Mac");
  });

  it("falls back to the raw string when it recognises neither half", () => {
    expect(getDeviceLabelFromUserAgent("curl/8.4.0")).toBe("curl/8.4.0");
  });

  it("truncates a long unrecognised string", () => {
    expect(getDeviceLabelFromUserAgent("x".repeat(400))).toHaveLength(80);
  });

  it("names something rather than nothing when there is no header", () => {
    expect(getDeviceLabelFromUserAgent(undefined)).toBe("Unknown device");
    expect(getDeviceLabelFromUserAgent("   ")).toBe("Unknown device");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @memory-shoebox/server test test/auth/getDeviceLabelFromUserAgent.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the parser**

Create `apps/server/src/auth/getDeviceLabelFromUserAgent.ts`:

```ts
/**
 * "iPhone, Safari" from a `User-Agent`.
 *
 * Parsed once at sign-in and stored on the row, so that an upgraded parser
 * never relabels a device somebody already recognises
 * (`data-models.md` § `sessions`). The raw string is stored beside it as the
 * fallback and is never serialised in any payload.
 *
 * Hand-rolled rather than a dependency: the output is two tokens, it has a
 * stored fallback when it is wrong, and its only job is to be recognisable to
 * the person holding the device. No IP address and no location: a device row is
 * a label and two timestamps, and that is the whole of it (Decision 6).
 */

/** Platform tokens, most specific first: an iPhone claims "like Mac OS X". */
const PLATFORMS = [
  { pattern: /iPhone/, label: "iPhone" },
  { pattern: /iPad/, label: "iPad" },
  { pattern: /Android/, label: "Android" },
  { pattern: /CrOS/, label: "Chromebook" },
  { pattern: /Macintosh|Mac OS X/, label: "Mac" },
  { pattern: /Windows/, label: "Windows" },
  { pattern: /Linux|X11/, label: "Linux" },
] as const;

/**
 * Browser tokens, most specific first.
 *
 * The order is the whole of this parser's cleverness. Edge sends `Edg/` and
 * also `Chrome/` and `Safari/`; Samsung Internet sends `SamsungBrowser/` and
 * both of those; Chrome sends `Safari/`; and on iOS, Chrome and Firefox send
 * `CriOS/` and `FxiOS/` while still claiming Safari.
 */
const BROWSERS = [
  { pattern: /Edg[A-Za-z]*\//, label: "Edge" },
  { pattern: /SamsungBrowser\//, label: "Samsung Internet" },
  { pattern: /OPR\/|Opera/, label: "Opera" },
  { pattern: /FxiOS\/|Firefox\//, label: "Firefox" },
  { pattern: /CriOS\/|Chrome\//, label: "Chrome" },
  { pattern: /Safari\//, label: "Safari" },
] as const;

/** Long enough to recognise an unparsed client, short enough for a table. */
const MAX_RAW_LABEL_LENGTH = 80;

/** What a row says when there was no `User-Agent` header at all. */
const UNKNOWN_DEVICE_LABEL = "Unknown device";

/** The first label whose pattern the string matches, or undefined. */
function _getLabelFromPatterns(options: {
  userAgent: string;
  patterns: readonly { pattern: RegExp; label: string }[];
}): string | undefined {
  return options.patterns.find((candidate) => {
    return candidate.pattern.test(options.userAgent);
  })?.label;
}

/**
 * Turns a `User-Agent` into the stored `device_label`.
 *
 * @param userAgent The header, or undefined when none was sent.
 * @returns "iPhone, Safari", one half of it, the truncated raw string, or
 *   "Unknown device". Never an empty string: the column is `NOT NULL`.
 */
export function getDeviceLabelFromUserAgent(
  userAgent: string | undefined,
): string {
  const raw = (userAgent ?? "").trim();
  if (raw === "") {
    return UNKNOWN_DEVICE_LABEL;
  }

  const platform = _getLabelFromPatterns({
    userAgent: raw,
    patterns: PLATFORMS,
  });
  const browser = _getLabelFromPatterns({ userAgent: raw, patterns: BROWSERS });

  if (platform !== undefined && browser !== undefined) {
    return `${platform}, ${browser}`;
  }
  return platform ?? browser ?? raw.slice(0, MAX_RAW_LABEL_LENGTH);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @memory-shoebox/server test test/auth/getDeviceLabelFromUserAgent.test.ts`
Expected: PASS, thirteen cases.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/auth/getDeviceLabelFromUserAgent.ts apps/server/test/auth/getDeviceLabelFromUserAgent.test.ts
git commit -m "feat(server): the two words a device is recognised by"
```

---

## Task 10: `BEGIN IMMEDIATE`, and ids minted in SQL

**Files:**

- Create: `apps/server/src/db/runInImmediateTransaction.ts`
- Modify: `apps/server/src/db/client.ts`
- Test: `apps/server/test/db/runInImmediateTransaction.test.ts`
- Test: `apps/server/test/db/createIdFunction.test.ts`

Two small database facilities the sign-in path needs and nothing else
provides. Kysely's SQLite dialect issues a deferred `BEGIN`, which takes its
write lock only at the first write, so two readers can both pass the attempt
check before either writes. And `item_views.id` is a uuid column with no
default, so the first-sign-in seed cannot be one `INSERT ... SELECT` unless
SQL itself can mint an id.

- [ ] **Step 1: Write the failing tests**

Create `apps/server/test/db/runInImmediateTransaction.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { runInImmediateTransaction } from "../../src/db/runInImmediateTransaction.ts";
import { insertMember } from "../helpers/seedHelpers.ts";

describe("runInImmediateTransaction", () => {
  it("commits the writes and returns the callback's value", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);

    const memberId = await runInImmediateTransaction({
      database,
      callback: async (transaction) => {
        return insertMember(transaction, { email: "rosa@example.com" });
      },
    });

    const rows = await database.selectFrom("members").select("id").execute();
    expect(rows).toEqual([{ id: memberId }]);
    await database.destroy();
  });

  it("rolls everything back when the callback throws", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);

    await expect(
      runInImmediateTransaction({
        database,
        callback: async (transaction) => {
          await insertMember(transaction, { email: "rosa@example.com" });
          throw new Error("no");
        },
      }),
    ).rejects.toThrow("no");

    const rows = await database.selectFrom("members").select("id").execute();
    expect(rows).toEqual([]);
    await database.destroy();
  });

  it("leaves the handle usable afterwards", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);

    await runInImmediateTransaction({
      database,
      callback: async (transaction) => {
        return insertMember(transaction, { email: "one@example.com" });
      },
    });
    await runInImmediateTransaction({
      database,
      callback: async (transaction) => {
        return insertMember(transaction, { email: "two@example.com" });
      },
    });

    const rows = await database.selectFrom("members").select("id").execute();
    expect(rows).toHaveLength(2);
    await database.destroy();
  });
});
```

Create `apps/server/test/db/createIdFunction.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { sql } from "kysely";
import { z } from "zod";
import { createDatabase } from "../../src/db/client.ts";

describe("the create_id() SQL function", () => {
  it("mints a uuid the contract's own id schema accepts", async () => {
    const database = createDatabase(":memory:");
    const result = await sql<{ id: string }>`select create_id() as id`.execute(
      database,
    );
    expect(z.uuid().safeParse(result.rows[0]?.id).success).toBe(true);
    await database.destroy();
  });

  it("mints a different id per row, which is what the seed needs", async () => {
    const database = createDatabase(":memory:");
    const result = await sql<{ id: string }>`
      select create_id() as id from (select 1 union all select 2 union all select 3)
    `.execute(database);
    expect(
      new Set(
        result.rows.map((row) => {
          return row.id;
        }),
      ).size,
    ).toBe(3);
    await database.destroy();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @memory-shoebox/server test test/db/`
Expected: FAIL: module not found, and `no such function: create_id`.

- [ ] **Step 3: Write the transaction helper**

Create `apps/server/src/db/runInImmediateTransaction.ts`:

```ts
import { sql, type Kysely } from "kysely";
import type { Database } from "./types/db.types.ts";

/**
 * Runs `callback` inside a `BEGIN IMMEDIATE` transaction.
 *
 * **Kysely's own `transaction()` is not enough here.** Its SQLite dialect
 * issues a deferred `BEGIN`, which takes the write lock at the first write, so
 * two submissions of the same sign-in code can both read `attempts = 0` before
 * either increments it and each gets three tries. `data-models.md`
 * § `sign_in_codes` requires one transaction for exactly this reason, and
 * `IMMEDIATE` is what makes it one: the lock is taken at the start.
 *
 * `connection()` is what pins every statement, including the `BEGIN`, to a
 * single connection.
 *
 * @param options.database The Kysely handle.
 * @param options.callback Receives a handle bound to the transaction. Use it,
 *   not the outer handle, or the write lands outside the transaction.
 * @returns Whatever the callback returned, once committed.
 */
export async function runInImmediateTransaction<Result>(options: {
  database: Kysely<Database>;
  callback: (transaction: Kysely<Database>) => Promise<Result>;
}): Promise<Result> {
  return options.database.connection().execute(async (connection) => {
    await sql`begin immediate`.execute(connection);
    try {
      const result = await options.callback(connection);
      await sql`commit`.execute(connection);
      return result;
    } catch (error) {
      await sql`rollback`.execute(connection);
      throw error;
    }
  });
}
```

- [ ] **Step 4: Register the SQL function**

In `apps/server/src/db/client.ts`, import `createId` and register the function
just after the two pragmas:

```ts
import { createId } from "./createId.ts";
```

```ts
// **The first-sign-in seed is why this exists.** Decision 3 seeds one
// `item_views` row per existing item for a brand-new member, and `auth.md`
// requires it to be one `INSERT ... SELECT`: a uuid minted per row in
// application code turns one statement into roughly 17,000 round trips.
// `item_views.id` is a uuid column with no default, so SQL has to be able to
// mint one. It is `createId()` itself, so there is still one generator.
sqlite.function("create_id", { deterministic: false }, () => {
  return createId();
});
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @memory-shoebox/server test test/db/`
Expected: PASS, five cases.

If `sql\`begin immediate\``is rejected by better-sqlite3's prepared-statement
path, use`sql.raw("begin immediate").execute(connection)`rather than
abandoning`IMMEDIATE`: the lock is the point of the helper.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/db/runInImmediateTransaction.ts apps/server/src/db/client.ts apps/server/test/db/
git commit -m "feat(server): the write lock the code path needs, and ids SQL can mint"
```

---

## Task 11: The visibility expansion

**Files:**

- Create: `apps/server/src/visibility/getVisibleRuleIdsFromMemberId.ts`
- Modify: `apps/server/test/helpers/seedHelpers.ts`
- Test: `apps/server/test/visibility/getVisibleRuleIdsFromMemberId.test.ts`

- [ ] **Step 1: Add the seed helpers this and the next four tasks need**

Append to `apps/server/test/helpers/seedHelpers.ts`:

```ts
/** Inserts one visibility rule and returns its id. */
export async function insertVisibilityRule(
  database: Kysely<Database>,
  options: { mode: "everyone" | "only" | "except" } & Partial<
    Database["visibility_rules"]
  >,
): Promise<string> {
  const { mode, ...overrides } = options;
  const id = overrides.id ?? createId();
  await database
    .insertInto("visibility_rules")
    .values({
      id,
      mode,
      // Any distinct string: the digest's index is deliberately not unique,
      // and nothing in this slice reads it.
      subject_digest: `digest-${id}`,
      created_at: NOW,
      ...overrides,
    })
    .execute();
  return id;
}

/** Names one member or one group as a rule's subject. */
export async function insertVisibilityRuleSubject(
  database: Kysely<Database>,
  options: { ruleId: string; memberId?: string; groupId?: string },
): Promise<string> {
  const id = createId();
  await database
    .insertInto("visibility_rule_subjects")
    .values({
      id,
      rule_id: options.ruleId,
      subject_type: options.memberId === undefined ? "group" : "member",
      member_id: options.memberId ?? null,
      group_id: options.groupId ?? null,
    })
    .execute();
  return id;
}

/** Inserts one group and returns its id. */
export async function insertGroup(
  database: Kysely<Database>,
  options: { name: string } & Partial<Database["groups"]> = { name: "Cousins" },
): Promise<string> {
  const { name, ...overrides } = options;
  const id = overrides.id ?? createId();
  await database
    .insertInto("groups")
    .values({
      id,
      name,
      name_normalized: name.trim().toLowerCase(),
      created_at: NOW,
      ...overrides,
    })
    .execute();
  return id;
}

/** Puts one member in one group. */
export async function insertGroupMember(
  database: Kysely<Database>,
  options: { groupId: string; memberId: string },
): Promise<string> {
  const id = createId();
  await database
    .insertInto("group_members")
    .values({
      id,
      group_id: options.groupId,
      member_id: options.memberId,
      created_at: NOW,
    })
    .execute();
  return id;
}
```

- [ ] **Step 2: Write the failing test**

Create `apps/server/test/visibility/getVisibleRuleIdsFromMemberId.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import type { Kysely } from "kysely";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import type { Database } from "../../src/db/types/db.types.ts";
import { getVisibleRuleIdsFromMemberId } from "../../src/visibility/getVisibleRuleIdsFromMemberId.ts";
import { EVERYONE_VISIBILITY_RULE_ID } from "../../src/visibility/everyoneRule.ts";
import {
  insertGroup,
  insertGroupMember,
  insertMember,
  insertVisibilityRule,
  insertVisibilityRuleSubject,
} from "../helpers/seedHelpers.ts";

describe("getVisibleRuleIdsFromMemberId", () => {
  let database: Kysely<Database>;

  beforeEach(async () => {
    database = createDatabase(":memory:");
    await migrateToLatest(database);
  });

  it("always includes the seeded everyone rule", async () => {
    const memberId = await insertMember(database, {
      email: "rosa@example.com",
    });
    const ruleIds = await getVisibleRuleIdsFromMemberId({ database, memberId });
    expect(ruleIds).toContain(EVERYONE_VISIBILITY_RULE_ID);
  });

  it("includes an only rule that names the member", async () => {
    const memberId = await insertMember(database, {
      email: "rosa@example.com",
    });
    const ruleId = await insertVisibilityRule(database, { mode: "only" });
    await insertVisibilityRuleSubject(database, { ruleId, memberId });

    expect(
      await getVisibleRuleIdsFromMemberId({ database, memberId }),
    ).toContain(ruleId);
  });

  it("excludes an only rule that names somebody else", async () => {
    const memberId = await insertMember(database, {
      email: "rosa@example.com",
    });
    const otherId = await insertMember(database, {
      email: "ines@example.com",
    });
    const ruleId = await insertVisibilityRule(database, { mode: "only" });
    await insertVisibilityRuleSubject(database, {
      ruleId,
      memberId: otherId,
    });

    expect(
      await getVisibleRuleIdsFromMemberId({ database, memberId }),
    ).not.toContain(ruleId);
  });

  it("includes an only rule that names a group the member is in", async () => {
    const memberId = await insertMember(database, {
      email: "rosa@example.com",
    });
    const groupId = await insertGroup(database, { name: "Cousins" });
    await insertGroupMember(database, { groupId, memberId });
    const ruleId = await insertVisibilityRule(database, { mode: "only" });
    await insertVisibilityRuleSubject(database, { ruleId, groupId });

    expect(
      await getVisibleRuleIdsFromMemberId({ database, memberId }),
    ).toContain(ruleId);
  });

  it("excludes an only rule naming a group the member is not in", async () => {
    const memberId = await insertMember(database, {
      email: "rosa@example.com",
    });
    const groupId = await insertGroup(database, { name: "Cousins" });
    const ruleId = await insertVisibilityRule(database, { mode: "only" });
    await insertVisibilityRuleSubject(database, { ruleId, groupId });

    expect(
      await getVisibleRuleIdsFromMemberId({ database, memberId }),
    ).not.toContain(ruleId);
  });

  it("excludes an except rule that names the member", async () => {
    const memberId = await insertMember(database, {
      email: "rosa@example.com",
    });
    const ruleId = await insertVisibilityRule(database, { mode: "except" });
    await insertVisibilityRuleSubject(database, { ruleId, memberId });

    expect(
      await getVisibleRuleIdsFromMemberId({ database, memberId }),
    ).not.toContain(ruleId);
  });

  it("includes an except rule that names somebody else", async () => {
    const memberId = await insertMember(database, {
      email: "rosa@example.com",
    });
    const otherId = await insertMember(database, {
      email: "ines@example.com",
    });
    const ruleId = await insertVisibilityRule(database, { mode: "except" });
    await insertVisibilityRuleSubject(database, {
      ruleId,
      memberId: otherId,
    });

    expect(
      await getVisibleRuleIdsFromMemberId({ database, memberId }),
    ).toContain(ruleId);
  });

  it("excludes an except rule naming a group the member is in", async () => {
    const memberId = await insertMember(database, {
      email: "rosa@example.com",
    });
    const groupId = await insertGroup(database, { name: "Cousins" });
    await insertGroupMember(database, { groupId, memberId });
    const ruleId = await insertVisibilityRule(database, { mode: "except" });
    await insertVisibilityRuleSubject(database, { ruleId, groupId });

    expect(
      await getVisibleRuleIdsFromMemberId({ database, memberId }),
    ).not.toContain(ruleId);
  });

  it("gives an only rule with no subjects to nobody, which fails closed", async () => {
    const memberId = await insertMember(database, {
      email: "rosa@example.com",
    });
    const ruleId = await insertVisibilityRule(database, { mode: "only" });

    expect(
      await getVisibleRuleIdsFromMemberId({ database, memberId }),
    ).not.toContain(ruleId);
  });
});
```

Add `afterEach(async () => { await database.destroy(); })` in the same style
the other server tests use.

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @memory-shoebox/server test test/visibility/getVisibleRuleIdsFromMemberId.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 4: Write the query**

Create `apps/server/src/visibility/getVisibleRuleIdsFromMemberId.ts`:

```ts
import type { Kysely } from "kysely";
import type { Database } from "../db/types/db.types.ts";

/**
 * Every visibility rule this member may see through, as one query.
 *
 * The evaluation is `data-models.md` § The evaluation: `everyone` is visible
 * to all, `only` when the member is among the expanded subjects, `except` when
 * they are not. The member's own uploads are **not** here, because clause 2 of
 * that evaluation is a column on the item rather than a rule
 * (`applyVisibilityFilter.ts` adds it).
 *
 * One query rather than one per rule, over
 * `group_members (member_id, group_id)`, which `data-models.md` calls the
 * second-hottest index in the product. Group membership stays retroactive
 * because this runs at read time and nothing is ever snapshotted.
 *
 * `item_people` does not appear and must never be added: being in a photograph
 * is not a key to it (Decision 7).
 *
 * @param options.database A Kysely handle or a transaction.
 * @param options.memberId The viewer.
 * @returns The rule ids, in no particular order. Tens of rows.
 */
export async function getVisibleRuleIdsFromMemberId(options: {
  database: Kysely<Database>;
  memberId: string;
}): Promise<string[]> {
  const rows = await options.database
    .selectFrom("visibility_rules as rule")
    .select("rule.id")
    .where((eb) => {
      const namesMe = eb.exists(
        eb
          .selectFrom("visibility_rule_subjects as subject")
          .select("subject.id")
          .whereRef("subject.rule_id", "=", "rule.id")
          .where((subjectEb) => {
            return subjectEb.or([
              subjectEb("subject.member_id", "=", options.memberId),
              subjectEb(
                "subject.group_id",
                "in",
                subjectEb
                  .selectFrom("group_members")
                  .select("group_members.group_id")
                  .where("group_members.member_id", "=", options.memberId),
              ),
            ]);
          }),
      );

      return eb.or([
        eb("rule.mode", "=", "everyone"),
        eb.and([eb("rule.mode", "=", "only"), namesMe]),
        eb.and([eb("rule.mode", "=", "except"), eb.not(namesMe)]),
      ]);
    })
    .execute();

  return rows.map((row) => {
    return row.id;
  });
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @memory-shoebox/server test test/visibility/getVisibleRuleIdsFromMemberId.test.ts`
Expected: PASS, nine cases.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/visibility/getVisibleRuleIdsFromMemberId.ts apps/server/test/visibility/ apps/server/test/helpers/seedHelpers.ts
git commit -m "feat(server): the viewer's rule set, expanded in one query"
```

---

## Task 12: The cache, keyed by the generation

**Files:**

- Create: `apps/server/src/visibility/createVisibleRuleIdsCache.ts`
- Test: `apps/server/test/visibility/createVisibleRuleIdsCache.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/server/test/visibility/createVisibleRuleIdsCache.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createVisibleRuleIdsCache } from "../../src/visibility/createVisibleRuleIdsCache.ts";

describe("createVisibleRuleIdsCache", () => {
  it("returns what was stored for the same member and generation", () => {
    const cache = createVisibleRuleIdsCache();
    cache.set({ memberId: "rosa", generation: 4, ruleIds: ["rule-1"] });
    expect(cache.get({ memberId: "rosa", generation: 4 })).toEqual(["rule-1"]);
  });

  it("misses for a member it has never seen", () => {
    const cache = createVisibleRuleIdsCache();
    cache.set({ memberId: "rosa", generation: 4, ruleIds: ["rule-1"] });
    expect(cache.get({ memberId: "ines", generation: 4 })).toBeUndefined();
  });

  it("misses once the generation moves", () => {
    const cache = createVisibleRuleIdsCache();
    cache.set({ memberId: "rosa", generation: 4, ruleIds: ["rule-1"] });
    expect(cache.get({ memberId: "rosa", generation: 5 })).toBeUndefined();
  });

  it("drops every other member's entry on the same bump", () => {
    const cache = createVisibleRuleIdsCache();
    cache.set({ memberId: "rosa", generation: 4, ruleIds: ["rule-1"] });
    cache.set({ memberId: "ines", generation: 4, ruleIds: ["rule-2"] });

    // One member's expansion is recomputed under the new generation. Every
    // other member's must be gone, or a group edit invalidates only the
    // viewer who happened to make the next request.
    cache.set({ memberId: "rosa", generation: 5, ruleIds: ["rule-1"] });

    expect(cache.get({ memberId: "ines", generation: 5 })).toBeUndefined();
    expect(cache.get({ memberId: "ines", generation: 4 })).toBeUndefined();
  });

  it("hands out an array a caller cannot corrupt", () => {
    const cache = createVisibleRuleIdsCache();
    cache.set({ memberId: "rosa", generation: 4, ruleIds: ["rule-1"] });
    const cached = cache.get({ memberId: "rosa", generation: 4 });
    expect(() => {
      return (cached as string[]).push("rule-2");
    }).toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @memory-shoebox/server test test/visibility/createVisibleRuleIdsCache.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the cache**

Create `apps/server/src/visibility/createVisibleRuleIdsCache.ts`:

```ts
/** A member's expansion, kept only while the generation it was built under
 * is still current. */
export type VisibleRuleIdsCache = {
  /** The expansion for this member under this generation, or undefined. */
  get: (options: {
    memberId: string;
    generation: number;
  }) => readonly string[] | undefined;
  /** Stores one expansion, dropping everything older when the key moves. */
  set: (options: {
    memberId: string;
    generation: number;
    ruleIds: readonly string[];
  }) => void;
};

/**
 * The `(memberId, visibilityGeneration)` cache `conventions.md` § The auth
 * middleware requires.
 *
 * **A generation that has moved clears the whole map** rather than evicting
 * one key. The map holds one entry per member of a nine-person family, and the
 * failure it must not have is a stale entry surviving its generation: that is
 * exactly "a group edit invalidates every viewer's cache at once and nobody
 * keeps stale access".
 *
 * Process-local, which is enough only because the deployment is a single Fly
 * machine (`docs/architecture.md`). A second machine would make this wrong
 * rather than slow.
 *
 * The stored array is frozen because it is shared with every request holding
 * the same key: a caller that sorted or pushed to it would corrupt the others.
 */
export function createVisibleRuleIdsCache(): VisibleRuleIdsCache {
  const byMemberId = new Map<string, readonly string[]>();
  let cachedGeneration: number | undefined;

  return {
    get: (options) => {
      if (options.generation !== cachedGeneration) {
        return undefined;
      }
      return byMemberId.get(options.memberId);
    },

    set: (options) => {
      if (options.generation !== cachedGeneration) {
        cachedGeneration = options.generation;
        byMemberId.clear();
      }
      byMemberId.set(options.memberId, Object.freeze([...options.ruleIds]));
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @memory-shoebox/server test test/visibility/createVisibleRuleIdsCache.test.ts`
Expected: PASS, five cases.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/visibility/createVisibleRuleIdsCache.ts apps/server/test/visibility/createVisibleRuleIdsCache.test.ts
git commit -m "feat(server): one cache key, and one bump that empties it"
```

---

## Task 13: The predicate, applied in one place

**Files:**

- Create: `apps/server/src/visibility/applyVisibilityFilter.ts`
- Test: `apps/server/test/visibility/applyVisibilityFilter.test.ts`

This is the interface step 3a exists to produce. Every later read route
composes this function rather than rewriting the expression, which is what
makes a count and the page it heads incapable of disagreeing.

- [ ] **Step 1: Write the failing test**

Create `apps/server/test/visibility/applyVisibilityFilter.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import type { Kysely } from "kysely";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import type { Database } from "../../src/db/types/db.types.ts";
import type { Viewer } from "../../src/http/requestContextHelpers.ts";
import { applyVisibilityFilter } from "../../src/visibility/applyVisibilityFilter.ts";
import { EVERYONE_VISIBILITY_RULE_ID } from "../../src/visibility/everyoneRule.ts";
import { getVisibleRuleIdsFromMemberId } from "../../src/visibility/getVisibleRuleIdsFromMemberId.ts";
import { createId } from "../../src/db/createId.ts";
import {
  insertItem,
  insertMember,
  insertVisibilityRule,
  insertVisibilityRuleSubject,
} from "../helpers/seedHelpers.ts";

/** A viewer built from the real expansion, which is what a request holds. */
async function _viewerFor(options: {
  database: Kysely<Database>;
  memberId: string;
  role?: Viewer["role"];
}): Promise<Viewer> {
  const role = options.role ?? "viewer";
  return {
    memberId: options.memberId,
    sessionId: createId(),
    role,
    isAdmin: role === "admin",
    visibleRuleIds: await getVisibleRuleIdsFromMemberId({
      database: options.database,
      memberId: options.memberId,
    }),
  };
}

/** The ids a viewer can see, through the filter and nothing else. */
async function _visibleItemIds(options: {
  database: Kysely<Database>;
  viewer: Viewer;
}): Promise<string[]> {
  const rows = await applyVisibilityFilter({
    query: options.database.selectFrom("items").select("items.id"),
    viewer: options.viewer,
  }).execute();
  return rows.map((row) => {
    return row.id;
  });
}

describe("applyVisibilityFilter", () => {
  let database: Kysely<Database>;

  beforeEach(async () => {
    database = createDatabase(":memory:");
    await migrateToLatest(database);
  });

  it("shows an everyone item to a viewer who uploaded nothing", async () => {
    const uploaderId = await insertMember(database, {
      email: "papa@example.com",
    });
    const viewerId = await insertMember(database, {
      email: "rosa@example.com",
    });
    const itemId = await insertItem(database, { uploadedBy: uploaderId });

    const viewer = await _viewerFor({ database, memberId: viewerId });
    expect(await _visibleItemIds({ database, viewer })).toEqual([itemId]);
  });

  it("hides an item whose rule excludes the viewer", async () => {
    const uploaderId = await insertMember(database, {
      email: "papa@example.com",
    });
    const viewerId = await insertMember(database, {
      email: "rosa@example.com",
    });
    const ruleId = await insertVisibilityRule(database, { mode: "only" });
    await insertVisibilityRuleSubject(database, {
      ruleId,
      memberId: uploaderId,
    });
    await insertItem(database, {
      uploadedBy: uploaderId,
      visibility_rule_id: ruleId,
    });

    const viewer = await _viewerFor({ database, memberId: viewerId });
    expect(await _visibleItemIds({ database, viewer })).toEqual([]);
  });

  it("shows an uploader their own item under a rule that excludes them", async () => {
    // Decision 7: a rule that was correct in September becomes
    // self-excluding when an admin adds its author to Cousins in October, and
    // no write-time check can catch that.
    const uploaderId = await insertMember(database, {
      email: "papa@example.com",
    });
    const otherId = await insertMember(database, { email: "ines@example.com" });
    const ruleId = await insertVisibilityRule(database, { mode: "only" });
    await insertVisibilityRuleSubject(database, { ruleId, memberId: otherId });
    const itemId = await insertItem(database, {
      uploadedBy: uploaderId,
      visibility_rule_id: ruleId,
    });

    const viewer = await _viewerFor({ database, memberId: uploaderId });
    expect(await _visibleItemIds({ database, viewer })).toEqual([itemId]);
  });

  it("shows an admin everything, with no clause in the query at all", async () => {
    const uploaderId = await insertMember(database, {
      email: "papa@example.com",
    });
    const adminId = await insertMember(database, {
      email: "admin@example.com",
      role: "admin",
    });
    const ruleId = await insertVisibilityRule(database, { mode: "only" });
    await insertVisibilityRuleSubject(database, {
      ruleId,
      memberId: uploaderId,
    });
    const itemId = await insertItem(database, {
      uploadedBy: uploaderId,
      visibility_rule_id: ruleId,
    });

    const viewer = await _viewerFor({
      database,
      memberId: adminId,
      role: "admin",
    });
    expect(await _visibleItemIds({ database, viewer })).toEqual([itemId]);

    const compiled = applyVisibilityFilter({
      query: database.selectFrom("items").select("items.id"),
      viewer,
    }).compile();
    expect(compiled.sql).not.toContain("visibility_rule_id");
  });

  it("never lets a people tag be a key to a photograph", async () => {
    // `item_people` must not appear in any visibility expression
    // (Decision 7). A photograph restricted to admins and people-tagged for a
    // viewer is invisible to that viewer.
    const adminId = await insertMember(database, {
      email: "admin@example.com",
      role: "admin",
    });
    const viewerId = await insertMember(database, {
      email: "rosa@example.com",
    });
    const ruleId = await insertVisibilityRule(database, { mode: "only" });
    await insertVisibilityRuleSubject(database, { ruleId, memberId: adminId });
    const itemId = await insertItem(database, {
      uploadedBy: adminId,
      visibility_rule_id: ruleId,
    });

    const personId = createId();
    await database
      .insertInto("people")
      .values({
        id: personId,
        display_name: "Rosa",
        name_normalized: "rosa",
        member_id: viewerId,
        created_at: "2026-09-27T10:00:00.000Z",
      })
      .execute();
    await database
      .insertInto("item_people")
      .values({
        id: createId(),
        item_id: itemId,
        person_id: personId,
        created_at: "2026-09-27T10:00:00.000Z",
      })
      .execute();

    const viewer = await _viewerFor({ database, memberId: viewerId });
    expect(await _visibleItemIds({ database, viewer })).toEqual([]);
  });

  it("shows a viewer with an empty rule set only their own uploads", async () => {
    const viewerId = await insertMember(database, {
      email: "rosa@example.com",
    });
    const itemId = await insertItem(database, { uploadedBy: viewerId });

    const viewer: Viewer = {
      memberId: viewerId,
      sessionId: createId(),
      role: "viewer",
      isAdmin: false,
      visibleRuleIds: [],
    };
    expect(await _visibleItemIds({ database, viewer })).toEqual([itemId]);
  });

  it("does not show an everyone item to a viewer whose set is empty", async () => {
    const uploaderId = await insertMember(database, {
      email: "papa@example.com",
    });
    const viewerId = await insertMember(database, {
      email: "rosa@example.com",
    });
    await insertItem(database, {
      uploadedBy: uploaderId,
      visibility_rule_id: EVERYONE_VISIBILITY_RULE_ID,
    });

    const viewer: Viewer = {
      memberId: viewerId,
      sessionId: createId(),
      role: "viewer",
      isAdmin: false,
      visibleRuleIds: [],
    };
    expect(await _visibleItemIds({ database, viewer })).toEqual([]);
  });
});
```

Check `people` and `item_people`'s columns against
`apps/server/src/db/types/catalog.types.ts` before running, and correct the two
inserts above to match: they are the only place this plan touches those tables.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @memory-shoebox/server test test/visibility/applyVisibilityFilter.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the filter**

Create `apps/server/src/visibility/applyVisibilityFilter.ts`:

```ts
import type { SelectQueryBuilder } from "kysely";
import type { Database } from "../db/types/db.types.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";

/**
 * Adds this viewer's visibility predicate to a query over `items`.
 *
 * **This is the one sanctioned reader of `Viewer.visibleRuleIds`, and every
 * read route composes it rather than rewriting the expression**
 * (`conventions.md` § The visibility predicate). A count and the page it heads
 * cannot disagree when they share this function; two hand-written copies of
 * the clause is how they start to.
 *
 * The expression is `visibility_rule_id IN (:visibleRuleIds) OR uploaded_by =
 * :viewerMemberId`. The second half is clause 2 of `data-models.md`
 * § The evaluation and cannot leak: it only ever adds items the viewer put
 * there themselves. `item_people` must never appear here: being in a
 * photograph is not a key to it (Decision 7).
 *
 * **An admin gets the query back untouched**, which is both correct and
 * fastest: they see everything, and it cannot be switched off, not even by
 * another admin.
 *
 * @param options.query Any select over `items`.
 * @param options.viewer The request's viewer.
 * @returns The same query, narrowed to what the viewer may see.
 */
export function applyVisibilityFilter<Output>(options: {
  query: SelectQueryBuilder<Database, "items", Output>;
  viewer: Viewer;
}): SelectQueryBuilder<Database, "items", Output> {
  const { query, viewer } = options;
  if (viewer.isAdmin) {
    return query;
  }

  const ruleIds = [...viewer.visibleRuleIds];
  return query.where((eb) => {
    const uploadedByMe = eb("items.uploaded_by", "=", viewer.memberId);
    // An empty set is not a state a real viewer reaches, because the seeded
    // `everyone` rule is visible to everybody. It is still written out: an
    // `IN ()` is a SQLite syntax error, so the empty case has to be the
    // uploader clause alone rather than a query that throws.
    if (ruleIds.length === 0) {
      return uploadedByMe;
    }
    return eb.or([eb("items.visibility_rule_id", "in", ruleIds), uploadedByMe]);
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @memory-shoebox/server test test/visibility/applyVisibilityFilter.test.ts`
Expected: PASS, seven cases.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/visibility/applyVisibilityFilter.ts apps/server/test/visibility/applyVisibilityFilter.test.ts
git commit -m "feat(server): the visibility predicate, built once and composed"
```

---

## Task 14: The generation bump

**Files:**

- Create: `apps/server/src/visibility/bumpVisibilityGeneration.ts`
- Test: `apps/server/test/visibility/bumpVisibilityGeneration.test.ts`

Nothing in step 3a calls this. It is the interface steps 5a, 6a and 8a call,
and it ships here with the cache it invalidates.

- [ ] **Step 1: Write the failing test**

Create `apps/server/test/visibility/bumpVisibilityGeneration.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import type { Kysely } from "kysely";
import { readInstanceSettings } from "../../src/settings/readInstanceSettings.ts";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { runInImmediateTransaction } from "../../src/db/runInImmediateTransaction.ts";
import type { Database } from "../../src/db/types/db.types.ts";
import { bumpVisibilityGeneration } from "../../src/visibility/bumpVisibilityGeneration.ts";
import { NOW, insertInstanceSetting } from "../helpers/seedHelpers.ts";

/** The generation as the middleware would read it. */
async function _readGeneration(database: Kysely<Database>): Promise<number> {
  const settings = await readInstanceSettings({
    database,
    keys: ["visibility.generation"],
  });
  return settings["visibility.generation"];
}

describe("bumpVisibilityGeneration", () => {
  let database: Kysely<Database>;

  beforeEach(async () => {
    database = createDatabase(":memory:");
    await migrateToLatest(database);
  });

  it("writes 1 on a fresh Shoebox, which holds no settings rows", async () => {
    expect(await _readGeneration(database)).toBe(0);
    expect(
      await bumpVisibilityGeneration({ executor: database, now: NOW }),
    ).toBe(1);
    expect(await _readGeneration(database)).toBe(1);
  });

  it("moves one at a time from whatever is stored", async () => {
    await insertInstanceSetting(database, {
      key: "visibility.generation",
      value: 41,
    });
    expect(
      await bumpVisibilityGeneration({ executor: database, now: NOW }),
    ).toBe(42);
    expect(await _readGeneration(database)).toBe(42);
  });

  it("leaves exactly one row, which the partial unique index requires", async () => {
    await bumpVisibilityGeneration({ executor: database, now: NOW });
    await bumpVisibilityGeneration({ executor: database, now: NOW });
    const rows = await database
      .selectFrom("settings")
      .select("id")
      .where("key", "=", "visibility.generation")
      .execute();
    expect(rows).toHaveLength(1);
    expect(await _readGeneration(database)).toBe(2);
  });

  it("commits with the caller's transaction, or not at all", async () => {
    await expect(
      runInImmediateTransaction({
        database,
        callback: async (transaction) => {
          await bumpVisibilityGeneration({ executor: transaction, now: NOW });
          throw new Error("the group edit failed");
        },
      }),
    ).rejects.toThrow("the group edit failed");

    expect(await _readGeneration(database)).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @memory-shoebox/server test test/visibility/bumpVisibilityGeneration.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the bump**

Create `apps/server/src/visibility/bumpVisibilityGeneration.ts`:

```ts
import type { Kysely, Transaction } from "kysely";
import { getSettingValueFromStoredValue } from "@memory-shoebox/shared";
import { createId } from "../db/createId.ts";
import type { Database } from "../db/types/db.types.ts";

/** Either a handle or a transaction: the bump commits with the write. */
export type VisibilityGenerationExecutor =
  | Kysely<Database>
  | Transaction<Database>;

/**
 * Moves `visibility.generation` on, invalidating every viewer's cached
 * `visibleRuleIds` at once (`conventions.md` § The auth middleware).
 *
 * **Call it inside the transaction that made the change**, so the bump commits
 * with the write that earned it or not at all. A committed group edit whose
 * bump rolled back leaves every cached viewer seeing the old answer until
 * something else happens to bump.
 *
 * **Every write that can change what an expansion returns has to call this**,
 * and the list is longer than the sentence in `conventions.md`:
 *
 * | Write                                       | Step |
 * | ------------------------------------------- | ---- |
 * | `group_members` insert or delete            | 8a   |
 * | `visibility_rule_subjects` insert or delete | 6a   |
 * | `members.role` change                       | 8a   |
 * | **`visibility_rules` insert**               | 6a   |
 *
 * The last is the easy one to miss and the only silent one: a new rule naming
 * a viewer is not in that viewer's cached set, so a brand-new upload would be
 * invisible to them until some unrelated edit bumped.
 *
 * A display name change does **not** bump. Invalidating every viewer's cache
 * because somebody fixed their own spelling is a real cost for nothing
 * (`auth.md`, `PATCH /api/me`).
 *
 * @param options.executor The caller's transaction, or a plain handle.
 * @param options.now Overridable so a test can hold time still.
 * @returns The generation now in force.
 */
export async function bumpVisibilityGeneration(options: {
  executor: VisibilityGenerationExecutor;
  now?: string;
}): Promise<number> {
  const { executor } = options;
  const now = options.now ?? new Date().toISOString();

  const row = await executor
    .selectFrom("settings")
    .select("value")
    .where("scope", "=", "instance")
    .where("key", "=", "visibility.generation")
    .executeTakeFirst();

  // A fresh Shoebox holds zero settings rows, and the registry's default is
  // what makes that legible rather than a special case here.
  const current = getSettingValueFromStoredValue(
    "visibility.generation",
    row?.value,
  );
  const next = current + 1;
  const value = JSON.stringify(next);

  const updated = await executor
    .updateTable("settings")
    .set({ value, updated_at: now })
    .where("scope", "=", "instance")
    .where("key", "=", "visibility.generation")
    .executeTakeFirst();

  // An update then an insert rather than an upsert: the unique index is
  // partial (`key WHERE scope = 'instance'`), so an `ON CONFLICT` target here
  // would have to repeat that predicate to match it, and this pair says the
  // same thing without depending on the dialect spelling it the same way.
  if (Number(updated.numUpdatedRows) === 0) {
    await executor
      .insertInto("settings")
      .values({
        id: createId(),
        scope: "instance",
        scope_id: null,
        key: "visibility.generation",
        value,
        updated_at: now,
        updated_by_member_id: null,
      })
      .execute();
  }

  return next;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @memory-shoebox/server test test/visibility/bumpVisibilityGeneration.test.ts`
Expected: PASS, four cases.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/visibility/bumpVisibilityGeneration.ts apps/server/test/visibility/bumpVisibilityGeneration.test.ts
git commit -m "feat(server): the bump that invalidates every viewer at once"
```

---

## Task 15: The authenticator

**Files:**

- Create: `apps/server/src/auth/createAuthenticator.ts`
- Test: `apps/server/test/auth/createAuthenticator.test.ts`

This is the lookup behind the seam step 2 left. `conventions.md`: "Looked up in
the database on every request... That rules out a stateless JWT and any cache
without an invalidation channel. An auth library will quietly violate this."

- [ ] **Step 1: Write the failing test**

Create `apps/server/test/auth/createAuthenticator.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import type { FastifyRequest } from "fastify";
import type { Kysely } from "kysely";
import { createAuthenticator } from "../../src/auth/createAuthenticator.ts";
import { makeTokenHashFromToken } from "../../src/auth/sessionToken.ts";
import { SESSION_COOKIE_NAME } from "../../src/auth/sessionCookie.ts";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import type { Database } from "../../src/db/types/db.types.ts";
import { bumpVisibilityGeneration } from "../../src/visibility/bumpVisibilityGeneration.ts";
import { EVERYONE_VISIBILITY_RULE_ID } from "../../src/visibility/everyoneRule.ts";
import {
  NOW,
  insertGroup,
  insertGroupMember,
  insertMember,
  insertSession,
  insertVisibilityRule,
  insertVisibilityRuleSubject,
  shiftDays,
} from "../helpers/seedHelpers.ts";

const TOKEN = "a-token-somebody-is-holding";

/** A request presenting `TOKEN`, or whatever else a test wants. */
function _requestWith(token: string | undefined): FastifyRequest {
  return {
    headers:
      token === undefined ? {} : { cookie: `${SESSION_COOKIE_NAME}=${token}` },
  } as unknown as FastifyRequest;
}

describe("createAuthenticator", () => {
  let database: Kysely<Database>;

  beforeEach(async () => {
    database = createDatabase(":memory:");
    await migrateToLatest(database);
  });

  it("is anonymous when no cookie was presented", async () => {
    const authenticate = createAuthenticator({ database });
    expect(await authenticate(_requestWith(undefined))).toBeUndefined();
  });

  it("is anonymous for a token no row matches", async () => {
    const authenticate = createAuthenticator({ database });
    expect(await authenticate(_requestWith("not-a-token"))).toBeUndefined();
  });

  it("resolves a live session to its member", async () => {
    const memberId = await insertMember(database, {
      email: "rosa@example.com",
      role: "uploader",
    });
    const sessionId = await insertSession(database, {
      memberId,
      token_hash: makeTokenHashFromToken(TOKEN),
    });

    const authenticate = createAuthenticator({
      database,
      clock: () => {
        return new Date(NOW);
      },
    });
    const viewer = await authenticate(_requestWith(TOKEN));

    expect(viewer).toMatchObject({
      memberId,
      sessionId,
      role: "uploader",
      isAdmin: false,
    });
    expect(viewer?.visibleRuleIds).toContain(EVERYONE_VISIBILITY_RULE_ID);
  });

  it("marks an admin, whose access cannot be restricted by anyone", async () => {
    const memberId = await insertMember(database, {
      email: "admin@example.com",
      role: "admin",
    });
    await insertSession(database, {
      memberId,
      token_hash: makeTokenHashFromToken(TOKEN),
    });

    const authenticate = createAuthenticator({ database });
    expect(await authenticate(_requestWith(TOKEN))).toMatchObject({
      role: "admin",
      isAdmin: true,
    });
  });

  it("is anonymous for a session past its expiry", async () => {
    const memberId = await insertMember(database, {
      email: "rosa@example.com",
    });
    await insertSession(database, {
      memberId,
      token_hash: makeTokenHashFromToken(TOKEN),
      expires_at: shiftDays({ instant: NOW, days: -1 }),
    });

    const authenticate = createAuthenticator({
      database,
      clock: () => {
        return new Date(NOW);
      },
    });
    expect(await authenticate(_requestWith(TOKEN))).toBeUndefined();
  });

  it("is anonymous for a member who has been removed", async () => {
    const memberId = await insertMember(database, {
      email: "rosa@example.com",
      status: "removed",
      removed_at: NOW,
    });
    await insertSession(database, {
      memberId,
      token_hash: makeTokenHashFromToken(TOKEN),
    });

    const authenticate = createAuthenticator({ database });
    expect(await authenticate(_requestWith(TOKEN))).toBeUndefined();
  });

  it("does not slide a session used an hour ago", async () => {
    const memberId = await insertMember(database, {
      email: "rosa@example.com",
    });
    const sessionId = await insertSession(database, {
      memberId,
      token_hash: makeTokenHashFromToken(TOKEN),
      last_used_at: NOW,
      expires_at: shiftDays({ instant: NOW, days: 30 }),
    });

    const authenticate = createAuthenticator({
      database,
      clock: () => {
        return new Date(Date.parse(NOW) + 60 * 60 * 1000);
      },
    });
    await authenticate(_requestWith(TOKEN));

    const row = await database
      .selectFrom("sessions")
      .select(["last_used_at", "expires_at"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(row.last_used_at).toBe(NOW);
    expect(row.expires_at).toBe(shiftDays({ instant: NOW, days: 30 }));
  });

  it("slides a session used two days ago, and the member's last seen", async () => {
    const memberId = await insertMember(database, {
      email: "rosa@example.com",
      last_seen_at: NOW,
    });
    const sessionId = await insertSession(database, {
      memberId,
      token_hash: makeTokenHashFromToken(TOKEN),
      last_used_at: NOW,
      expires_at: shiftDays({ instant: NOW, days: 30 }),
    });

    const later = shiftDays({ instant: NOW, days: 2 });
    const authenticate = createAuthenticator({
      database,
      clock: () => {
        return new Date(later);
      },
    });
    await authenticate(_requestWith(TOKEN));

    const session = await database
      .selectFrom("sessions")
      .select(["last_used_at", "expires_at"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(session.last_used_at).toBe(later);
    expect(session.expires_at).toBe(shiftDays({ instant: later, days: 30 }));

    const member = await database
      .selectFrom("members")
      .select("last_seen_at")
      .where("id", "=", memberId)
      .executeTakeFirstOrThrow();
    expect(member.last_seen_at).toBe(later);
  });

  it("sees a group added to a rule without anybody signing in again", async () => {
    const memberId = await insertMember(database, {
      email: "rosa@example.com",
    });
    await insertSession(database, {
      memberId,
      token_hash: makeTokenHashFromToken(TOKEN),
    });
    const ruleId = await insertVisibilityRule(database, { mode: "only" });
    const groupId = await insertGroup(database, { name: "Cousins" });
    await insertVisibilityRuleSubject(database, { ruleId, groupId });

    const authenticate = createAuthenticator({ database });
    const before = await authenticate(_requestWith(TOKEN));
    expect(before?.visibleRuleIds).not.toContain(ruleId);

    // An admin adds her to the group, in one transaction with the bump.
    await insertGroupMember(database, { groupId, memberId });
    await bumpVisibilityGeneration({ executor: database, now: NOW });

    const after = await authenticate(_requestWith(TOKEN));
    expect(after?.visibleRuleIds).toContain(ruleId);
  });

  it("serves a cached expansion while the generation stands still", async () => {
    const memberId = await insertMember(database, {
      email: "rosa@example.com",
    });
    await insertSession(database, {
      memberId,
      token_hash: makeTokenHashFromToken(TOKEN),
    });
    const ruleId = await insertVisibilityRule(database, { mode: "only" });
    await insertVisibilityRuleSubject(database, { ruleId, memberId });

    const authenticate = createAuthenticator({ database });
    const first = await authenticate(_requestWith(TOKEN));
    expect(first?.visibleRuleIds).toContain(ruleId);

    // The subject is removed and nothing bumps, which is the state this cache
    // is allowed to be wrong in and the reason every such write must bump.
    await database
      .deleteFrom("visibility_rule_subjects")
      .where("rule_id", "=", ruleId)
      .execute();

    const second = await authenticate(_requestWith(TOKEN));
    expect(second?.visibleRuleIds).toContain(ruleId);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @memory-shoebox/server test test/auth/createAuthenticator.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the authenticator**

Create `apps/server/src/auth/createAuthenticator.ts`:

```ts
import type { Kysely } from "kysely";
import { memberRoleSchema, type MemberRole } from "@memory-shoebox/shared";
import type { Database } from "../db/types/db.types.ts";
import type { Authenticator, Viewer } from "../http/requestContextHelpers.ts";
import { readInstanceSettings } from "../settings/readInstanceSettings.ts";
import { createVisibleRuleIdsCache } from "../visibility/createVisibleRuleIdsCache.ts";
import { getVisibleRuleIdsFromMemberId } from "../visibility/getVisibleRuleIdsFromMemberId.ts";
import { getSessionTokenFromRequest } from "./sessionCookie.ts";
import { makeTokenHashFromToken } from "./sessionToken.ts";
import {
  SESSION_LIFETIME_DAYS,
  SESSION_SLIDE_THRESHOLD_MS,
} from "./auth.constants.ts";

/** One day in milliseconds, written once for the two throttled writes. */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The role on the row, failing closed.
 *
 * The column carries a `CHECK`, so this is belt and braces; the direction it
 * fails in is the point, because the alternative to a narrowing helper is a
 * cast that would let any string through as a role.
 */
function _getMemberRoleFromStoredValue(value: string): MemberRole {
  const parsed = memberRoleSchema.safeParse(value);
  return parsed.success ? parsed.data : "viewer";
}

/** Whether a throttled timestamp has moved by more than a day. */
function _isSlideDue(options: {
  lastAt: string | null;
  nowMs: number;
}): boolean {
  if (options.lastAt === null) {
    return true;
  }
  return (
    options.nowMs - Date.parse(options.lastAt) > SESSION_SLIDE_THRESHOLD_MS
  );
}

/**
 * Builds the `Authenticator` step 2's request context seam expects.
 *
 * **The session is looked up in the database on every request**
 * (`conventions.md` § The auth middleware). Both My account and Members
 * promise a signed-out device "stops working immediately, wherever it is",
 * which rules out a stateless token and any cache without an invalidation
 * channel. The only cache here is `visibleRuleIds`, and it has one:
 * `visibility.generation`.
 *
 * The generation itself is read per request rather than cached. It is one row
 * by primary key on a table holding at most nine, beside a lookup that is
 * already happening, and caching it is how "a group edit invalidates every
 * viewer's cache at once" quietly stops being true.
 *
 * @param options.database The Kysely handle.
 * @param options.clock Overridable so a test can hold time still.
 */
export function createAuthenticator(options: {
  database: Kysely<Database>;
  clock?: () => Date;
}): Authenticator {
  const { database } = options;
  const clock =
    options.clock ??
    (() => {
      return new Date();
    });
  const cache = createVisibleRuleIdsCache();

  return async (request) => {
    const token = getSessionTokenFromRequest(request);
    if (token === undefined) {
      return undefined;
    }

    const now = clock();
    const nowIso = now.toISOString();

    // The status filter is load-bearing: removing a member ends every device
    // they hold on its next request, without the removal path having to find
    // their session rows. An `invited` member cannot hold one at all, because
    // redeeming a code is what makes them `active`.
    const row = await database
      .selectFrom("sessions")
      .innerJoin("members", "members.id", "sessions.member_id")
      .select([
        "sessions.id as sessionId",
        "sessions.last_used_at as lastUsedAt",
        "members.id as memberId",
        "members.role as role",
        "members.last_seen_at as lastSeenAt",
      ])
      .where("sessions.token_hash", "=", makeTokenHashFromToken(token))
      .where("sessions.expires_at", ">", nowIso)
      .where("members.status", "=", "active")
      .executeTakeFirst();

    if (row === undefined) {
      return undefined;
    }

    const settings = await readInstanceSettings({
      database,
      keys: ["visibility.generation"],
    });
    const generation = settings["visibility.generation"];

    const cached = cache.get({ memberId: row.memberId, generation });
    const visibleRuleIds =
      cached ??
      (await getVisibleRuleIdsFromMemberId({
        database,
        memberId: row.memberId,
      }));
    if (cached === undefined) {
      cache.set({
        memberId: row.memberId,
        generation,
        ruleIds: visibleRuleIds,
      });
    }

    await _slideIfDue({
      database,
      nowIso,
      nowMs: now.getTime(),
      sessionId: row.sessionId,
      lastUsedAt: row.lastUsedAt,
      memberId: row.memberId,
      lastSeenAt: row.lastSeenAt,
    });

    const role = _getMemberRoleFromStoredValue(row.role);
    const viewer: Viewer = {
      memberId: row.memberId,
      sessionId: row.sessionId,
      role,
      isAdmin: role === "admin",
      // The cache's frozen array, deliberately: `Viewer.visibleRuleIds` is
      // readonly because it is shared rather than copied.
      visibleRuleIds:
        cache.get({ memberId: row.memberId, generation }) ?? visibleRuleIds,
    };
    return viewer;
  };
}

/** What the request that arrived a day later is allowed to write. */
type SlideInput = {
  database: Kysely<Database>;
  nowIso: string;
  nowMs: number;
  sessionId: string;
  lastUsedAt: string;
  memberId: string;
  lastSeenAt: string | null;
};

/**
 * Slides the session and the member's "last seen", at most once a day each.
 *
 * Without the throttle one timeline page of thumbnails is dozens of writes
 * serialising on SQLite's single writer. The visible consequence is stated in
 * `auth.md` and is correct rather than stale: a device can read "29 days left"
 * immediately after being used.
 */
async function _slideIfDue(input: SlideInput): Promise<void> {
  if (_isSlideDue({ lastAt: input.lastUsedAt, nowMs: input.nowMs })) {
    await input.database
      .updateTable("sessions")
      .set({
        last_used_at: input.nowIso,
        expires_at: new Date(
          input.nowMs + SESSION_LIFETIME_DAYS * DAY_MS,
        ).toISOString(),
      })
      .where("id", "=", input.sessionId)
      .execute();
  }

  if (_isSlideDue({ lastAt: input.lastSeenAt, nowMs: input.nowMs })) {
    await input.database
      .updateTable("members")
      .set({ last_seen_at: input.nowIso })
      .where("id", "=", input.memberId)
      .execute();
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @memory-shoebox/server test test/auth/createAuthenticator.test.ts`
Expected: PASS, ten cases.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/auth/createAuthenticator.ts apps/server/test/auth/createAuthenticator.test.ts
git commit -m "feat(server): the session lookup that happens on every request"
```

---

## Task 16: Wiring, and a clock every route can read

**Files:**

- Modify: `apps/server/src/app.ts`
- Test: `apps/server/test/auth/authenticatorWiring.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/server/test/auth/authenticatorWiring.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SESSION_COOKIE_NAME } from "../../src/auth/sessionCookie.ts";
import { makeTokenHashFromToken } from "../../src/auth/sessionToken.ts";
import { createTestApp } from "../helpers/createTestApp.ts";
import {
  NOW,
  insertMember,
  insertSession,
  shiftDays,
} from "../helpers/seedHelpers.ts";

const TOKEN = "a-token-somebody-is-holding";

describe("the authenticator, wired into the app", () => {
  it("runs on a real request, sliding a session last used two days ago", async () => {
    const twoDaysOn = shiftDays({ instant: NOW, days: 2 });
    const { app, database, close } = await createTestApp({
      clock: () => {
        return new Date(twoDaysOn);
      },
    });
    const memberId = await insertMember(database, {
      email: "rosa@example.com",
    });
    const sessionId = await insertSession(database, {
      memberId,
      token_hash: makeTokenHashFromToken(TOKEN),
      last_used_at: NOW,
      expires_at: shiftDays({ instant: NOW, days: 30 }),
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/health",
      headers: { cookie: `${SESSION_COOKIE_NAME}=${TOKEN}` },
    });
    expect(response.statusCode).toBe(200);

    const row = await database
      .selectFrom("sessions")
      .select("last_used_at")
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(row.last_used_at).toBe(twoDaysOn);

    await close();
  });

  it("writes nothing for a request carrying no cookie", async () => {
    const { app, database, close } = await createTestApp();
    const memberId = await insertMember(database, {
      email: "rosa@example.com",
      last_seen_at: NOW,
    });
    await insertSession(database, {
      memberId,
      token_hash: makeTokenHashFromToken(TOKEN),
      last_used_at: NOW,
    });

    await app.inject({ method: "GET", url: "/api/health" });

    const member = await database
      .selectFrom("members")
      .select("last_seen_at")
      .where("id", "=", memberId)
      .executeTakeFirstOrThrow();
    expect(member.last_seen_at).toBe(NOW);

    await close();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @memory-shoebox/server test test/auth/authenticatorWiring.test.ts`
Expected: FAIL: the session is not slid, because `createApp` still installs the
seam's anonymous default.

- [ ] **Step 3: Wire it up**

In `apps/server/src/app.ts`:

Add the import:

```ts
import { createAuthenticator } from "./auth/createAuthenticator.ts";
```

Add `clock` to the instance declaration block:

```ts
/** The clock every handler reads, so a test can hold time still. */
clock: () => Date;
```

Inside `createApp`, replace the `registerRequestContext` and
`registerRateLimit` calls with:

```ts
const clock =
  deps.clock ??
  (() => {
    return new Date();
  });
app.decorate("clock", clock);

registerErrorHandler(app);
// The seam's anonymous default is what a server with no session lookup ran.
// There is one now, and a caller may still substitute its own.
registerRequestContext(app, {
  authenticate:
    deps.authenticate ??
    createAuthenticator({ database: deps.database, clock }),
});
registerRateLimit(app, { database: deps.database, clock });
```

Keep `registerErrorHandler` first, as it is today. Pass `clock` to
`createJobRegistry` and `createMailQueueJob` as well, replacing `deps.clock`,
so the process has one clock rather than two.

Update the `authenticate` docstring on `AppDeps`:

```ts
  /**
   * How a request resolves to a viewer. Defaults to the real session lookup;
   * a test may substitute its own.
   */
  authenticate?: Authenticator;
```

- [ ] **Step 4: Run the whole server suite**

Run: `pnpm --filter @memory-shoebox/server test`
Expected: PASS. Existing tests that inject their own `authenticate` are
unaffected, and tests that send no cookie are still anonymous. If a test fails
because it now resolves a viewer it did not expect, read it: it is telling you
it seeds a session row and did not know the app would find it.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/app.ts apps/server/test/auth/authenticatorWiring.test.ts
git commit -m "feat(server): the real lookup behind the request context seam"
```

---

## Task 17: The three reads every account route shares

**Files:**

- Create: `apps/server/src/members/getDisplayNameFromMember.ts`
- Create: `apps/server/src/members/getMemberRoleFromStoredValue.ts`
- Create: `apps/server/src/members/getMeDtoFromMemberId.ts`
- Create: `apps/server/src/settings/readShellSettings.ts`
- Modify: `apps/server/src/auth/createAuthenticator.ts` (use the shared role helper)
- Test: `apps/server/test/members/getMeDtoFromMemberId.test.ts`
- Test: `apps/server/test/settings/readShellSettings.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/server/test/members/getMeDtoFromMemberId.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import type { Kysely } from "kysely";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import type { Database } from "../../src/db/types/db.types.ts";
import { getDisplayNameFromMember } from "../../src/members/getDisplayNameFromMember.ts";
import { getMeDtoFromMemberId } from "../../src/members/getMeDtoFromMemberId.ts";
import { NOW, insertMember } from "../helpers/seedHelpers.ts";

describe("getDisplayNameFromMember", () => {
  it("prefers the stored name", () => {
    expect(
      getDisplayNameFromMember({
        storedDisplayName: "Abuela Rosa",
        email: "rosa@example.com",
      }),
    ).toBe("Abuela Rosa");
  });

  it("falls back to the email local part when none is stored", () => {
    expect(
      getDisplayNameFromMember({
        storedDisplayName: null,
        email: "abuela.rosa@example.com",
      }),
    ).toBe("abuela.rosa");
  });

  it("treats a whitespace name as none", () => {
    expect(
      getDisplayNameFromMember({
        storedDisplayName: "   ",
        email: "rosa@example.com",
      }),
    ).toBe("rosa");
  });
});

describe("getMeDtoFromMemberId", () => {
  let database: Kysely<Database>;

  beforeEach(async () => {
    database = createDatabase(":memory:");
    await migrateToLatest(database);
  });

  it("carries the resolved name, the raw column and the caller's address", async () => {
    const memberId = await insertMember(database, {
      email: "rosa@example.com",
      display_name: null,
      role: "viewer",
      notify_on_upload: 1,
      notify_on_comment: 0,
      notify_on_reply: 1,
      notify_on_removal: 0,
      joined_at: NOW,
      last_signed_in_at: NOW,
    });

    expect(await getMeDtoFromMemberId({ database, memberId })).toEqual({
      member: { memberId, displayName: "rosa" },
      storedDisplayName: null,
      email: "rosa@example.com",
      role: "viewer",
      notify: {
        onUpload: true,
        onComment: false,
        onReply: true,
        onRemoval: false,
      },
      joinedAt: NOW,
      lastSignedInAt: NOW,
    });
  });

  it("returns all four switches for a viewer, including onRemoval", async () => {
    // The recipient query filters on role as well as on the boolean; hiding
    // the field here would lose the member's setting the moment an admin
    // promoted them (`auth.md`, `GET /api/me`).
    const memberId = await insertMember(database, {
      email: "rosa@example.com",
      role: "viewer",
      notify_on_removal: 1,
    });
    const me = await getMeDtoFromMemberId({ database, memberId });
    expect(me.notify.onRemoval).toBe(true);
  });
});
```

Create `apps/server/test/settings/readShellSettings.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import type { Kysely } from "kysely";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import type { Database } from "../../src/db/types/db.types.ts";
import { readShellSettings } from "../../src/settings/readShellSettings.ts";
import { insertInstanceSetting } from "../helpers/seedHelpers.ts";

describe("readShellSettings", () => {
  let database: Kysely<Database>;

  beforeEach(async () => {
    database = createDatabase(":memory:");
    await migrateToLatest(database);
  });

  it("answers on a Shoebox holding zero settings rows", async () => {
    expect(await readShellSettings(database)).toEqual({
      shoeboxName: "My Shoebox",
      pileArrangement: "messy",
      timezone: "UTC",
    });
  });

  it("reads what an admin has set", async () => {
    await insertInstanceSetting(database, {
      key: "shoebox.name",
      value: "The Sarmiento Shoebox",
    });
    await insertInstanceSetting(database, {
      key: "pile.arrangement",
      value: "tidy",
    });
    await insertInstanceSetting(database, {
      key: "shoebox.timezone",
      value: "Europe/Madrid",
    });

    expect(await readShellSettings(database)).toEqual({
      shoeboxName: "The Sarmiento Shoebox",
      pileArrangement: "tidy",
      timezone: "Europe/Madrid",
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @memory-shoebox/server test test/members/ test/settings/readShellSettings.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Write the three modules**

Create `apps/server/src/members/getDisplayNameFromMember.ts`:

```ts
/**
 * The name the rest of the product shows for a member.
 *
 * Decision 1: `members.display_name` is set by whoever invited them and is
 * correctable by the member, and it **falls back to the email local part**
 * when it is null. The raw column travels beside this in `MeDto` as
 * `storedDisplayName`, so the account form can show the fallback as a
 * placeholder rather than as text somebody appears to have typed.
 *
 * @param options.storedDisplayName The raw `display_name` column.
 * @param options.email The member's address.
 */
export function getDisplayNameFromMember(options: {
  storedDisplayName: string | null;
  email: string;
}): string {
  const stored = options.storedDisplayName?.trim() ?? "";
  if (stored !== "") {
    return stored;
  }
  const [localPart] = options.email.split("@");
  return localPart === undefined || localPart === ""
    ? options.email
    : localPart;
}
```

Create `apps/server/src/members/getMemberRoleFromStoredValue.ts`:

```ts
import { memberRoleSchema, type MemberRole } from "@memory-shoebox/shared";

/**
 * The role on a `members` row, failing closed.
 *
 * The column carries a `CHECK`, so this is belt and braces. The direction it
 * fails in is the point: the alternative to a narrowing helper is a cast that
 * would let any string through as a role, and the safe answer to a value
 * nobody recognises is the least powerful one.
 */
export function getMemberRoleFromStoredValue(value: string): MemberRole {
  const parsed = memberRoleSchema.safeParse(value);
  return parsed.success ? parsed.data : "viewer";
}
```

Create `apps/server/src/members/getMeDtoFromMemberId.ts`:

```ts
import type { Kysely } from "kysely";
import type { MeDto } from "@memory-shoebox/shared";
import type { Database } from "../db/types/db.types.ts";
import { getDisplayNameFromMember } from "./getDisplayNameFromMember.ts";
import { getMemberRoleFromStoredValue } from "./getMemberRoleFromStoredValue.ts";

/**
 * The self-scoped account shape, for the member making the request.
 *
 * `email` appears here and in no other non-admin payload, which is the whole
 * reason `MemberRef` was not widened to carry one: this route is self-scoped
 * and returns exactly one address, the caller's own
 * (`auth.md` § Additions requested to the frozen DTOs).
 *
 * @param options.database A Kysely handle or a transaction.
 * @param options.memberId The caller, from `request.viewer`.
 * @throws If no such member exists, which cannot happen for a viewer the
 *   middleware has just resolved.
 */
export async function getMeDtoFromMemberId(options: {
  database: Kysely<Database>;
  memberId: string;
}): Promise<MeDto> {
  const row = await options.database
    .selectFrom("members")
    .select([
      "id",
      "email",
      "display_name",
      "role",
      "notify_on_upload",
      "notify_on_comment",
      "notify_on_reply",
      "notify_on_removal",
      "joined_at",
      "last_signed_in_at",
    ])
    .where("id", "=", options.memberId)
    .executeTakeFirstOrThrow();

  return {
    member: {
      memberId: row.id,
      displayName: getDisplayNameFromMember({
        storedDisplayName: row.display_name,
        email: row.email,
      }),
    },
    storedDisplayName: row.display_name,
    email: row.email,
    role: getMemberRoleFromStoredValue(row.role),
    notify: {
      onUpload: row.notify_on_upload === 1,
      onComment: row.notify_on_comment === 1,
      onReply: row.notify_on_reply === 1,
      onRemoval: row.notify_on_removal === 1,
    },
    joinedAt: row.joined_at,
    lastSignedInAt: row.last_signed_in_at,
  };
}
```

Create `apps/server/src/settings/readShellSettings.ts`:

```ts
import type { Kysely } from "kysely";
import type { ShellSettings } from "@memory-shoebox/shared";
import type { Database } from "../db/types/db.types.ts";
import { readInstanceSettings } from "./readInstanceSettings.ts";

/**
 * The three resolved values the app shell needs as it renders.
 *
 * They ride on `POST /api/auth/session` and on `GET /api/me` rather than on a
 * second fetch (`auth.md` Ruling 1), which is also why `pile.arrangement` can
 * stay out of the anonymous `GET /api/public-settings`.
 *
 * @param database A Kysely handle or a transaction.
 */
export async function readShellSettings(
  database: Kysely<Database>,
): Promise<ShellSettings> {
  const settings = await readInstanceSettings({
    database,
    keys: ["shoebox.name", "pile.arrangement", "shoebox.timezone"],
  });
  return {
    shoeboxName: settings["shoebox.name"],
    pileArrangement: settings["pile.arrangement"],
    timezone: settings["shoebox.timezone"],
  };
}
```

- [ ] **Step 4: Use the shared role helper in the authenticator**

In `apps/server/src/auth/createAuthenticator.ts`, delete the private role
narrowing helper and its now-unused `memberRoleSchema` and `MemberRole`
imports, import `getMemberRoleFromStoredValue` from
`../members/getMemberRoleFromStoredValue.ts`, and call that instead. Two copies
of the same narrowing is one copy too many.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @memory-shoebox/server test test/members/ test/settings/ test/auth/`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/members/ apps/server/src/settings/readShellSettings.ts apps/server/src/auth/createAuthenticator.ts apps/server/test/members/ apps/server/test/settings/readShellSettings.test.ts
git commit -m "feat(server): the account shape, the resolved name, and the shell's three"
```

---

## Task 18: Minting a code

**Files:**

- Create: `apps/server/src/auth/mintSignInCode.ts`
- Test: `apps/server/test/auth/mintSignInCode.test.ts`

One helper, three callers: the request route, the resend route, and the third
wrong attempt. `auth.md` says the first two are "the same handler, same
statements, same response", and the exhaustion path mints "by the same rules".

- [ ] **Step 1: Write the failing test**

Create `apps/server/test/auth/mintSignInCode.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import type { Kysely } from "kysely";
import { mintSignInCode } from "../../src/auth/mintSignInCode.ts";
import { makeCodeHashFromDigits } from "../../src/auth/signInCodeHelpers.ts";
import { createDatabase } from "../../src/db/client.ts";
import { createId } from "../../src/db/createId.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { runInImmediateTransaction } from "../../src/db/runInImmediateTransaction.ts";
import type { Database } from "../../src/db/types/db.types.ts";
import {
  NOW,
  insertInstanceSetting,
  insertMember,
  shiftMinutes,
} from "../helpers/seedHelpers.ts";

const PEPPER = Buffer.from("a".repeat(64), "hex");

/** Mints one code the way a route does, inside one immediate transaction. */
async function _mint(options: {
  database: Kysely<Database>;
  email: string;
  now?: string;
}) {
  return runInImmediateTransaction({
    database: options.database,
    callback: (transaction) => {
      return mintSignInCode({
        transaction,
        email: options.email,
        pepper: PEPPER,
        now: options.now ?? NOW,
      });
    },
  });
}

describe("mintSignInCode", () => {
  let database: Kysely<Database>;

  beforeEach(async () => {
    database = createDatabase(":memory:");
    await migrateToLatest(database);
    // Every message needs an absolute link, so an instance with no base URL
    // writes its mail `failed` rather than `queued`. Set it, or the enqueue
    // assertions below are testing the wrong branch.
    await insertInstanceSetting(database, {
      key: "public.base_url",
      value: "https://shoebox.example.com",
    });
  });

  it("writes a row for an address nobody has ever heard of", async () => {
    const minted = await _mint({ database, email: "nobody@example.com" });

    const row = await database
      .selectFrom("sign_in_codes")
      .selectAll()
      .where("id", "=", minted.codeId)
      .executeTakeFirstOrThrow();
    expect(row.email).toBe("nobody@example.com");
    expect(row.member_id).toBeNull();
    expect(row.attempts).toBe(0);
    expect(row.max_attempts).toBe(3);
    expect(row.expires_at).toBe(shiftMinutes({ instant: NOW, minutes: 10 }));
  });

  it("mails nothing for an address that is not a member", async () => {
    await _mint({ database, email: "nobody@example.com" });
    const emails = await database
      .selectFrom("outbound_emails")
      .select("id")
      .execute();
    expect(emails).toEqual([]);
  });

  it("stores the code as an HMAC and never the digits", async () => {
    const minted = await _mint({ database, email: "nobody@example.com" });
    const row = await database
      .selectFrom("sign_in_codes")
      .select("code_hash")
      .where("id", "=", minted.codeId)
      .executeTakeFirstOrThrow();

    expect(row.code_hash).not.toContain(minted.digits);
    expect(row.code_hash).toBe(
      makeCodeHashFromDigits({ digits: minted.digits, pepper: PEPPER }),
    );
  });

  it("queues one message to a member, keyed on the code", async () => {
    const memberId = await insertMember(database, {
      email: "rosa@example.com",
      display_name: "Abuela Rosa",
    });
    const minted = await _mint({ database, email: "rosa@example.com" });

    const email = await database
      .selectFrom("outbound_emails")
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(email.kind).toBe("sign_in_code");
    expect(email.to_address).toBe("rosa@example.com");
    expect(email.to_member_id).toBe(memberId);
    expect(email.idempotency_key).toBe(`signin:${minted.codeId}`);
    expect(email.state).toBe("queued");
    expect(email.subject).toBe(`Your code is ${minted.digits}`);
  });

  it("mails an invited member, who is accepting by signing in", async () => {
    await insertMember(database, {
      email: "ines@example.com",
      status: "invited",
      joined_at: null,
      last_signed_in_at: null,
    });
    await _mint({ database, email: "ines@example.com" });

    const emails = await database
      .selectFrom("outbound_emails")
      .select("id")
      .execute();
    expect(emails).toHaveLength(1);
  });

  it("treats a removed member exactly as an unknown address", async () => {
    const memberId = await insertMember(database, {
      email: "gone@example.com",
      status: "removed",
      removed_at: NOW,
    });
    const minted = await _mint({ database, email: "gone@example.com" });

    const emails = await database
      .selectFrom("outbound_emails")
      .select("id")
      .execute();
    expect(emails).toEqual([]);

    // The row still names them, because `sign_in_codes.member_id` is the
    // matching member and the redemption path is what refuses a removed one.
    const row = await database
      .selectFrom("sign_in_codes")
      .select("member_id")
      .where("id", "=", minted.codeId)
      .executeTakeFirstOrThrow();
    expect(row.member_id).toBe(memberId);
  });

  it("supersedes the live code, so at most one is ever live", async () => {
    const first = await _mint({ database, email: "rosa@example.com" });
    const second = await _mint({
      database,
      email: "rosa@example.com",
      now: shiftMinutes({ instant: NOW, minutes: 1 }),
    });

    const rows = await database
      .selectFrom("sign_in_codes")
      .select(["id", "invalidated_at"])
      .orderBy("created_at", "asc")
      .execute();
    expect(rows).toEqual([
      {
        id: first.codeId,
        invalidated_at: shiftMinutes({ instant: NOW, minutes: 1 }),
      },
      { id: second.codeId, invalidated_at: null },
    ]);
  });

  it("leaves another address's live code alone", async () => {
    const other = await _mint({ database, email: "ines@example.com" });
    await _mint({ database, email: "rosa@example.com" });

    const row = await database
      .selectFrom("sign_in_codes")
      .select("invalidated_at")
      .where("id", "=", other.codeId)
      .executeTakeFirstOrThrow();
    expect(row.invalidated_at).toBeNull();
  });

  it("does not touch a code that was already used", async () => {
    const first = await _mint({ database, email: "rosa@example.com" });
    await database
      .updateTable("sign_in_codes")
      .set({ consumed_at: NOW })
      .where("id", "=", first.codeId)
      .execute();

    await _mint({
      database,
      email: "rosa@example.com",
      now: shiftMinutes({ instant: NOW, minutes: 1 }),
    });

    const row = await database
      .selectFrom("sign_in_codes")
      .select("invalidated_at")
      .where("id", "=", first.codeId)
      .executeTakeFirstOrThrow();
    expect(row.invalidated_at).toBeNull();
  });
});
```

Note `createId` is imported above only if a case needs it; drop the import if
none does rather than leaving it unused, which oxlint will fail on.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @memory-shoebox/server test test/auth/mintSignInCode.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the helper**

Create `apps/server/src/auth/mintSignInCode.ts`:

```ts
import type { Kysely } from "kysely";
import { createId } from "../db/createId.ts";
import type { Database } from "../db/types/db.types.ts";
import { enqueueEmail } from "../mail/enqueueEmail.ts";
import { getDisplayNameFromMember } from "../members/getDisplayNameFromMember.ts";
import {
  SIGN_IN_CODE_LIFETIME_MINUTES,
  SIGN_IN_CODE_MAX_ATTEMPTS,
} from "./auth.constants.ts";
import {
  createSignInCodeDigits,
  makeCodeHashFromDigits,
} from "./signInCodeHelpers.ts";

/** What one mint wrote. */
export type MintedSignInCode = {
  codeId: string;
  /** The six digits, in the clear. They exist in memory and in the email. */
  digits: string;
  expiresAt: string;
};

/** Everything a mint needs. */
export type MintSignInCodeInput = {
  /**
   * The caller's transaction. The supersede, the insert and the enqueue are
   * one unit, or a second code can be live beside the first.
   */
  transaction: Kysely<Database>;
  /** Already normalised by `normalisedEmailSchema`. */
  email: string;
  pepper: Buffer;
  now: string;
};

/**
 * Supersedes whatever was live for an address and issues a fresh code.
 *
 * **One code path for every address**, member or not
 * (`data-models.md` § `sign_in_codes`). A row is written whether or not the
 * address belongs to anybody, because the unknown address has to be
 * indistinguishable from the known one through the wrong-code and resend
 * states too, not just the first screen. That also gives one timing profile
 * and one place to rate-limit.
 *
 * **Nothing is mailed when there is no usable member.** A removed member is
 * treated exactly as an unknown address (`data-models.md` § Removing a
 * member), and the difference between the branches is one local `INSERT`,
 * which is below network jitter.
 *
 * The enqueue **ignores `email_suppressions` and all four `notify_on_*`
 * columns** (Decision 16): a suppressed address still gets sign-in codes and
 * they cannot be turned off, because without them there is no way back in. The
 * worker's suppression check is already skipped for, and only for, this kind.
 *
 * Three callers: the request route, the resend route, and the third wrong
 * attempt, which `auth.md` Ruling 2 requires to mint a replacement.
 */
export async function mintSignInCode(
  options: MintSignInCodeInput,
): Promise<MintedSignInCode> {
  const { transaction, email, now } = options;

  // At most one code is ever live per address, and "the old one has stopped
  // working" is a state on the row rather than an inference from expiry.
  await transaction
    .updateTable("sign_in_codes")
    .set({ invalidated_at: now })
    .where("email", "=", email)
    .where("consumed_at", "is", null)
    .where("invalidated_at", "is", null)
    .where("expires_at", ">", now)
    .execute();

  const member = await transaction
    .selectFrom("members")
    .select(["id", "email", "display_name", "status"])
    .where("email", "=", email)
    .executeTakeFirst();

  const digits = createSignInCodeDigits();
  const codeId = createId();
  const expiresAt = new Date(
    Date.parse(now) + SIGN_IN_CODE_LIFETIME_MINUTES * 60_000,
  ).toISOString();

  await transaction
    .insertInto("sign_in_codes")
    .values({
      id: codeId,
      email,
      // The matching member, whatever their status. The redemption path is
      // what refuses a removed one, and it refuses them the same way it
      // refuses a wrong guess.
      member_id: member?.id ?? null,
      code_hash: makeCodeHashFromDigits({ digits, pepper: options.pepper }),
      attempts: 0,
      max_attempts: SIGN_IN_CODE_MAX_ATTEMPTS,
      expires_at: expiresAt,
      consumed_at: null,
      invalidated_at: null,
      created_at: now,
    })
    .execute();

  const isMailable =
    member !== undefined &&
    (member.status === "invited" || member.status === "active");

  if (isMailable) {
    await enqueueEmail({
      executor: transaction,
      input: {
        kind: "sign_in_code",
        toAddress: email,
        toMemberId: member.id,
        toDisplayName: getDisplayNameFromMember({
          storedDisplayName: member.display_name,
          email: member.email,
        }),
        idempotencyKey: `signin:${codeId}`,
        payload: {
          code: digits,
          expiresAt,
          expiresInMinutes: SIGN_IN_CODE_LIFETIME_MINUTES,
        },
        triggerKind: "sign_in_code",
        triggerId: codeId,
      },
      now,
    });
  }

  return { codeId, digits, expiresAt };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @memory-shoebox/server test test/auth/mintSignInCode.test.ts`
Expected: PASS, nine cases.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/auth/mintSignInCode.ts apps/server/test/auth/mintSignInCode.test.ts
git commit -m "feat(server): one code path, whoever typed the address"
```

---

## Task 19: `POST /api/auth/sign-in-codes` and its resend

**Files:**

- Create: `apps/server/src/routes/auth.ts`
- Modify: `apps/server/src/app.ts`
- Test: `apps/server/test/routes/signInCodes.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/server/test/routes/signInCodes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "../helpers/createTestApp.ts";
import {
  NOW,
  insertInstanceSetting,
  insertMember,
  shiftMinutes,
} from "../helpers/seedHelpers.ts";

/** An app whose clock stands still and whose mail can be queued. */
async function _createSignInApp(): Promise<TestApp> {
  const testApp = await createTestApp({
    clock: () => {
      return new Date(NOW);
    },
  });
  await insertInstanceSetting(testApp.database, {
    key: "public.base_url",
    value: "https://shoebox.example.com",
  });
  return testApp;
}

describe("POST /api/auth/sign-in-codes", () => {
  it("answers 202 with the normalised address and an expiry", async () => {
    const { app, close } = await _createSignInApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/sign-in-codes",
      payload: { email: "  Abuela@Example.COM " },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({
      email: "abuela@example.com",
      expiresAt: shiftMinutes({ instant: NOW, minutes: 10 }),
    });
    await close();
  });

  it("is byte-identical for an unknown address and a member's", async () => {
    // The form must not be usable to discover who is a member. The two
    // addresses are the same length deliberately: a different length would
    // make `content-length` differ for a reason that has nothing to do with
    // membership, and prove nothing either way.
    const { app, database, close } = await _createSignInApp();
    await insertMember(database, { email: "abuela@example.com" });

    const known = await app.inject({
      method: "POST",
      url: "/api/auth/sign-in-codes",
      payload: { email: "abuela@example.com" },
    });
    const unknown = await app.inject({
      method: "POST",
      url: "/api/auth/sign-in-codes",
      payload: { email: "nobody@example.com" },
    });

    expect(unknown.statusCode).toBe(known.statusCode);
    expect(unknown.headers["content-type"]).toBe(known.headers["content-type"]);
    expect(unknown.headers["content-length"]).toBe(
      known.headers["content-length"],
    );
    expect(Object.keys(unknown.json())).toEqual(Object.keys(known.json()));
    expect(unknown.json()).toEqual({
      email: "nobody@example.com",
      expiresAt: shiftMinutes({ instant: NOW, minutes: 10 }),
    });

    // Both wrote a code row. Only one is mailed, and that difference is one
    // local INSERT rather than a branch anybody can see.
    const codes = await database
      .selectFrom("sign_in_codes")
      .select("email")
      .execute();
    expect(codes).toHaveLength(2);
    await close();
  });

  it("never calls the provider in band", async () => {
    // A provider timeout on one branch and not the other is the timing
    // difference `auth.md` refuses to allow. The queue is the whole defence:
    // nothing sends inside the request.
    const { app, database, close } = await _createSignInApp();
    await insertMember(database, { email: "abuela@example.com" });

    await app.inject({
      method: "POST",
      url: "/api/auth/sign-in-codes",
      payload: { email: "abuela@example.com" },
    });

    const email = await database
      .selectFrom("outbound_emails")
      .select(["state", "sent_at", "attempts"])
      .executeTakeFirstOrThrow();
    expect(email).toEqual({ state: "queued", sent_at: null, attempts: 0 });
    await close();
  });

  it("refuses a body that is not an address", async () => {
    const { app, close } = await _createSignInApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/sign-in-codes",
      payload: { email: "abuela" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("invalid_request");
    expect(response.json().details.fieldErrors).toHaveProperty("email");
    await close();
  });

  it("stops at five an hour for one address, shared with the resend", async () => {
    const { app, close } = await _createSignInApp();
    const payload = { email: "abuela@example.com" };

    const responses = [];
    // Five mints, then a sixth on the *other* route: the bucket is shared, or
    // the resend is a way round the cap.
    for (let index = 0; index < 5; index += 1) {
      responses.push(
        await app.inject({
          method: "POST",
          url: "/api/auth/sign-in-codes",
          payload,
        }),
      );
    }
    const sixth = await app.inject({
      method: "POST",
      url: "/api/auth/sign-in-codes/resend",
      payload,
    });

    expect(
      responses.map((response) => {
        return response.statusCode;
      }),
    ).toEqual([202, 202, 202, 202, 202]);
    expect(sixth.statusCode).toBe(429);
    expect(sixth.json().error).toBe("rate_limited");
    expect(sixth.json().details.retryAfterSeconds).toBeGreaterThan(0);
    await close();
  });

  it("counts a non-member's attempts too, or the limiter is the oracle", async () => {
    const { app, close } = await _createSignInApp();
    const payload = { email: "nobody@example.com" };

    for (let index = 0; index < 5; index += 1) {
      await app.inject({
        method: "POST",
        url: "/api/auth/sign-in-codes",
        payload,
      });
    }
    const sixth = await app.inject({
      method: "POST",
      url: "/api/auth/sign-in-codes",
      payload,
    });

    expect(sixth.statusCode).toBe(429);
    await close();
  });
});

describe("POST /api/auth/sign-in-codes/resend", () => {
  it("mints, and says so in the same words", async () => {
    const { app, close } = await _createSignInApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/sign-in-codes/resend",
      payload: { email: "abuela@example.com" },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({
      email: "abuela@example.com",
      expiresAt: shiftMinutes({ instant: NOW, minutes: 10 }),
    });
    await close();
  });

  it("stops the old code working, which is what the copy promises", async () => {
    const { app, database, close } = await _createSignInApp();
    await app.inject({
      method: "POST",
      url: "/api/auth/sign-in-codes",
      payload: { email: "abuela@example.com" },
    });
    await app.inject({
      method: "POST",
      url: "/api/auth/sign-in-codes/resend",
      payload: { email: "abuela@example.com" },
    });

    const rows = await database
      .selectFrom("sign_in_codes")
      .select("invalidated_at")
      .orderBy("created_at", "asc")
      .execute();
    expect(rows[0]?.invalidated_at).toBe(NOW);
    expect(rows[1]?.invalidated_at).toBeNull();
    await close();
  });

  it("works without the first route ever having been called", async () => {
    // Somebody reloads the page and presses "Send another".
    const { app, close } = await _createSignInApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/sign-in-codes/resend",
      payload: { email: "abuela@example.com" },
    });
    expect(response.statusCode).toBe(202);
    await close();
  });
});
```

The rate-limit cases use a `for` loop because the requests have to be
sequential and `docs/rules/typescript.md`'s "avoid loops" rule is about
transforming data rather than about driving a sequence of effects. Keep the
loop; do not rewrite it as a `reduce` over promises.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @memory-shoebox/server test test/routes/signInCodes.test.ts`
Expected: FAIL, 404 on every route.

- [ ] **Step 3: Write the route module**

Create `apps/server/src/routes/auth.ts`:

```ts
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  requestSignInCodeRequestSchema,
  type RequestSignInCodeResponse,
} from "@memory-shoebox/shared";
import { mintSignInCode } from "../auth/mintSignInCode.ts";
import { runInImmediateTransaction } from "../db/runInImmediateTransaction.ts";

/**
 * Sign-in codes and sessions: `tech-specs/apis/auth.md`.
 *
 * Every route here is anonymous, and each names the rules that apply to it:
 * rate limiting is applied by the middleware and never by a handler
 * (`conventions.md` § Rate limits).
 */
export async function authRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Both mint routes, which are deliberately the same handler.
   *
   * The split exists so the client's state machine can tell "Send another"
   * (state `resent`, which says plainly that the old code has stopped working)
   * from a first request (state `sent`). The server behaves identically on
   * purpose: a route that behaved differently depending on whether a code was
   * already outstanding would leak that fact.
   */
  const requestSignInCode = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<RequestSignInCodeResponse> => {
    const body = requestSignInCodeRequestSchema.parse(request.body);
    const now = request.server.clock().toISOString();

    const minted = await runInImmediateTransaction({
      database: request.server.database,
      callback: (transaction) => {
        return mintSignInCode({
          transaction,
          email: body.email,
          pepper: request.server.config.signInCodePepper,
          now,
        });
      },
    });

    // 202 rather than 200: nothing has been sent when this is written. The row
    // is committed and the message is queued; the provider is never called
    // inside the request.
    void reply.code(202);
    // The echoed address proves nothing: it is the caller's own input, echoed
    // so the copy can bold the canonical form.
    return { email: body.email, expiresAt: minted.expiresAt };
  };

  app.post(
    "/auth/sign-in-codes",
    {
      config: {
        rateLimit: ["signInCodeRequestPerAddress", "signInCodeRequestPerIp"],
      },
    },
    requestSignInCode,
  );

  // The same two rules, and therefore the same buckets: the per-address one is
  // shared, or the resend is a way round the cap (`auth.md` Ruling 3).
  app.post(
    "/auth/sign-in-codes/resend",
    {
      config: {
        rateLimit: ["signInCodeRequestPerAddress", "signInCodeRequestPerIp"],
      },
    },
    requestSignInCode,
  );
}
```

- [ ] **Step 4: Register it**

In `apps/server/src/app.ts`, import `authRoutes` and add it inside the
existing `app.register` block:

```ts
await app.register(
  async (api) => {
    await healthRoutes(api);
    await authRoutes(api);
  },
  { prefix: API_PREFIX },
);
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @memory-shoebox/server test test/routes/signInCodes.test.ts`
Expected: PASS, nine cases.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/routes/auth.ts apps/server/src/app.ts apps/server/test/routes/signInCodes.test.ts
git commit -m "feat(server): asking for a code, and asking for another"
```

---

## Task 20: Redeeming a code

**Files:**

- Create: `apps/server/src/auth/createSessionForMember.ts`
- Create: `apps/server/src/members/seedItemViews.ts`
- Create: `apps/server/src/auth/redeemSignInCode.ts`
- Test: `apps/server/test/auth/redeemSignInCode.test.ts`

The transaction `auth.md` § `POST /api/auth/session` specifies, step by step.
The route itself is the next task; this one is everything it does.

**The single most important thing in this task:** the transaction **returns**
an outcome and the route throws the `ApiError`. Throwing inside the
transaction rolls back the attempt increment, so a wrong code would never
count down and "two tries left" would never arrive. If you find yourself
writing `throw ApiError.signInCodeInvalid(...)` inside `runInImmediateTransaction`,
stop.

- [ ] **Step 1: Write the failing test**

Create `apps/server/test/auth/redeemSignInCode.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import type { Kysely } from "kysely";
import { mintSignInCode } from "../../src/auth/mintSignInCode.ts";
import { redeemSignInCode } from "../../src/auth/redeemSignInCode.ts";
import { makeTokenHashFromToken } from "../../src/auth/sessionToken.ts";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { runInImmediateTransaction } from "../../src/db/runInImmediateTransaction.ts";
import type { Database } from "../../src/db/types/db.types.ts";
import {
  NOW,
  insertInstanceSetting,
  insertInvitation,
  insertItem,
  insertMember,
  insertSession,
  shiftDays,
  shiftMinutes,
} from "../helpers/seedHelpers.ts";

const PEPPER = Buffer.from("a".repeat(64), "hex");
const USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

describe("redeemSignInCode", () => {
  let database: Kysely<Database>;

  /** Mints one code the way the request route does. */
  async function mint(email: string, now = NOW) {
    return runInImmediateTransaction({
      database,
      callback: (transaction) => {
        return mintSignInCode({ transaction, email, pepper: PEPPER, now });
      },
    });
  }

  /** Redeems, with the defaults a route would pass. */
  async function redeem(options: {
    email: string;
    code: string;
    now?: string;
    presentedToken?: string;
  }) {
    return redeemSignInCode({
      database,
      email: options.email,
      code: options.code,
      pepper: PEPPER,
      now: options.now ?? NOW,
      userAgent: USER_AGENT,
      presentedToken: options.presentedToken,
    });
  }

  beforeEach(async () => {
    database = createDatabase(":memory:");
    await migrateToLatest(database);
    await insertInstanceSetting(database, {
      key: "public.base_url",
      value: "https://shoebox.example.com",
    });
  });

  it("is expired when no code was ever asked for", async () => {
    await insertMember(database, { email: "rosa@example.com" });
    expect(await redeem({ email: "rosa@example.com", code: "410233" })).toEqual(
      {
        kind: "expired",
      },
    );
  });

  it("is expired past ten minutes, and writes nothing", async () => {
    await insertMember(database, { email: "rosa@example.com" });
    const minted = await mint("rosa@example.com");

    const outcome = await redeem({
      email: "rosa@example.com",
      code: minted.digits,
      now: shiftMinutes({ instant: NOW, minutes: 11 }),
    });

    expect(outcome).toEqual({ kind: "expired" });
    const row = await database
      .selectFrom("sign_in_codes")
      .select(["attempts", "consumed_at"])
      .executeTakeFirstOrThrow();
    expect(row).toEqual({ attempts: 0, consumed_at: null });
  });

  it("is expired for a code that has already been used", async () => {
    await insertMember(database, { email: "rosa@example.com" });
    const minted = await mint("rosa@example.com");
    await redeem({ email: "rosa@example.com", code: minted.digits });

    expect(
      await redeem({ email: "rosa@example.com", code: minted.digits }),
    ).toEqual({ kind: "expired" });
  });

  it("counts down from three on a wrong code", async () => {
    await insertMember(database, { email: "rosa@example.com" });
    await mint("rosa@example.com");

    expect(await redeem({ email: "rosa@example.com", code: "000000" })).toEqual(
      {
        kind: "invalid",
        attemptsRemaining: 2,
      },
    );
    expect(await redeem({ email: "rosa@example.com", code: "000000" })).toEqual(
      {
        kind: "invalid",
        attemptsRemaining: 1,
      },
    );
  });

  it("mints a replacement on the third wrong code", async () => {
    await insertMember(database, { email: "rosa@example.com" });
    const first = await mint("rosa@example.com");

    await redeem({ email: "rosa@example.com", code: "000000" });
    await redeem({ email: "rosa@example.com", code: "000000" });
    expect(await redeem({ email: "rosa@example.com", code: "000000" })).toEqual(
      {
        kind: "exhausted",
      },
    );

    const rows = await database
      .selectFrom("sign_in_codes")
      .select(["id", "invalidated_at"])
      .orderBy("created_at", "asc")
      .execute();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ id: first.codeId, invalidated_at: NOW });
    expect(rows[1]?.invalidated_at).toBeNull();

    // The copy promises it, so the replacement is really sent.
    const emails = await database
      .selectFrom("outbound_emails")
      .select("id")
      .execute();
    expect(emails).toHaveLength(2);
  });

  it("treats a correct guess at an unknown address as a wrong one", async () => {
    // One chance in a million per attempt, and it must not be
    // distinguishable from a miss (`auth.md`, transformation 4).
    const minted = await mint("nobody@example.com");

    expect(
      await redeem({ email: "nobody@example.com", code: minted.digits }),
    ).toEqual({ kind: "invalid", attemptsRemaining: 2 });
  });

  it("treats a removed member's correct code as a wrong one", async () => {
    await insertMember(database, {
      email: "gone@example.com",
      status: "removed",
      removed_at: NOW,
    });
    const minted = await mint("gone@example.com");

    expect(
      await redeem({ email: "gone@example.com", code: minted.digits }),
    ).toEqual({ kind: "invalid", attemptsRemaining: 2 });
  });

  it("creates a session, labelled and hashed, on the right code", async () => {
    const memberId = await insertMember(database, {
      email: "rosa@example.com",
    });
    const minted = await mint("rosa@example.com");

    const outcome = await redeem({
      email: "rosa@example.com",
      code: minted.digits,
    });
    expect(outcome.kind).toBe("created");
    if (outcome.kind !== "created") {
      return;
    }

    const row = await database
      .selectFrom("sessions")
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(row.id).toBe(outcome.session.sessionId);
    expect(row.member_id).toBe(memberId);
    expect(row.device_label).toBe("iPhone, Safari");
    expect(row.user_agent).toBe(USER_AGENT);
    expect(row.token_hash).toBe(makeTokenHashFromToken(outcome.session.token));
    expect(row.expires_at).toBe(shiftDays({ instant: NOW, days: 30 }));

    const code = await database
      .selectFrom("sign_in_codes")
      .select("consumed_at")
      .executeTakeFirstOrThrow();
    expect(code.consumed_at).toBe(NOW);
  });

  it("writes last_signed_in_at on every redemption", async () => {
    const memberId = await insertMember(database, {
      email: "rosa@example.com",
      last_signed_in_at: null,
    });
    const minted = await mint("rosa@example.com");
    await redeem({ email: "rosa@example.com", code: minted.digits });

    const row = await database
      .selectFrom("members")
      .select("last_signed_in_at")
      .where("id", "=", memberId)
      .executeTakeFirstOrThrow();
    expect(row.last_signed_in_at).toBe(NOW);
  });

  it("accepts the invitation and seeds the archive on a first sign-in", async () => {
    const adminId = await insertMember(database, {
      email: "papa@example.com",
      role: "admin",
    });
    const memberId = await insertMember(database, {
      email: "ines@example.com",
      status: "invited",
      joined_at: null,
      last_signed_in_at: null,
    });
    const invitationId = await insertInvitation(database, {
      memberId,
      invitedByMemberId: adminId,
    });
    const itemId = await insertItem(database, { uploadedBy: adminId });

    const minted = await mint("ines@example.com");
    const outcome = await redeem({
      email: "ines@example.com",
      code: minted.digits,
    });
    expect(outcome).toMatchObject({ isFirstSignIn: true });

    const member = await database
      .selectFrom("members")
      .select(["joined_at", "status"])
      .where("id", "=", memberId)
      .executeTakeFirstOrThrow();
    expect(member).toEqual({ joined_at: NOW, status: "active" });

    const invitation = await database
      .selectFrom("invitations")
      .select("accepted_at")
      .where("id", "=", invitationId)
      .executeTakeFirstOrThrow();
    expect(invitation.accepted_at).toBe(NOW);

    // The accent dot means "arrived since you joined", so every item that
    // already exists is seeded as seen, with no visibility predicate at all.
    const views = await database.selectFrom("item_views").selectAll().execute();
    expect(views).toHaveLength(1);
    expect(views[0]).toMatchObject({
      member_id: memberId,
      item_id: itemId,
      first_seen_at: NOW,
      first_opened_at: null,
      open_count: 0,
    });
  });

  it("seeds items the new member cannot see, which is the point", async () => {
    const adminId = await insertMember(database, {
      email: "papa@example.com",
      role: "admin",
    });
    await insertMember(database, {
      email: "ines@example.com",
      status: "invited",
      joined_at: null,
    });
    // Two items, one of them restricted to somebody else. Filtering the seed
    // by visibility would light the second one up later, the day a rule
    // changed.
    await insertItem(database, { uploadedBy: adminId });
    await insertItem(database, { uploadedBy: adminId, seq: 1 });

    const minted = await mint("ines@example.com");
    await redeem({ email: "ines@example.com", code: minted.digits });

    const views = await database
      .selectFrom("item_views")
      .select("id")
      .execute();
    expect(views).toHaveLength(2);
  });

  it("does not seed or re-accept on a second sign-in", async () => {
    const adminId = await insertMember(database, {
      email: "papa@example.com",
      role: "admin",
    });
    await insertMember(database, {
      email: "rosa@example.com",
      joined_at: NOW,
    });
    await insertItem(database, { uploadedBy: adminId });

    const minted = await mint("rosa@example.com");
    const outcome = await redeem({
      email: "rosa@example.com",
      code: minted.digits,
    });

    expect(outcome).toMatchObject({ isFirstSignIn: false });
    const views = await database
      .selectFrom("item_views")
      .select("id")
      .execute();
    expect(views).toEqual([]);
  });

  it("deletes the session the presented cookie still resolves to", async () => {
    const memberId = await insertMember(database, {
      email: "rosa@example.com",
    });
    const oldSessionId = await insertSession(database, {
      memberId,
      token_hash: makeTokenHashFromToken("an-old-token"),
    });
    const minted = await mint("rosa@example.com");

    await redeem({
      email: "rosa@example.com",
      code: minted.digits,
      presentedToken: "an-old-token",
    });

    const rows = await database
      .selectFrom("sessions")
      .select("id")
      .where("id", "=", oldSessionId)
      .execute();
    expect(rows).toEqual([]);
  });

  it("gives three attempts in total to two submissions at once", async () => {
    // Without BEGIN IMMEDIATE each submission reads attempts = 0 and each
    // gets three tries (`data-models.md` § `sign_in_codes`).
    await insertMember(database, { email: "rosa@example.com" });
    const first = await mint("rosa@example.com");

    await Promise.all([
      redeem({ email: "rosa@example.com", code: "000000" }),
      redeem({ email: "rosa@example.com", code: "000000" }),
      redeem({ email: "rosa@example.com", code: "000000" }),
    ]);

    const rows = await database
      .selectFrom("sign_in_codes")
      .select(["id", "attempts", "invalidated_at"])
      .orderBy("created_at", "asc")
      .execute();
    expect(rows[0]).toEqual({
      id: first.codeId,
      attempts: 3,
      invalidated_at: NOW,
    });
    expect(rows).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @memory-shoebox/server test test/auth/redeemSignInCode.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the session insert**

Create `apps/server/src/auth/createSessionForMember.ts`:

```ts
import type { Kysely } from "kysely";
import { createId } from "../db/createId.ts";
import type { Database } from "../db/types/db.types.ts";
import { getDeviceLabelFromUserAgent } from "./getDeviceLabelFromUserAgent.ts";
import { createSessionToken, makeTokenHashFromToken } from "./sessionToken.ts";
import { SESSION_LIFETIME_DAYS } from "./auth.constants.ts";

/** One day in milliseconds. */
const DAY_MS = 24 * 60 * 60 * 1000;

/** The row that was written, and the token only the cookie will carry. */
export type CreatedSession = {
  sessionId: string;
  /** In the clear, for the `Set-Cookie`. Only its SHA-256 is stored. */
  token: string;
  deviceLabel: string;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
};

/**
 * Writes one `sessions` row and returns the cookie value for it.
 *
 * `device_label` is parsed once here and stored, so a later parser upgrade
 * never relabels a device somebody already recognises. `user_agent` is kept
 * raw as the fallback and is never returned in any payload
 * (`conventions.md` § Forbidden in any payload).
 *
 * @param options.transaction The redemption's transaction.
 * @param options.memberId Whose device this is.
 * @param options.userAgent The request header, or undefined.
 * @param options.now The redemption instant.
 */
export async function createSessionForMember(options: {
  transaction: Kysely<Database>;
  memberId: string;
  userAgent: string | undefined;
  now: string;
}): Promise<CreatedSession> {
  const sessionId = createId();
  const token = createSessionToken();
  const deviceLabel = getDeviceLabelFromUserAgent(options.userAgent);
  const expiresAt = new Date(
    Date.parse(options.now) + SESSION_LIFETIME_DAYS * DAY_MS,
  ).toISOString();

  await options.transaction
    .insertInto("sessions")
    .values({
      id: sessionId,
      member_id: options.memberId,
      token_hash: makeTokenHashFromToken(token),
      device_label: deviceLabel,
      user_agent: options.userAgent ?? null,
      created_at: options.now,
      last_used_at: options.now,
      expires_at: expiresAt,
    })
    .execute();

  return {
    sessionId,
    token,
    deviceLabel,
    createdAt: options.now,
    lastUsedAt: options.now,
    expiresAt,
  };
}
```

- [ ] **Step 4: Write the seed**

Create `apps/server/src/members/seedItemViews.ts`:

```ts
import { sql, type Kysely } from "kysely";
import type { Database } from "../db/types/db.types.ts";

/**
 * Marks every item that already exists as seen by a brand-new member.
 *
 * Decision 3: the accent dot means **"arrived since you joined"**, not
 * "exists". Without this, all 2,147 items carry a dot on somebody's first
 * morning, they scroll a few days, and several hundred stay marked new
 * forever, which drains the accent of meaning everywhere else in the product.
 *
 * **No visibility predicate**, deliberately: filtering here would light up old
 * photographs later, the day a rule changed.
 *
 * **One statement.** Roughly 17,000 rows for a nine-person Shoebox, once, in
 * milliseconds; a uuid minted per row in application code would make it 17,000
 * round trips, which is why `db/client.ts` registers `create_id()` as a SQL
 * function. It writes `first_seen_at` only, so a new member does not appear on
 * surface 17 as having opened the entire archive.
 *
 * The `where 1 = 1` is not decoration: SQLite cannot parse an upsert clause
 * attached to an `INSERT ... SELECT` without a `WHERE`, and the
 * `ON CONFLICT DO NOTHING` is what makes this safe to run twice.
 */
export async function seedItemViews(options: {
  transaction: Kysely<Database>;
  memberId: string;
  now: string;
}): Promise<void> {
  await sql`
    insert into item_views (id, member_id, item_id, first_seen_at)
    select create_id(), ${options.memberId}, item.id, ${options.now}
    from items as item
    where 1 = 1
    on conflict do nothing
  `.execute(options.transaction);
}
```

- [ ] **Step 5: Write the redemption**

Create `apps/server/src/auth/redeemSignInCode.ts`:

```ts
import type { Kysely } from "kysely";
import { runInImmediateTransaction } from "../db/runInImmediateTransaction.ts";
import type { Database } from "../db/types/db.types.ts";
import { seedItemViews } from "../members/seedItemViews.ts";
import {
  createSessionForMember,
  type CreatedSession,
} from "./createSessionForMember.ts";
import { mintSignInCode } from "./mintSignInCode.ts";
import { makeTokenHashFromToken } from "./sessionToken.ts";
import {
  isMatchingCodeHash,
  makeCodeHashFromDigits,
} from "./signInCodeHelpers.ts";

/**
 * What the transaction decided.
 *
 * **Returned rather than thrown.** The route turns each of these into its
 * `ApiError`, because throwing inside the transaction would roll back the
 * attempt increment and a wrong code would never count down.
 */
export type RedeemSignInCodeOutcome =
  | { kind: "expired" }
  | { kind: "invalid"; attemptsRemaining: number }
  | { kind: "exhausted" }
  | {
      kind: "created";
      memberId: string;
      isFirstSignIn: boolean;
      session: CreatedSession;
    };

/** Everything the redemption needs. */
export type RedeemSignInCodeInput = {
  database: Kysely<Database>;
  /** Normalised. */
  email: string;
  /** Six digits, as typed. */
  code: string;
  pepper: Buffer;
  now: string;
  userAgent: string | undefined;
  /** The cookie this request presented, if any. */
  presentedToken: string | undefined;
};

/** The live code for an address: at most one, because every mint supersedes. */
async function _getLiveCode(options: {
  transaction: Kysely<Database>;
  email: string;
  now: string;
}) {
  return options.transaction
    .selectFrom("sign_in_codes")
    .select(["id", "member_id", "code_hash", "attempts", "max_attempts"])
    .where("email", "=", options.email)
    .where("consumed_at", "is", null)
    .where("invalidated_at", "is", null)
    .where("expires_at", ">", options.now)
    .orderBy("created_at", "desc")
    .executeTakeFirst();
}

/** The member the code names, when they may still sign in. */
async function _getUsableMember(options: {
  transaction: Kysely<Database>;
  memberId: string | null;
}) {
  if (options.memberId === null) {
    return undefined;
  }
  // `status` alone decides whether an address may sign in
  // (`data-models.md` § `invitations`), which is what makes a lapsed
  // invitation, a revoked one and a removal one question rather than three.
  return options.transaction
    .selectFrom("members")
    .select(["id", "joined_at"])
    .where("id", "=", options.memberId)
    .where("status", "in", ["invited", "active"])
    .executeTakeFirst();
}

/** Counts a wrong attempt, and replaces the code when it was the last. */
async function _countWrongAttempt(options: {
  transaction: Kysely<Database>;
  code: { id: string; attempts: number; max_attempts: number };
  email: string;
  pepper: Buffer;
  now: string;
}): Promise<RedeemSignInCodeOutcome> {
  const attempts = options.code.attempts + 1;
  await options.transaction
    .updateTable("sign_in_codes")
    .set({ attempts })
    .where("id", "=", options.code.id)
    .execute();

  if (attempts < options.code.max_attempts) {
    // Read off the row after the increment, never from a constant: the first
    // wrong code of three gives 2, which is the mockup's "Two tries left".
    return {
      kind: "invalid",
      attemptsRemaining: options.code.max_attempts - attempts,
    };
  }

  // "Two tries left before we send you a new one" is a promise, and the
  // alternative reading strands the least technical person in the family at a
  // dead end (`auth.md` Ruling 2).
  await options.transaction
    .updateTable("sign_in_codes")
    .set({ invalidated_at: options.now })
    .where("id", "=", options.code.id)
    .execute();
  await mintSignInCode({
    transaction: options.transaction,
    email: options.email,
    pepper: options.pepper,
    now: options.now,
  });
  return { kind: "exhausted" };
}

/** Consumes the code and signs the member in. */
async function _acceptCode(options: {
  transaction: Kysely<Database>;
  codeId: string;
  member: { id: string; joined_at: string | null };
  input: RedeemSignInCodeInput;
}): Promise<RedeemSignInCodeOutcome> {
  const { transaction, member, input } = options;
  const now = input.now;

  // Single use is `consumed_at` being null.
  await transaction
    .updateTable("sign_in_codes")
    .set({ consumed_at: now })
    .where("id", "=", options.codeId)
    .execute();

  // The cookie is about to be overwritten, so leaving that row live would
  // strand an unreachable device in somebody's list with no way to recognise
  // it.
  if (input.presentedToken !== undefined) {
    await transaction
      .deleteFrom("sessions")
      .where("token_hash", "=", makeTokenHashFromToken(input.presentedToken))
      .execute();
  }

  const session = await createSessionForMember({
    transaction,
    memberId: member.id,
    userAgent: input.userAgent,
    now,
  });

  // Accepting an invitation is the first successful sign-in and nothing else:
  // the invitation carries no credential (Decision 2).
  const isFirstSignIn = member.joined_at === null;
  await transaction
    .updateTable("members")
    .set({
      // Unthrottled: it is once per redemption rather than once per request,
      // and it is a different fact from `last_seen_at`.
      last_signed_in_at: now,
      ...(isFirstSignIn ? { joined_at: now, status: "active" } : {}),
    })
    .where("id", "=", member.id)
    .execute();

  if (isFirstSignIn) {
    await transaction
      .updateTable("invitations")
      .set({ accepted_at: now })
      .where("member_id", "=", member.id)
      .where("accepted_at", "is", null)
      .where("revoked_at", "is", null)
      .execute();
    await seedItemViews({ transaction, memberId: member.id, now });
  }

  return { kind: "created", memberId: member.id, isFirstSignIn, session };
}

/**
 * Redeems a six-digit code into a session, in one `BEGIN IMMEDIATE`
 * transaction (`auth.md` § `POST /api/auth/session`).
 *
 * **A correct guess against an address with no usable member takes the wrong
 * path unchanged**, including the increment and the exhaustion: one chance in
 * a million per attempt must not be distinguishable from a miss, or the form
 * becomes a membership oracle after all.
 */
export async function redeemSignInCode(
  input: RedeemSignInCodeInput,
): Promise<RedeemSignInCodeOutcome> {
  return runInImmediateTransaction({
    database: input.database,
    callback: async (transaction) => {
      const code = await _getLiveCode({
        transaction,
        email: input.email,
        now: input.now,
      });
      // None means expired, superseded, consumed or never issued. Nothing else
      // is attempted and nothing is written.
      if (code === undefined) {
        return { kind: "expired" };
      }

      const member = await _getUsableMember({
        transaction,
        memberId: code.member_id,
      });
      const isMatch = isMatchingCodeHash({
        left: code.code_hash,
        right: makeCodeHashFromDigits({
          digits: input.code,
          pepper: input.pepper,
        }),
      });

      if (!isMatch || member === undefined) {
        return _countWrongAttempt({
          transaction,
          code,
          email: input.email,
          pepper: input.pepper,
          now: input.now,
        });
      }

      return _acceptCode({ transaction, codeId: code.id, member, input });
    },
  });
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @memory-shoebox/server test test/auth/redeemSignInCode.test.ts`
Expected: PASS, fourteen cases.

If the seed statement fails with a SQLite parse error, the `where 1 = 1` has
been dropped: SQLite cannot parse `ON CONFLICT` after a `SELECT` without it.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/auth/redeemSignInCode.ts apps/server/src/auth/createSessionForMember.ts apps/server/src/members/seedItemViews.ts apps/server/test/auth/redeemSignInCode.test.ts
git commit -m "feat(server): the transaction that turns six digits into a session"
```

---

## Task 21: `POST /api/auth/session` and `DELETE /api/auth/session`

**Files:**

- Modify: `apps/server/src/routes/auth.ts`
- Test: `apps/server/test/routes/session.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/server/test/routes/session.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Kysely } from "kysely";
import { mintSignInCode } from "../../src/auth/mintSignInCode.ts";
import { SESSION_COOKIE_NAME } from "../../src/auth/sessionCookie.ts";
import { makeTokenHashFromToken } from "../../src/auth/sessionToken.ts";
import { runInImmediateTransaction } from "../../src/db/runInImmediateTransaction.ts";
import type { Database } from "../../src/db/types/db.types.ts";
import { createTestApp, type TestApp } from "../helpers/createTestApp.ts";
import {
  NOW,
  insertInstanceSetting,
  insertItem,
  insertMember,
  insertSession,
  shiftDays,
} from "../helpers/seedHelpers.ts";

const USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

/** An app whose clock stands still, with mail configured. */
async function _createSessionApp(): Promise<TestApp> {
  const testApp = await createTestApp({
    clock: () => {
      return new Date(NOW);
    },
  });
  await insertInstanceSetting(testApp.database, {
    key: "public.base_url",
    value: "https://shoebox.example.com",
  });
  return testApp;
}

/** Mints a code for an address and hands back its digits. */
async function _mintFor(options: {
  testApp: TestApp;
  email: string;
}): Promise<string> {
  const minted = await runInImmediateTransaction({
    database: options.testApp.database,
    callback: (transaction) => {
      return mintSignInCode({
        transaction,
        email: options.email,
        pepper: options.testApp.config.signInCodePepper,
        now: NOW,
      });
    },
  });
  return minted.digits;
}

describe("POST /api/auth/session", () => {
  it("answers 201 with the account, the device and the shell's settings", async () => {
    const testApp = await _createSessionApp();
    const { app, close } = testApp;
    await insertMember(testApp.database, {
      email: "abuela@example.com",
      display_name: "Abuela Rosa",
      role: "uploader",
    });
    const code = await _mintFor({ testApp, email: "abuela@example.com" });

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/session",
      headers: { "user-agent": USER_AGENT },
      payload: { email: "abuela@example.com", code },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(Object.keys(body).sort()).toEqual([
      "isFirstSignIn",
      "me",
      "session",
      "settings",
    ]);
    expect(body.me.member.displayName).toBe("Abuela Rosa");
    expect(body.me.email).toBe("abuela@example.com");
    expect(body.me.role).toBe("uploader");
    expect(body.session).toMatchObject({
      deviceLabel: "iPhone, Safari",
      createdAt: NOW,
      lastUsedAt: NOW,
      expiresAt: shiftDays({ instant: NOW, days: 30 }),
      isCurrent: true,
    });
    expect(body.settings).toEqual({
      shoeboxName: "My Shoebox",
      pileArrangement: "messy",
      timezone: "UTC",
    });
    await close();
  });

  it("sets a cookie the browser will keep and script cannot read", async () => {
    const testApp = await _createSessionApp();
    const { app, database, close } = testApp;
    await insertMember(database, { email: "abuela@example.com" });
    const code = await _mintFor({ testApp, email: "abuela@example.com" });

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { email: "abuela@example.com", code },
    });

    const setCookie = String(response.headers["set-cookie"]);
    expect(setCookie).toMatch(new RegExp(`^${SESSION_COOKIE_NAME}=`));
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toContain("Max-Age=2592000");

    // The cookie value is not the row: only its SHA-256 is stored.
    const token = setCookie.split(";")[0]?.split("=")[1] ?? "";
    const row = await database
      .selectFrom("sessions")
      .select("token_hash")
      .executeTakeFirstOrThrow();
    expect(row.token_hash).toBe(makeTokenHashFromToken(token));
    await close();
  });

  it("says nothing about how many items were seeded", async () => {
    // The number is the size of the whole archive rather than a
    // viewer-filtered count, so publishing it would tell a brand-new viewer
    // exactly how much exists beyond what they can open.
    const testApp = await _createSessionApp();
    const { app, database, close } = testApp;
    const adminId = await insertMember(database, {
      email: "papa@example.com",
      role: "admin",
    });
    await insertMember(database, {
      email: "ines@example.com",
      status: "invited",
      joined_at: null,
    });
    await insertItem(database, { uploadedBy: adminId });
    await insertItem(database, { uploadedBy: adminId, seq: 1 });
    await insertItem(database, { uploadedBy: adminId, seq: 2 });

    const code = await _mintFor({ testApp, email: "ines@example.com" });
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { email: "ines@example.com", code },
    });

    expect(response.json().isFirstSignIn).toBe(true);
    expect(response.payload).not.toContain("3");
    await close();
  });

  it("answers 401 with the tries left on a wrong code", async () => {
    const testApp = await _createSessionApp();
    const { app, database, close } = testApp;
    await insertMember(database, { email: "abuela@example.com" });
    await _mintFor({ testApp, email: "abuela@example.com" });

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { email: "abuela@example.com", code: "000000" },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: "sign_in_code_invalid",
      details: { attemptsRemaining: 2 },
    });
    await close();
  });

  it("answers 410 and promises a new code on the third wrong one", async () => {
    const testApp = await _createSessionApp();
    const { app, database, close } = testApp;
    await insertMember(database, { email: "abuela@example.com" });
    await _mintFor({ testApp, email: "abuela@example.com" });

    const wrong = {
      method: "POST" as const,
      url: "/api/auth/session",
      payload: { email: "abuela@example.com", code: "000000" },
    };
    await app.inject(wrong);
    await app.inject(wrong);
    const third = await app.inject(wrong);

    expect(third.statusCode).toBe(410);
    expect(third.json().error).toBe("sign_in_code_attempts_exhausted");
    expect(third.json().message).toMatch(/on its way/);

    const emails = await database
      .selectFrom("outbound_emails")
      .select("id")
      .execute();
    expect(emails).toHaveLength(2);
    await close();
  });

  it("answers 410 when there is no live code", async () => {
    const testApp = await _createSessionApp();
    const { app, database, close } = testApp;
    await insertMember(database, { email: "abuela@example.com" });

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { email: "abuela@example.com", code: "410233" },
    });

    expect(response.statusCode).toBe(410);
    expect(response.json().error).toBe("sign_in_code_expired");
    await close();
  });

  it("refuses a code that is not six digits", async () => {
    const testApp = await _createSessionApp();
    const { app, close } = testApp;

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { email: "abuela@example.com", code: "4102" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().details.fieldErrors).toHaveProperty("code");
    await close();
  });

  it("stops at ten submissions an hour for one address", async () => {
    const testApp = await _createSessionApp();
    const { app, close } = testApp;
    const payload = { email: "abuela@example.com", code: "000000" };

    for (let index = 0; index < 10; index += 1) {
      await app.inject({ method: "POST", url: "/api/auth/session", payload });
    }
    const eleventh = await app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload,
    });

    expect(eleventh.statusCode).toBe(429);
    expect(eleventh.json().error).toBe("rate_limited");
    await close();
  });
});

describe("DELETE /api/auth/session", () => {
  it("signs the device out and clears the cookie", async () => {
    const { app, database, close } = await _createSessionApp();
    const memberId = await insertMember(database, {
      email: "abuela@example.com",
    });
    const sessionId = await insertSession(database, {
      memberId,
      token_hash: makeTokenHashFromToken("a-live-token"),
    });

    const response = await app.inject({
      method: "DELETE",
      url: "/api/auth/session",
      headers: { cookie: `${SESSION_COOKIE_NAME}=a-live-token` },
    });

    expect(response.statusCode).toBe(204);
    expect(String(response.headers["set-cookie"])).toContain("Max-Age=0");
    const rows = await database
      .selectFrom("sessions")
      .select("id")
      .where("id", "=", sessionId)
      .execute();
    expect(rows).toEqual([]);
    await close();
  });

  it("answers 204 for a cookie that no longer resolves", async () => {
    // Signing out must never fail: somebody pressing "sign out" and being told
    // they are not signed in has been failed by the software.
    const { app, close } = await _createSessionApp();

    const response = await app.inject({
      method: "DELETE",
      url: "/api/auth/session",
      headers: { cookie: `${SESSION_COOKIE_NAME}=already-gone` },
    });

    expect(response.statusCode).toBe(204);
    expect(String(response.headers["set-cookie"])).toContain("Max-Age=0");
    await close();
  });

  it("answers 401 when no cookie was presented at all", async () => {
    const { app, close } = await _createSessionApp();

    const response = await app.inject({
      method: "DELETE",
      url: "/api/auth/session",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error).toBe("not_signed_in");
    await close();
  });

  it("does not touch last_seen_at, because signing out is not being seen", async () => {
    const { app, database, close } = await _createSessionApp();
    const memberId = await insertMember(database, {
      email: "abuela@example.com",
      last_seen_at: null,
    });
    await insertSession(database, {
      memberId,
      token_hash: makeTokenHashFromToken("a-live-token"),
      last_used_at: NOW,
    });

    await app.inject({
      method: "DELETE",
      url: "/api/auth/session",
      headers: { cookie: `${SESSION_COOKIE_NAME}=a-live-token` },
    });

    const row = await database
      .selectFrom("members")
      .select("last_seen_at")
      .where("id", "=", memberId)
      .executeTakeFirstOrThrow();
    expect(row.last_seen_at).toBeNull();
    await close();
  });
});
```

The last case needs the authenticator not to have slid `last_seen_at` on its
way past. It will not: the seeded session was used at `NOW` and the app's clock
is `NOW`, so the slide is not due. If it fails, the throttle is broken, not the
test.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @memory-shoebox/server test test/routes/session.test.ts`
Expected: FAIL, 404 on both routes.

- [ ] **Step 3: Add both routes**

In `apps/server/src/routes/auth.ts`, add the imports:

```ts
import {
  createSessionRequestSchema,
  type CreateSessionResponse,
} from "@memory-shoebox/shared";
import { ApiError } from "../http/ApiError.ts";
import { redeemSignInCode } from "../auth/redeemSignInCode.ts";
import {
  clearSessionCookie,
  getSessionTokenFromRequest,
  setSessionCookie,
} from "../auth/sessionCookie.ts";
import { getMeDtoFromMemberId } from "../members/getMeDtoFromMemberId.ts";
import { readShellSettings } from "../settings/readShellSettings.ts";
```

Add inside `authRoutes`, after the two mint routes:

```ts
app.post(
  "/auth/session",
  { config: { rateLimit: ["sessionCreatePerAddress"] } },
  async (request, reply): Promise<CreateSessionResponse> => {
    const body = createSessionRequestSchema.parse(request.body);
    const outcome = await redeemSignInCode({
      database: request.server.database,
      email: body.email,
      code: body.code,
      pepper: request.server.config.signInCodePepper,
      now: request.server.clock().toISOString(),
      userAgent: request.headers["user-agent"],
      presentedToken: getSessionTokenFromRequest(request),
    });

    // The refusals are thrown here rather than inside the transaction: a
    // throw in there rolls back the attempt increment, and a wrong code that
    // does not count down never reaches "two tries left".
    if (outcome.kind === "expired") {
      throw ApiError.gone("sign_in_code_expired");
    }
    if (outcome.kind === "invalid") {
      throw ApiError.signInCodeInvalid(outcome.attemptsRemaining);
    }
    if (outcome.kind === "exhausted") {
      throw ApiError.signInCodeAttemptsExhausted();
    }

    setSessionCookie({ reply, token: outcome.session.token });
    void reply.code(201);
    return {
      me: await getMeDtoFromMemberId({
        database: request.server.database,
        memberId: outcome.memberId,
      }),
      session: {
        sessionId: outcome.session.sessionId,
        deviceLabel: outcome.session.deviceLabel,
        createdAt: outcome.session.createdAt,
        lastUsedAt: outcome.session.lastUsedAt,
        expiresAt: outcome.session.expiresAt,
        // The device this request just created.
        isCurrent: true,
      },
      isFirstSignIn: outcome.isFirstSignIn,
      settings: await readShellSettings(request.server.database),
    };
  },
);

/**
 * Signing out, which must never fail.
 *
 * **The one route in the product that must not call `requireViewer`**
 * (`conventions.md` § The auth middleware): a dead, expired or absent cookie
 * still gets the clearing header, because a person pressing "sign out" and
 * being told they are not signed in has been failed by the software rather
 * than informed by it. The 401 is kept for the one case where there is
 * nothing at all to sign out of.
 *
 * The delete keys on the presented token rather than on `viewer.sessionId`,
 * which is the same row when there is a viewer and is also the only way to
 * answer a cookie the middleware could not resolve.
 */
app.delete("/auth/session", async (request, reply) => {
  const token = getSessionTokenFromRequest(request);
  if (token === undefined) {
    throw ApiError.notSignedIn();
  }

  await request.server.database
    .deleteFrom("sessions")
    .where("token_hash", "=", makeTokenHashFromToken(token))
    .execute();

  // It stops working immediately, everywhere, because the middleware looks
  // the session up in the database on every request.
  clearSessionCookie(reply);
  // `members.last_seen_at` is not touched: signing out is not being seen.
  return reply.code(204).send();
});
```

Add `import { makeTokenHashFromToken } from "../auth/sessionToken.ts";` with
the others.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @memory-shoebox/server test test/routes/session.test.ts`
Expected: PASS, twelve cases.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/routes/auth.ts apps/server/test/routes/session.test.ts
git commit -m "feat(server): signing in, and signing out without ever failing"
```

---

## Task 22: `GET /api/me` and `PATCH /api/me`

**Files:**

- Create: `apps/server/src/routes/me.ts`
- Create: `apps/server/test/helpers/insertSignedInMember.ts`
- Modify: `apps/server/src/app.ts`
- Test: `apps/server/test/routes/me.test.ts`

- [ ] **Step 1: Write the signed-in helper**

Create `apps/server/test/helpers/insertSignedInMember.ts`:

```ts
import type { Kysely } from "kysely";
import { SESSION_COOKIE_NAME } from "../../src/auth/sessionCookie.ts";
import { makeTokenHashFromToken } from "../../src/auth/sessionToken.ts";
import type { Database } from "../../src/db/types/db.types.ts";
import { insertMember, insertSession } from "./seedHelpers.ts";

/** A member holding one live device, and the header that device sends. */
export type SignedInMember = {
  memberId: string;
  sessionId: string;
  token: string;
  /** Ready for `app.inject({ headers: { cookie } })`. */
  cookie: string;
};

/**
 * Seeds a member with a live session, the way a real sign-in would leave them.
 *
 * The token is a plain string rather than a minted one, because what the
 * middleware looks up is its SHA-256 and a test reads better when it can name
 * the device's token.
 *
 * @param options.database The test database.
 * @param options.token The cookie value this device holds.
 * @param options.member Columns to override on the member.
 * @param options.session Columns to override on the session.
 */
export async function insertSignedInMember(options: {
  database: Kysely<Database>;
  token?: string;
  member?: Partial<Database["members"]>;
  session?: Partial<Database["sessions"]>;
}): Promise<SignedInMember> {
  const token = options.token ?? "a-token-somebody-is-holding";
  const memberId = await insertMember(options.database, options.member ?? {});
  const sessionId = await insertSession(options.database, {
    memberId,
    token_hash: makeTokenHashFromToken(token),
    ...options.session,
  });
  return {
    memberId,
    sessionId,
    token,
    cookie: `${SESSION_COOKIE_NAME}=${token}`,
  };
}
```

- [ ] **Step 2: Write the failing test**

Create `apps/server/test/routes/me.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import { NOW, insertInstanceSetting } from "../helpers/seedHelpers.ts";

describe("GET /api/me", () => {
  it("answers the account and the shell's settings", async () => {
    const { app, database, close } = await createTestApp({
      clock: () => {
        return new Date(NOW);
      },
    });
    const { cookie, memberId } = await insertSignedInMember({
      database,
      member: {
        email: "abuela@example.com",
        display_name: null,
        role: "viewer",
      },
    });
    await insertInstanceSetting(database, {
      key: "shoebox.name",
      value: "The Sarmiento Shoebox",
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/me",
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      me: {
        member: { memberId, displayName: "abuela" },
        storedDisplayName: null,
        email: "abuela@example.com",
        role: "viewer",
        notify: {
          onUpload: true,
          onComment: true,
          onReply: true,
          onRemoval: true,
        },
        joinedAt: NOW,
        lastSignedInAt: NOW,
      },
      settings: {
        shoeboxName: "The Sarmiento Shoebox",
        pileArrangement: "messy",
        timezone: "UTC",
      },
    });
    await close();
  });

  it("answers 401 with no session", async () => {
    const { app, close } = await createTestApp();
    const response = await app.inject({ method: "GET", url: "/api/me" });
    expect(response.statusCode).toBe(401);
    expect(response.json().error).toBe("not_signed_in");
    await close();
  });
});

describe("PATCH /api/me", () => {
  it("corrects the display name and answers the read shape", async () => {
    const { app, database, close } = await createTestApp();
    const { cookie, memberId } = await insertSignedInMember({
      database,
      member: { email: "abuela@example.com", display_name: "Rosa" },
    });

    const response = await app.inject({
      method: "PATCH",
      url: "/api/me",
      headers: { cookie },
      payload: { displayName: "  Abuela Rosa  " },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().me.storedDisplayName).toBe("Abuela Rosa");
    expect(response.json().me.member.displayName).toBe("Abuela Rosa");

    const row = await database
      .selectFrom("members")
      .select("display_name")
      .where("id", "=", memberId)
      .executeTakeFirstOrThrow();
    expect(row.display_name).toBe("Abuela Rosa");
    await close();
  });

  it("clears the name back to the fallback with null", async () => {
    const { app, database, close } = await createTestApp();
    const { cookie } = await insertSignedInMember({
      database,
      member: { email: "abuela@example.com", display_name: "Rosa" },
    });

    const response = await app.inject({
      method: "PATCH",
      url: "/api/me",
      headers: { cookie },
      payload: { displayName: null },
    });

    expect(response.json().me.storedDisplayName).toBeNull();
    expect(response.json().me.member.displayName).toBe("abuela");
    await close();
  });

  it("turns all four switches off in one request", async () => {
    const { app, database, close } = await createTestApp();
    const { cookie, memberId } = await insertSignedInMember({ database });

    const response = await app.inject({
      method: "PATCH",
      url: "/api/me",
      headers: { cookie },
      payload: {
        notify: {
          onUpload: false,
          onComment: false,
          onReply: false,
          onRemoval: false,
        },
      },
    });

    expect(response.json().me.notify).toEqual({
      onUpload: false,
      onComment: false,
      onReply: false,
      onRemoval: false,
    });
    const row = await database
      .selectFrom("members")
      .select(["notify_on_upload", "notify_on_removal"])
      .where("id", "=", memberId)
      .executeTakeFirstOrThrow();
    expect(row).toEqual({ notify_on_upload: 0, notify_on_removal: 0 });
    await close();
  });

  it("refuses a partial notify object", async () => {
    const { app, database, close } = await createTestApp();
    const { cookie } = await insertSignedInMember({ database });

    const response = await app.inject({
      method: "PATCH",
      url: "/api/me",
      headers: { cookie },
      payload: { notify: { onUpload: false } },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("invalid_request");
    await close();
  });

  it("refuses email outright rather than ignoring it", async () => {
    const { app, database, close } = await createTestApp();
    const { cookie, memberId } = await insertSignedInMember({
      database,
      member: { email: "abuela@example.com" },
    });

    const response = await app.inject({
      method: "PATCH",
      url: "/api/me",
      headers: { cookie },
      payload: { email: "somebody-else@example.com" },
    });

    expect(response.statusCode).toBe(400);
    const row = await database
      .selectFrom("members")
      .select("email")
      .where("id", "=", memberId)
      .executeTakeFirstOrThrow();
    expect(row.email).toBe("abuela@example.com");
    await close();
  });

  it("refuses role, because nobody promotes themselves", async () => {
    const { app, database, close } = await createTestApp();
    const { cookie, memberId } = await insertSignedInMember({
      database,
      member: { role: "viewer" },
    });

    const response = await app.inject({
      method: "PATCH",
      url: "/api/me",
      headers: { cookie },
      payload: { role: "admin" },
    });

    expect(response.statusCode).toBe(400);
    const row = await database
      .selectFrom("members")
      .select("role")
      .where("id", "=", memberId)
      .executeTakeFirstOrThrow();
    expect(row.role).toBe("viewer");
    await close();
  });

  it("refuses a display name over eighty characters", async () => {
    const { app, database, close } = await createTestApp();
    const { cookie } = await insertSignedInMember({ database });

    const response = await app.inject({
      method: "PATCH",
      url: "/api/me",
      headers: { cookie },
      payload: { displayName: "r".repeat(81) },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().details.fieldErrors).toHaveProperty("displayName");
    await close();
  });

  it("does not bump the visibility generation for a spelling correction", async () => {
    // Invalidating every viewer's cached rule set because somebody fixed their
    // own name would be a real cost for nothing (`auth.md`, `PATCH /api/me`).
    const { app, database, close } = await createTestApp();
    const { cookie } = await insertSignedInMember({ database });

    await app.inject({
      method: "PATCH",
      url: "/api/me",
      headers: { cookie },
      payload: { displayName: "Abuela Rosa" },
    });

    const rows = await database
      .selectFrom("settings")
      .select("id")
      .where("key", "=", "visibility.generation")
      .execute();
    expect(rows).toEqual([]);
    await close();
  });

  it("answers 401 with no session", async () => {
    const { app, close } = await createTestApp();
    const response = await app.inject({
      method: "PATCH",
      url: "/api/me",
      payload: { displayName: "Rosa" },
    });
    expect(response.statusCode).toBe(401);
    await close();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @memory-shoebox/server test test/routes/me.test.ts`
Expected: FAIL, 404 on both routes.

- [ ] **Step 4: Write the route module**

Create `apps/server/src/routes/me.ts`:

```ts
import type { FastifyInstance } from "fastify";
import type { Updateable } from "kysely";
import {
  updateMeRequestSchema,
  type MeResponse,
  type UpdateMeRequest,
} from "@memory-shoebox/shared";
import type { Database } from "../db/types/db.types.ts";
import { requireViewer } from "../http/requestContextHelpers.ts";
import { getMeDtoFromMemberId } from "../members/getMeDtoFromMemberId.ts";
import { readShellSettings } from "../settings/readShellSettings.ts";

/**
 * A member's own account: `tech-specs/apis/auth.md`, surface 9.
 *
 * Every route here is self-scoped, which is the only reason an email address
 * appears in a payload at all: it is the caller's own.
 */

/** The columns a `PATCH` body asks to change, and no others. */
function _makeMemberPatchFromBody(
  body: UpdateMeRequest,
): Updateable<Database["members"]> {
  return {
    // An omitted key is left alone; `null` and `""` both clear the name back
    // to the email local-part fallback (Decision 1).
    ...(body.displayName === undefined
      ? {}
      : { display_name: body.displayName === "" ? null : body.displayName }),
    // All four, or none: "turn them all off" is a client convenience that
    // sends four booleans, not an API feature (Decision 16).
    ...(body.notify === undefined
      ? {}
      : {
          notify_on_upload: body.notify.onUpload ? 1 : 0,
          notify_on_comment: body.notify.onComment ? 1 : 0,
          notify_on_reply: body.notify.onReply ? 1 : 0,
          notify_on_removal: body.notify.onRemoval ? 1 : 0,
        }),
  };
}

/** Registers the account routes. */
export async function meRoutes(app: FastifyInstance): Promise<void> {
  app.get("/me", async (request): Promise<MeResponse> => {
    const viewer = requireViewer(request);
    return {
      // `role` is read on this request, so a demotion takes effect on the
      // next one. The visibility side of a role change is the generation
      // bump's job, not this route's.
      me: await getMeDtoFromMemberId({
        database: request.server.database,
        memberId: viewer.memberId,
      }),
      settings: await readShellSettings(request.server.database),
    };
  });

  app.patch("/me", async (request): Promise<MeResponse> => {
    const viewer = requireViewer(request);
    const body = updateMeRequestSchema.parse(request.body);
    const patch = _makeMemberPatchFromBody(body);

    if (Object.keys(patch).length > 0) {
      await request.server.database
        .updateTable("members")
        .set(patch)
        .where("id", "=", viewer.memberId)
        .execute();
    }

    // The post-mutation read shape. A display name change deliberately does
    // not bump `visibility.generation`: only group membership, a rule's
    // subjects and a member's role do.
    return {
      me: await getMeDtoFromMemberId({
        database: request.server.database,
        memberId: viewer.memberId,
      }),
      settings: await readShellSettings(request.server.database),
    };
  });
}
```

- [ ] **Step 5: Register it**

In `apps/server/src/app.ts`, import `meRoutes` and add `await meRoutes(api);`
inside the `app.register` block.

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @memory-shoebox/server test test/routes/me.test.ts`
Expected: PASS, eleven cases.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/routes/me.ts apps/server/src/app.ts apps/server/test/routes/me.test.ts apps/server/test/helpers/insertSignedInMember.ts
git commit -m "feat(server): the account, and the four switches on it"
```

---

## Task 23: The device list, and signing one out

**Files:**

- Modify: `apps/server/src/routes/me.ts`
- Test: `apps/server/test/routes/mySessions.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/server/test/routes/mySessions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createId } from "../../src/db/createId.ts";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import {
  NOW,
  insertMember,
  insertSession,
  shiftDays,
} from "../helpers/seedHelpers.ts";

const USER_AGENT = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)";

describe("GET /api/me/sessions", () => {
  it("lists the member's own live devices, newest use first", async () => {
    const { app, database, close } = await createTestApp({
      clock: () => {
        return new Date(NOW);
      },
    });
    const signedIn = await insertSignedInMember({
      database,
      member: { email: "abuela@example.com" },
      session: { device_label: "iPhone, Safari", last_used_at: NOW },
    });
    const olderId = await insertSession(database, {
      memberId: signedIn.memberId,
      device_label: "Mac, Safari",
      last_used_at: shiftDays({ instant: NOW, days: -3 }),
      expires_at: shiftDays({ instant: NOW, days: 27 }),
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/me/sessions",
      headers: { cookie: signedIn.cookie },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.nextCursor).toBeNull();
    expect(
      body.sessions.map((session: { sessionId: string }) => {
        return session.sessionId;
      }),
    ).toEqual([signedIn.sessionId, olderId]);
    expect(body.sessions[0]).toEqual({
      sessionId: signedIn.sessionId,
      deviceLabel: "iPhone, Safari",
      createdAt: NOW,
      lastUsedAt: NOW,
      expiresAt: shiftDays({ instant: NOW, days: 30 }),
      isCurrent: true,
    });
    expect(body.sessions[1].isCurrent).toBe(false);
    await close();
  });

  it("never serves the raw user agent", async () => {
    // A device row is a label and two timestamps, and that is the whole of it
    // (`conventions.md` § Forbidden in any payload).
    const { app, database, close } = await createTestApp();
    const signedIn = await insertSignedInMember({
      database,
      session: { user_agent: USER_AGENT },
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/me/sessions",
      headers: { cookie: signedIn.cookie },
    });

    expect(response.payload).not.toContain("Mozilla");
    await close();
  });

  it("leaves out an expired row, which no job has swept yet", async () => {
    const { app, database, close } = await createTestApp({
      clock: () => {
        return new Date(NOW);
      },
    });
    const signedIn = await insertSignedInMember({ database });
    await insertSession(database, {
      memberId: signedIn.memberId,
      expires_at: shiftDays({ instant: NOW, days: -1 }),
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/me/sessions",
      headers: { cookie: signedIn.cookie },
    });

    expect(response.json().sessions).toHaveLength(1);
    await close();
  });

  it("never lists somebody else's device", async () => {
    const { app, database, close } = await createTestApp();
    const signedIn = await insertSignedInMember({ database });
    const otherId = await insertMember(database, {
      email: "ines@example.com",
    });
    await insertSession(database, { memberId: otherId });

    const response = await app.inject({
      method: "GET",
      url: "/api/me/sessions",
      headers: { cookie: signedIn.cookie },
    });

    expect(response.json().sessions).toHaveLength(1);
    await close();
  });

  it("answers 401 with no session", async () => {
    const { app, close } = await createTestApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/me/sessions",
    });
    expect(response.statusCode).toBe(401);
    await close();
  });
});

describe("DELETE /api/me/sessions/:sessionId", () => {
  it("signs another device out and leaves this one alone", async () => {
    const { app, database, close } = await createTestApp();
    const signedIn = await insertSignedInMember({ database });
    const otherDeviceId = await insertSession(database, {
      memberId: signedIn.memberId,
    });

    const response = await app.inject({
      method: "DELETE",
      url: `/api/me/sessions/${otherDeviceId}`,
      headers: { cookie: signedIn.cookie },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers["set-cookie"]).toBeUndefined();
    const rows = await database.selectFrom("sessions").select("id").execute();
    expect(rows).toEqual([{ id: signedIn.sessionId }]);
    await close();
  });

  it("clears the cookie when the device is this one", async () => {
    const { app, database, close } = await createTestApp();
    const signedIn = await insertSignedInMember({ database });

    const response = await app.inject({
      method: "DELETE",
      url: `/api/me/sessions/${signedIn.sessionId}`,
      headers: { cookie: signedIn.cookie },
    });

    expect(response.statusCode).toBe(204);
    expect(String(response.headers["set-cookie"])).toContain("Max-Age=0");
    await close();
  });

  it("answers 404 for another member's device, never 403", async () => {
    // A 403 would confirm that a session exists at that id, which is exactly
    // what the rule exists to prevent (`conventions.md` § Errors).
    const { app, database, close } = await createTestApp();
    const signedIn = await insertSignedInMember({ database });
    const otherId = await insertMember(database, {
      email: "ines@example.com",
    });
    const theirDeviceId = await insertSession(database, {
      memberId: otherId,
    });

    const response = await app.inject({
      method: "DELETE",
      url: `/api/me/sessions/${theirDeviceId}`,
      headers: { cookie: signedIn.cookie },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe("session_not_found");

    const rows = await database
      .selectFrom("sessions")
      .select("id")
      .where("id", "=", theirDeviceId)
      .execute();
    expect(rows).toHaveLength(1);
    await close();
  });

  it("answers an identical 404 for an id that never existed", async () => {
    const { app, database, close } = await createTestApp();
    const signedIn = await insertSignedInMember({ database });
    const otherId = await insertMember(database, {
      email: "ines@example.com",
    });
    const theirDeviceId = await insertSession(database, { memberId: otherId });

    const theirs = await app.inject({
      method: "DELETE",
      url: `/api/me/sessions/${theirDeviceId}`,
      headers: { cookie: signedIn.cookie },
    });
    const nobodys = await app.inject({
      method: "DELETE",
      url: `/api/me/sessions/${createId()}`,
      headers: { cookie: signedIn.cookie },
    });

    expect(nobodys.statusCode).toBe(theirs.statusCode);
    expect(nobodys.payload).toBe(theirs.payload);
    await close();
  });

  it("answers 404 for a device that has already fallen out", async () => {
    const { app, database, close } = await createTestApp({
      clock: () => {
        return new Date(NOW);
      },
    });
    const signedIn = await insertSignedInMember({ database });
    const expiredId = await insertSession(database, {
      memberId: signedIn.memberId,
      expires_at: shiftDays({ instant: NOW, days: -1 }),
    });

    const response = await app.inject({
      method: "DELETE",
      url: `/api/me/sessions/${expiredId}`,
      headers: { cookie: signedIn.cookie },
    });

    expect(response.statusCode).toBe(404);
    await close();
  });

  it("refuses an id that is not a uuid", async () => {
    const { app, database, close } = await createTestApp();
    const signedIn = await insertSignedInMember({ database });

    const response = await app.inject({
      method: "DELETE",
      url: "/api/me/sessions/not-a-uuid",
      headers: { cookie: signedIn.cookie },
    });

    expect(response.statusCode).toBe(400);
    await close();
  });

  it("answers 401 with no session", async () => {
    const { app, close } = await createTestApp();
    const response = await app.inject({
      method: "DELETE",
      url: `/api/me/sessions/${createId()}`,
    });
    expect(response.statusCode).toBe(401);
    await close();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @memory-shoebox/server test test/routes/mySessions.test.ts`
Expected: FAIL, 404 on both routes.

- [ ] **Step 3: Add both routes**

In `apps/server/src/routes/me.ts`, add the imports:

```ts
import {
  revokeMySessionParamsSchema,
  type ListMySessionsResponse,
} from "@memory-shoebox/shared";
import { clearSessionCookie } from "../auth/sessionCookie.ts";
import { ApiError } from "../http/ApiError.ts";
```

Add inside `meRoutes`:

```ts
app.get("/me/sessions", async (request): Promise<ListMySessionsResponse> => {
  const viewer = requireViewer(request);
  const now = request.server.clock().toISOString();

  // The expiry filter is load-bearing: no job deletes expired sessions
  // promptly (`session-sweep` is hourly housekeeping), so a dead row would
  // otherwise sit in the list looking live.
  const rows = await request.server.database
    .selectFrom("sessions")
    .select(["id", "device_label", "created_at", "last_used_at", "expires_at"])
    .where("member_id", "=", viewer.memberId)
    .where("expires_at", ">", now)
    .orderBy("last_used_at", "desc")
    .execute();

  return {
    sessions: rows.map((row) => {
      return {
        sessionId: row.id,
        deviceLabel: row.device_label,
        createdAt: row.created_at,
        lastUsedAt: row.last_used_at,
        expiresAt: row.expires_at,
        // Computed at the boundary, never a column
        // (`data-models.md` § Notes for whoever writes the API contract).
        isCurrent: row.id === viewer.sessionId,
      };
    }),
    // A member holds a handful of live devices, bounded by the 30-day
    // expiry, so there is nothing to page.
    nextCursor: null,
  };
});

app.delete("/me/sessions/:sessionId", async (request, reply) => {
  const viewer = requireViewer(request);
  const params = revokeMySessionParamsSchema.parse(request.params);
  const now = request.server.clock().toISOString();

  // Ownership is in the `WHERE` clause rather than in a preceding `SELECT`:
  // one round trip, and structurally incapable of answering "that row exists
  // but is not yours".
  const result = await request.server.database
    .deleteFrom("sessions")
    .where("id", "=", params.sessionId)
    .where("member_id", "=", viewer.memberId)
    .where("expires_at", ">", now)
    .executeTakeFirst();

  if (Number(result.numDeletedRows) === 0) {
    // Not a 403. Another member's session id and an id that never existed
    // return the identical status, code and message.
    throw ApiError.notFound("session_not_found");
  }

  // The same request for another device and for this one. The difference is
  // entirely in the client, except for this header.
  if (params.sessionId === viewer.sessionId) {
    clearSessionCookie(reply);
  }
  return reply.code(204).send();
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @memory-shoebox/server test test/routes/mySessions.test.ts`
Expected: PASS, twelve cases.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/routes/me.ts apps/server/test/routes/mySessions.test.ts
git commit -m "feat(server): every device, and signing one out from anywhere"
```

---

## Task 24: `GET /api/public-settings`

**Files:**

- Create: `apps/server/src/routes/publicSettings.ts`
- Modify: `apps/server/src/app.ts`
- Test: `apps/server/test/routes/publicSettings.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/server/test/routes/publicSettings.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertInstanceSetting } from "../helpers/seedHelpers.ts";

describe("GET /api/public-settings", () => {
  it("answers a fresh Shoebox holding zero settings rows", async () => {
    const { app, close } = await createTestApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/public-settings",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      shoeboxName: "My Shoebox",
      baseUrl: null,
    });
    await close();
  });

  it("answers without a session, because there is no 401 by definition", async () => {
    const { app, database, close } = await createTestApp();
    await insertInstanceSetting(database, {
      key: "shoebox.name",
      value: "The Sarmiento Shoebox",
    });
    await insertInstanceSetting(database, {
      key: "public.base_url",
      value: "https://shoebox.example.com",
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/public-settings",
    });

    expect(response.json()).toEqual({
      shoeboxName: "The Sarmiento Shoebox",
      baseUrl: "https://shoebox.example.com",
    });
    await close();
  });

  it("serves the two publicly readable keys and nothing else", async () => {
    // The allow-list is the guard, not the handler: a key is readable
    // anonymously because it carries `isPubliclyReadable`, never because a
    // route forgot to check.
    const { app, database, close } = await createTestApp();
    await insertInstanceSetting(database, {
      key: "pile.arrangement",
      value: "tidy",
    });
    await insertInstanceSetting(database, {
      key: "mail.from_address",
      value: "shoebox@example.com",
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/public-settings",
    });

    expect(Object.keys(response.json()).sort()).toEqual([
      "baseUrl",
      "shoeboxName",
    ]);
    expect(response.payload).not.toContain("tidy");
    expect(response.payload).not.toContain("shoebox@example.com");
    await close();
  });

  it("survives a page being reloaded far more than twenty times", async () => {
    // The only per-IP rule in `conventions.md` is twenty an hour, aimed at
    // sign-in codes. This route renders the sign-in page's top bar.
    const { app, close } = await createTestApp();

    const statuses = [];
    for (let index = 0; index < 30; index += 1) {
      const response = await app.inject({
        method: "GET",
        url: "/api/public-settings",
      });
      statuses.push(response.statusCode);
    }

    expect(new Set(statuses)).toEqual(new Set([200]));
    await close();
  });

  it("still has a cap, at a hundred and twenty a minute", async () => {
    const { app, close } = await createTestApp();

    const statuses = [];
    for (let index = 0; index < 121; index += 1) {
      const response = await app.inject({
        method: "GET",
        url: "/api/public-settings",
      });
      statuses.push(response.statusCode);
    }

    expect(statuses[119]).toBe(200);
    expect(statuses[120]).toBe(429);
    await close();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @memory-shoebox/server test test/routes/publicSettings.test.ts`
Expected: FAIL, 404.

- [ ] **Step 3: Write the route**

Create `apps/server/src/routes/publicSettings.ts`:

```ts
import type { FastifyInstance } from "fastify";
import {
  PUBLIC_SETTING_KEYS,
  type PublicSettingsResponse,
} from "@memory-shoebox/shared";
import { readInstanceSettings } from "../settings/readInstanceSettings.ts";

/**
 * `GET /api/public-settings`: the Shoebox's name before anybody is signed in.
 *
 * It belongs to the administration slice beside `GET /api/settings`, which
 * stays admin-only because it also carries the mail configuration and the
 * storage figures (`administration.md`). It lives in its own module here
 * because the sign-in page is what needs it and the rest of that slice is
 * step 8a's.
 *
 * **A fingerprint, not an oracle.** Anybody who can reach the instance learns
 * what it calls itself, which is the same thing the sign-in page shows them
 * anyway. It reveals no member, no address, no count and no content, and it
 * does nothing to weaken surface 1's `unknown` state.
 *
 * There is no 401 by definition and no 404: a Shoebox with no `shoebox.name`
 * row serves the registry's default, which is what lets a fresh instance hold
 * zero settings rows and still render.
 */
export async function publicSettingsRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get(
    "/public-settings",
    { config: { rateLimit: ["publicReadPerIp"] } },
    async (request): Promise<PublicSettingsResponse> => {
      // The keys carrying `isPubliclyReadable`, and only those. The list is
      // asserted against the flag in `packages/shared/test/settings.test.ts`,
      // which is what makes the allow-list a guard rather than a habit.
      const settings = await readInstanceSettings({
        database: request.server.database,
        keys: PUBLIC_SETTING_KEYS,
      });
      return {
        shoeboxName: settings["shoebox.name"],
        baseUrl: settings["public.base_url"],
      };
    },
  );
}
```

- [ ] **Step 4: Register it**

In `apps/server/src/app.ts`, import `publicSettingsRoutes` and add
`await publicSettingsRoutes(api);` inside the `app.register` block.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @memory-shoebox/server test test/routes/publicSettings.test.ts`
Expected: PASS, five cases.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/routes/publicSettings.ts apps/server/src/app.ts apps/server/test/routes/publicSettings.test.ts
git commit -m "feat(server): the name the sign-in page shows before anybody is in"
```

---

## Task 25: The four promises the copy makes

**Files:**

- Test: `apps/server/test/auth/authGuarantees.test.ts`

Every case here is named in
[`plan/step-3a.md`](../../prds/2026-09-27-memory-shoebox/plan/step-3a.md)
§ Verification. They span modules, which is why they are one file rather than
scattered: each is a sentence the product says out loud to a member, and the
test is what keeps it true.

No new source code should be needed. If a case fails, the bug is in a previous
task.

- [ ] **Step 1: Write the tests**

Create `apps/server/test/auth/authGuarantees.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { FastifyRequest } from "fastify";
import { createAuthenticator } from "../../src/auth/createAuthenticator.ts";
import { SESSION_COOKIE_NAME } from "../../src/auth/sessionCookie.ts";
import { makeTokenHashFromToken } from "../../src/auth/sessionToken.ts";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { runSessionSweep } from "../../src/jobs/runSessionSweep.ts";
import { runSignInCodeSweep } from "../../src/jobs/runSignInCodeSweep.ts";
import { bumpVisibilityGeneration } from "../../src/visibility/bumpVisibilityGeneration.ts";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import {
  NOW,
  insertGroup,
  insertGroupMember,
  insertMember,
  insertSession,
  insertVisibilityRule,
  insertVisibilityRuleSubject,
  shiftDays,
  shiftMinutes,
} from "../helpers/seedHelpers.ts";

describe("a signed-out device stops working", () => {
  it("fails on its very next request", async () => {
    // "Lost a phone, or handed one on? Sign it out here and it stops working
    // immediately, wherever it is." That promise is what rules out a stateless
    // token and any cache without invalidation.
    const { app, database, close } = await createTestApp();
    const phone = await insertSignedInMember({
      database,
      token: "the-lost-phone",
      member: { email: "abuela@example.com" },
    });
    await insertSession(database, {
      memberId: phone.memberId,
      token_hash: makeTokenHashFromToken("the-laptop-at-home"),
    });

    const before = await app.inject({
      method: "GET",
      url: "/api/me",
      headers: { cookie: phone.cookie },
    });
    expect(before.statusCode).toBe(200);

    const signOut = await app.inject({
      method: "DELETE",
      url: `/api/me/sessions/${phone.sessionId}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=the-laptop-at-home` },
    });
    expect(signOut.statusCode).toBe(204);

    const after = await app.inject({
      method: "GET",
      url: "/api/me",
      headers: { cookie: phone.cookie },
    });
    expect(after.statusCode).toBe(401);
    await close();
  });
});

describe("the session slide", () => {
  it("writes at most once a day under a hundred requests", async () => {
    // Without the throttle, one page of thumbnails is dozens of writes
    // serialising on SQLite's single writer.
    const twoDaysOn = shiftDays({ instant: NOW, days: 2 });
    const { app, database, close } = await createTestApp({
      clock: () => {
        return new Date(twoDaysOn);
      },
    });
    const signedIn = await insertSignedInMember({
      database,
      session: {
        last_used_at: NOW,
        expires_at: shiftDays({ instant: NOW, days: 30 }),
      },
      member: { last_seen_at: NOW },
    });

    // The first request is due, and slides.
    await app.inject({
      method: "GET",
      url: "/api/health",
      headers: { cookie: signedIn.cookie },
    });

    // A marker no code would ever write. Any later slide overwrites it, so the
    // assertion below counts writes without needing to watch the driver.
    const MARKER = "2099-01-01T00:00:00.000Z";
    await database
      .updateTable("sessions")
      .set({ expires_at: MARKER })
      .where("id", "=", signedIn.sessionId)
      .execute();
    await database
      .updateTable("members")
      .set({ last_seen_at: MARKER })
      .where("id", "=", signedIn.memberId)
      .execute();

    for (let index = 0; index < 99; index += 1) {
      await app.inject({
        method: "GET",
        url: "/api/health",
        headers: { cookie: signedIn.cookie },
      });
    }

    const session = await database
      .selectFrom("sessions")
      .select(["last_used_at", "expires_at"])
      .where("id", "=", signedIn.sessionId)
      .executeTakeFirstOrThrow();
    expect(session.last_used_at).toBe(twoDaysOn);
    expect(session.expires_at).toBe(MARKER);

    const member = await database
      .selectFrom("members")
      .select("last_seen_at")
      .where("id", "=", signedIn.memberId)
      .executeTakeFirstOrThrow();
    expect(member.last_seen_at).toBe(MARKER);

    await close();
  });
});

describe("a group edit reaches everybody", () => {
  it("changes B's rule set without B signing in, and clears A's cache", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);

    // One authenticator, as the app holds one: the cache is shared between
    // every viewer, which is the whole reason the generation is the key.
    const authenticate = createAuthenticator({ database });

    const requestFor = (token: string): FastifyRequest => {
      return {
        headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
      } as unknown as FastifyRequest;
    };

    const memberA = await insertMember(database, { email: "a@example.com" });
    const memberB = await insertMember(database, { email: "b@example.com" });
    await insertSession(database, {
      memberId: memberA,
      token_hash: makeTokenHashFromToken("token-a"),
    });
    await insertSession(database, {
      memberId: memberB,
      token_hash: makeTokenHashFromToken("token-b"),
    });

    const groupId = await insertGroup(database, { name: "Cousins" });
    const ruleId = await insertVisibilityRule(database, { mode: "only" });
    await insertVisibilityRuleSubject(database, { ruleId, groupId });

    // Both are seen once, so both are in the cache.
    expect(
      (await authenticate(requestFor("token-a")))?.visibleRuleIds,
    ).not.toContain(ruleId);
    expect(
      (await authenticate(requestFor("token-b")))?.visibleRuleIds,
    ).not.toContain(ruleId);

    // An admin adds them both to the group, in one transaction with the bump.
    await insertGroupMember(database, { groupId, memberId: memberA });
    await insertGroupMember(database, { groupId, memberId: memberB });
    await bumpVisibilityGeneration({ executor: database, now: NOW });

    // Neither has signed in again, and both see it.
    expect(
      (await authenticate(requestFor("token-b")))?.visibleRuleIds,
    ).toContain(ruleId);
    expect(
      (await authenticate(requestFor("token-a")))?.visibleRuleIds,
    ).toContain(ruleId);

    await database.destroy();
  });
});

describe("the two sweeps this slice fills the tables of", () => {
  it("clears a consumed code and an expired device", async () => {
    // Both are housekeeping rather than security: a consumed code is already
    // dead, and a session is looked up per request, so an expired row is too.
    const { app, database, close } = await createTestApp({
      clock: () => {
        return new Date(NOW);
      },
    });
    const signedIn = await insertSignedInMember({ database });
    await insertSession(database, {
      memberId: signedIn.memberId,
      expires_at: shiftDays({ instant: NOW, days: -1 }),
    });

    await database
      .insertInto("sign_in_codes")
      .values({
        id: "0192f2a0-7d3c-7000-8000-0000000000aa",
        email: "abuela@example.com",
        member_id: signedIn.memberId,
        code_hash: "deadbeef",
        attempts: 0,
        max_attempts: 3,
        expires_at: shiftMinutes({ instant: NOW, minutes: 10 }),
        consumed_at: NOW,
        invalidated_at: null,
        created_at: NOW,
      })
      .execute();

    // The expired device is already invisible before any sweep runs.
    const listed = await app.inject({
      method: "GET",
      url: "/api/me/sessions",
      headers: { cookie: signedIn.cookie },
    });
    expect(listed.json().sessions).toHaveLength(1);

    expect(await runSessionSweep({ database, now: NOW })).toEqual({
      deletedCount: 1,
    });
    expect(await runSignInCodeSweep({ database, now: NOW })).toEqual({
      deletedCount: 1,
    });

    const sessions = await database
      .selectFrom("sessions")
      .select("id")
      .execute();
    expect(sessions).toEqual([{ id: signedIn.sessionId }]);
    await close();
  });
});
```

- [ ] **Step 2: Run them**

Run: `pnpm --filter @memory-shoebox/server test test/auth/authGuarantees.test.ts`
Expected: PASS, four cases. Every one of them should pass without touching
`src/`. If one does not, fix the module it accuses rather than the test.

- [ ] **Step 3: Run the whole suite**

Run: `pnpm --filter @memory-shoebox/server test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/server/test/auth/authGuarantees.test.ts
git commit -m "test(server): the four promises this step's copy makes"
```

---

## Task 26: Documentation

**Files:**

- Create: `docs/auth.md`
- Modify: `docs/README.md`
- Modify: `docs/server.md`
- Modify: `docs/configuration.md`
- Modify: `docs/shared.md`
- Modify: `docs/architecture.md`

`AGENTS.md` is explicit that this is part of the change rather than an
afterthought: "Whenever you add, change, or remove a feature, module, route,
data model, or architectural boundary, create or update the relevant file(s) in
`docs/` as part of the same change."

- [ ] **Step 1: Write `docs/auth.md`**

Create it with exactly these sections and facts. Keep the house style: high
level, no line-by-line restatement of the code, and no em dashes.

```markdown
# Signing in, sessions and visibility

Everybody who can get in, and everything that decides what they can see. The
routes are specified in
[`tech-specs/apis/auth.md`](prds/2026-09-27-memory-shoebox/tech-specs/apis/auth.md);
this file says how they fit together and why the shapes are what they are.

## There is no password, and no account to make

A member types their address, receives six digits, and types those in. Both
halves of that are deliberate:

- **An invitation carries no credential.** It names the address and points at
  the sign-in page. Acceptance is the first successful sign-in at the invited
  address, so a forwarded invitation grants nothing (Decision 2).
- **`members.status` alone decides whether an address may sign in.** A revoked
  invitation, a lapsed one and a removed member are all `removed`, which is one
  question rather than three.

## The form cannot be used to find out who is a member

`POST /api/auth/sign-in-codes` writes a `sign_in_codes` row for **any**
address, member or not, and answers `202` with the same body either way. Only
the mail differs, and mail is queued rather than sent in band, so a provider
timeout cannot lengthen one branch.

That has to hold through the later states too, which is why the unknown
address gets a real row with a real hash: it counts down from three tries and
expires after ten minutes exactly as a member's does, and a correct guess
against it is refused the same way a wrong one is.

The rate limiter keys on the normalised address whether or not it belongs to
anybody. Counting only members would make the limiter itself the oracle.

## The code

Six digits from a CSPRNG, stored as `HMAC-SHA256(digits, pepper)`. Six digits
is a space of a million, so a bare digest is reversed instantly with a rainbow
table; the pepper is derived from `SESSION_SECRET` and lives only in the
process, so a copied database file is worth nothing during the ten minutes a
code is alive.

Every mint supersedes whatever was live for that address, so at most one code
exists per address and "the old one has stopped working" is a state on the row
rather than an inference from expiry.

Redemption is one `BEGIN IMMEDIATE` transaction. Kysely's deferred `BEGIN`
would let two submissions each read `attempts = 0`, and each would get three
tries. The third wrong attempt invalidates the code and mints a replacement,
because the interface promises one: "Two tries left before we send you a new
one".

## The session

A cookie called `shoebox_session` carrying 256 bits of CSPRNG output, whose
SHA-256 is a row in `sessions`. Nothing is signed and nothing is encrypted,
because there is nothing in the value to protect: it means only what the row
says it means.

**It is looked up in the database on every request.** My account and Members
both promise that a signed-out device stops working immediately, wherever it
is, and that promise is the whole architecture: no stateless token, and no
cache without an invalidation channel.

The row's `last_used_at` and `expires_at` slide, but only when the remaining
lifetime has moved by more than a day, and `members.last_seen_at` is throttled
the same way. Without that, one page of thumbnails is dozens of writes
serialising on SQLite's single writer. The visible consequence is that a device
can read "29 days left" immediately after being used, which is correct rather
than stale.

Signing out is the one route that may not refuse: a dead, expired or absent
cookie still gets the clearing header, because a person pressing "sign out" and
being told they are not signed in has been failed by the software.

## The visibility predicate

Computed once per request by the middleware and composed by every read route
rather than rewritten:

- `getVisibleRuleIdsFromMemberId` expands the viewer's groups and the rules
  those groups and they are named by, in one query.
- `applyVisibilityFilter` is the only sanctioned reader of that list. It adds
  `visibility_rule_id IN (...) OR uploaded_by = :me`, and for an admin it adds
  nothing at all.

Two rules that are easy to break and hard to notice: `item_people` may never
appear in a visibility expression, because being in a photograph is not a key
to it; and no count that visibility can filter may ever be stored.

## The generation, and what has to bump it

`visibleRuleIds` is cached per `(memberId, visibilityGeneration)`, in the
process, which is sound only because the deployment is one machine. A
generation that has moved empties the whole cache, so a group edit invalidates
every viewer at once.

`bumpVisibilityGeneration` must be called, inside the same transaction, by
every write that can change what an expansion returns: group membership, a
rule's subjects, a member's role, and **the insert of a new rule**. The last is
the quiet one: a new rule naming a viewer is not in that viewer's cached set,
so a brand-new upload would be invisible to them until something unrelated
bumped.

A display name change does not bump, and should not: invalidating every cache
because somebody fixed their own spelling costs something and buys nothing.

## What this slice deliberately cannot tell you

- Whether an address is a member, invited, or suppressed. There is no route
  that answers it and no slice may add one.
- Why a sign-in email did not arrive. A failure lands in `outbound_emails` and
  surfaces only in the admin's mail banner.
- How many items a brand-new member's archive holds. The first sign-in seeds
  `item_views` for every existing item so the accent dot means "arrived since
  you joined", and the response says nothing about how many rows that was.
```

- [ ] **Step 2: Add it to the documentation map**

In `docs/README.md`, add a row to the Map table after `server.md`:

```markdown
| [auth.md](auth.md) | Signing in, sessions, the cookie, and the visibility predicate |
```

- [ ] **Step 3: Update `docs/server.md`**

Four edits:

1. In the layout tree, add the new directories:

```
│   ├── auth/               the cookie, the code, the session, the middleware
│   ├── members/            the account shape and the first-sign-in seed
│   ├── visibility/         the predicate, its cache, and the generation bump
```

2. In "## The request context", replace the paragraph beginning "So this
   package ships the seam and not the lookup" with one saying that step 3a
   filled it: `src/auth/createAuthenticator.ts` resolves the cookie to a
   session row on every request, slides the session and `members.last_seen_at`
   at most once a day each, and attaches the expanded `visibleRuleIds`. Point
   at [auth.md](auth.md) for the reasoning.

3. In "## Routes", replace "Today there is exactly one" with the four modules
   there are now: `health.ts`, `auth.ts` (sign-in codes and sessions),
   `me.ts` (the account and its devices) and `publicSettings.ts` (the one
   anonymous read). Say that the contract's remaining routes are still
   specified and unbuilt, and correct the count.

4. In "## Rate limits", add `publicReadPerIp` to the description of the rule
   table, noting that it is an addition to `conventions.md` § Rate limits and
   why: the document's only per-IP number is aimed at sign-in mail, and the
   sign-in page's own settings read would be locked out after twenty reloads.

Also add two sentences to "## Database": `runInImmediateTransaction` is how a
route takes SQLite's write lock at the start of a transaction rather than at
its first write, and `create_id()` is registered on the connection so a
set-based insert can mint uuids in SQL.

- [ ] **Step 4: Correct `docs/configuration.md`**

Replace the `SESSION_SECRET` row in the Required table with:

```markdown
| `SESSION_SECRET` | The one secret this instance needs. **At least 32 characters.** Generate with `openssl rand -hex 32`. Unique per instance. Changing it invalidates every live sign-in code and no session. |
```

And replace the "**`SESSION_SECRET` is not a password.**" note with:

```markdown
**`SESSION_SECRET` protects sign-in codes, not the cookie.** The session cookie
is an opaque random token whose only meaning is a row in the database, so
nothing about it is signed or encrypted. What the secret does is derive the
pepper that `sign_in_codes.code_hash` is computed under: six digits is a space
of a million, and without a pepper a copied database file yields every live
code instantly. Treat it like a private key, and note that changing it
invalidates live codes rather than sessions.
```

- [ ] **Step 5: Update `docs/shared.md`**

**One paragraph in it is now factually wrong**, which a reviewer caught: it
enumerates the runtime (non-`import type`) imports from this package under
`apps/server/src`, says there are exactly two, names them, and adds that
"Everything else under `apps/server/src` is still `import type`". This step
added more. Count them (`grep -rn "from \"@memory-shoebox/shared\"" apps/server/src`
and look for the ones without `type`) and correct the passage rather than
leaving a number that was true last week.

Add `auth.ts` to the list of modules that file keeps, described as the
authentication slice's request and response schemas, plus `MeDto`,
`SessionDto` and `NotifyPreferences`. **Correct the module count in the same
edit**: the file opens by calling the barrel "a barrel over seven modules", and
there are eight now. Note that `settings.ts` also carries `ShellSettings` (the
three resolved values the app shell needs) and `PublicSettingsResponse` with
`PUBLIC_SETTING_KEYS`, and that `signInCodeSchema` lives in `auth.ts` and is
shared with the email payload so the six digits are spelled once.

- [ ] **Step 6: Update `docs/architecture.md`**

In "## What is not built yet", change "Two are done" to "Three are done", add a
paragraph after the step 2 one:

```markdown
**Step 3a built identity and access**: signing in with a six-digit code,
sessions and the devices list, a member's own account, the anonymous settings
read the sign-in page needs, and the visibility predicate every later read
route composes. See [auth.md](auth.md).
```

And correct the "There are no product features on top of it" paragraph: there
are accounts now, `GET /api/health` is no longer the only endpoint, and the
sign-in email is the one kind with copy **and a caller**. Keep the paragraph's
shape and its honesty about what is still missing: no items, no uploads, no
comments, and no surface at all.

- [ ] **Step 7: Format and commit**

```bash
pnpm format
git add docs/
git commit -m "docs: signing in, sessions, and what the secret actually protects"
```

---

## Task 27: Verification

**Files:**

- Modify: `docs/prds/2026-09-27-memory-shoebox/plan/step-3a.md`

- [ ] **Step 1: Run the gate**

Run: `pnpm check`
Expected: format, lint, type-check, build and tests all green.

Fix anything it finds. Two likely ones, both mechanical: an unused import in a
test, and a relative import missing its `.ts` extension.

- [ ] **Step 2: Run the whole suite once more from a clean database**

Run: `pnpm test`
Expected: PASS, including `packages/shared`.

- [ ] **Step 3: The by-hand run, which cannot be automated**

This is the case `step-3a.md` § Verification names first, and it needs a real
inbox. Ask the user to do it rather than doing it for them: it needs a real
`RESEND_API_KEY`, a verified sending domain, and an address they can read.

The script to hand them:

1. `apps/server/.env.local` has `RESEND_API_KEY` set, and the database has
   `mail.from_address`, `mail.from_name` and `public.base_url` set. There is no
   settings surface yet (step 8a), so those three are written directly:

   ```sh
   pnpm migrate
   sqlite3 ./apps/server/data/memory-shoebox.db \
     "INSERT INTO settings (id, scope, scope_id, key, value, updated_at) VALUES
      (lower(hex(randomblob(16))), 'instance', NULL, 'public.base_url', '\"http://localhost:5173\"', datetime('now')),
      (lower(hex(randomblob(16))), 'instance', NULL, 'mail.from_address', '\"shoebox@your-domain.example\"', datetime('now')),
      (lower(hex(randomblob(16))), 'instance', NULL, 'mail.from_name', '\"Memory Shoebox\"', datetime('now'));"
   ```

2. One member, at an address they can read:

   ```sh
   sqlite3 ./apps/server/data/memory-shoebox.db \
     "INSERT INTO members (id, email, display_name, role, status, notify_on_upload, notify_on_comment, notify_on_reply, notify_on_removal, created_at)
      VALUES (lower(hex(randomblob(16))), 'you@example.com', 'You', 'admin', 'invited', 1, 1, 1, 1, datetime('now'));"
   ```

   The id is not a uuid in that statement, which is fine for a scratch
   database and is not how the application mints one.

3. `pnpm dev:server`, then walk the flow with `curl`, reading the code out of
   the email each time:

   ```sh
   curl -i localhost:8080/api/public-settings
   curl -i -X POST localhost:8080/api/auth/sign-in-codes -H 'content-type: application/json' -d '{"email":"you@example.com"}'
   # wrong code: expect 401 and attemptsRemaining 2
   curl -i -X POST localhost:8080/api/auth/session -H 'content-type: application/json' -d '{"email":"you@example.com","code":"000000"}'
   # the real one: expect 201, a Set-Cookie, and isFirstSignIn true
   curl -i -X POST localhost:8080/api/auth/session -H 'content-type: application/json' -d '{"email":"you@example.com","code":"NNNNNN"}'
   curl -i localhost:8080/api/me --cookie 'shoebox_session=...'
   curl -i localhost:8080/api/me/sessions --cookie 'shoebox_session=...'
   ```

4. The three failing states the design spec names: `wrong` (above), `expired`
   (wait ten minutes, or set `expires_at` back by hand and submit), and
   `resent` (press the resend route, then try the superseded code and confirm
   the `410`).

Record what they saw in the pull request or the commit message. If the email
does not arrive, `GET /api/mail/health` is step 8a's, so read
`outbound_emails.state` and `last_error_message` directly.

- [ ] **Step 4: Mark the step done**

In `docs/prds/2026-09-27-memory-shoebox/plan/step-3a.md`, line 3:

```
**Status:** not started   ->   **Status:** done
```

- [ ] **Step 5: Commit**

```bash
git add docs/prds/2026-09-27-memory-shoebox/plan/step-3a.md
git commit -m "docs: step 3a is done"
```

---

## What this plan deliberately leaves to a later step

| Left out                                                       | Owner    | Why it is not here                                                                                  |
| -------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------- |
| Inviting anybody, changing a role, creating or editing a group | step 8a  | This step **reads** groups and roles. The writes all have to call `bumpVisibilityGeneration`        |
| `GET /api/settings` and `PATCH /api/settings`                  | step 8a  | Admin-only, and they carry the mail configuration and the storage figures                           |
| Every surface, including sign-in and My account                | 3b, 4b   | This is `apps/server` and `packages/shared` only                                                    |
| `GET /api/mail/health`'s route                                 | step 8a  | The queue data exists; the diagnosis ladder is that step's                                          |
| The one-time line a first sign-in shows                        | step 4a  | `isFirstSignIn` is the trigger and carries no number. The count in that sentence is viewer-filtered |
| The timeline, items, comments, uploads                         | 4a to 7a | They compose `applyVisibilityFilter`, which is what this step produces                              |

## Notes for the reviewer

Three things in this plan deviate from a document that later steps cite, each
argued in the step design and repeated here so a reviewer does not have to go
looking:

1. **`GET` and `PATCH /api/me` answer `{ me, settings }`**, where `auth.md`
   writes a bare `MeDto`. `MeDto` itself is untouched. Without it, a reload has
   no way to get `pile.arrangement`, which is deliberately not publicly
   readable.
2. **`publicReadPerIp` is a new rate-limit rule.** `administration.md` says the
   public settings route "takes the per-IP bucket", and the only one in that
   table is twenty an hour, which would lock out anybody reloading the sign-in
   page.
3. **`SESSION_SECRET` is repurposed rather than joined by a second secret.** It
   was parsed and unread, because the cookie it was documented as encrypting is
   an opaque token. The pepper is derived from it with HKDF.

And one hazard found while designing, which belongs to step 6a and is written
into `bumpVisibilityGeneration`'s docstring so it is read at the call site:
**inserting a `visibility_rules` row has to bump the generation**, or a
brand-new upload is invisible to every viewer whose expansion is cached.
