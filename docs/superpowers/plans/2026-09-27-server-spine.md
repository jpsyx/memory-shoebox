# Server Spine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build everything in `apps/server` that is not a route and that every route needs: the request context, the error envelope, rate limiting, the job runner with its seven jobs, an extended Backblaze client, and the outbound mail queue with its worker and its renderer.

**Architecture:** Fastify hooks supply the cross-cutting middleware (`onRequest` attaches the viewer, `preHandler` applies rate limits, `setErrorHandler` renders one error envelope). Background work is one interval-driven runner holding the seven specified jobs plus the mail queue at ten seconds. Mail is a database queue: `enqueueEmail` writes a row inside the caller's transaction and never throws, and a worker claims rows with a conditional `UPDATE`, renders from the payload alone, and sends through a `MailSender` interface that tests substitute.

**Tech Stack:** TypeScript on Node 22 (type stripping, no build step), Fastify 5, Kysely over better-sqlite3, Zod 4 in `packages/shared`, the `resend` SDK, Vitest.

**Design:** [`docs/superpowers/specs/2026-09-27-server-spine-design.md`](../specs/2026-09-27-server-spine-design.md)

---

## Conventions this plan assumes

Read these before starting. They are repository rules, not preferences:

- **Relative imports inside `apps/server` must carry the `.ts` extension.** Node resolves them literally. oxlint enforces it.
- **`packages/shared` is imported for types only from `apps/server`.** `import type { ... } from "@memory-shoebox/shared"`.
- **Red/green TDD.** Write the failing test, run it, watch it fail for the right reason, then implement.
- **No em dashes** in code comments or documentation. Use a colon, a hyphen, or parentheses.
- **Top-level functions use the `function` keyword**; nested functions and object properties are arrow functions.
- **Every exported function, object and class carries a docstring.**
- **Objects of four properties or more get a named type.** Single-parameter functions do not wrap that parameter in an object.
- Tests live in `apps/server/test/` and `packages/shared/test/`, mirroring the source path.

Run one package's tests with `pnpm --filter @memory-shoebox/server test`, and a single file with
`pnpm --filter @memory-shoebox/server exec vitest run test/path/to/file.test.ts`.

## File structure

**`packages/shared`**

| File | Responsibility |
| --- | --- |
| `src/email.ts` (create) | `OutboundEmailKind`, `EmailCommon`, `EnqueueEmailInput`, `SignInCodeEmailPayload`, `MailQueueHealth`, and their Zod schemas |
| `src/index.ts` (modify) | One more re-export |

**`apps/server/src`**

| File | Responsibility |
| --- | --- |
| `http/apiError.ts` (create) | The `ApiError` class and one named constructor per status in the conventions' table |
| `http/errorHandler.ts` (create) | `registerErrorHandler`: one envelope for every failure, including Zod and Fastify validation |
| `http/requestContext.ts` (create) | `Viewer`, the `request.viewer` decoration, `registerRequestContext`, `requireViewer` |
| `http/rateLimit/buckets.ts` (create) | `createFixedWindowLimiter`: in-memory counters, no storage, no logging |
| `http/rateLimit/rules.ts` (create) | `RATE_LIMIT_RULES`, one entry per row of `conventions.md` § Rate limits |
| `http/rateLimit/invitationResend.ts` (create) | The one rule that reads the database |
| `http/rateLimit/plugin.ts` (create) | `registerRateLimit`: the `preHandler` hook and the per-route config |
| `time/localDay.ts` (create) | `toLocalDay`, `countDaysBetween`: the only place an IANA zone is resolved |
| `settings/instanceSettings.ts` (create) | `readInstanceSettings`: resolves keys through `SETTING_DEFINITIONS` |
| `visibility/everyoneRule.ts` (create) | `EVERYONE_VISIBILITY_RULE_ID`, moved out of migration 0002 |
| `jobs/runner.ts` (create) | `createJobRunner`: intervals, overlap guard, clean stop |
| `jobs/sessionSweep.ts` … `jobs/removalReminder.ts` (create, 7) | One job body each, each exported as a plain async function over `(database, now)` |
| `jobs/registry.ts` (create) | The seven `Job` descriptors with their cadences |
| `mail/templates/layout.ts` (create) | Masthead, footer, HTML escaping, plain-text wrapping |
| `mail/templates/signInCode.ts` (create) | The one worked message: subject, HTML, plain text |
| `mail/templates/registry.ts` (create) | Kind to template, and the `BuiltEmailKind` type that gates the enqueue |
| `mail/enqueue.ts` (create) | `enqueueEmail`: resolves `EmailCommon`, derives the subject, never throws |
| `mail/sender.ts` (create) | `MailSender`, `MailSendError`, `createResendMailSender` |
| `mail/worker.ts` (create) | `runMailQueueOnce`: claim, suppress, render, send, retry, scrub |
| `mail/queueJob.ts` (create) | The ten-second `Job` that drives the worker, beside but not among the seven |
| `mail/health.ts` (create) | `readMailQueueHealth` |
| `b2/client.ts` (modify) | `presignGet`, `presignPut`, `presignMultipart`, `deleteObject` |
| `config.ts` (modify) | `RESEND_API_KEY`, optional |
| `app.ts` (modify) | Wires the hooks, the runner and the mail sender |
| `index.ts` (modify) | Starts background work; stops it on `SIGTERM` |

**`apps/server/test`**

| File | Responsibility |
| --- | --- |
| `helpers/testApp.ts` (create) | `createTestApp`, replacing the copy inline in `app.test.ts` |
| `helpers/fakeB2.ts` (create) | A recording Backblaze double |
| `helpers/recordingMailSender.ts` (create) | A recording `MailSender`, the only sender any test ever uses |
| `helpers/seed.ts` (create) | Row builders for members, sessions, invitations and removal requests |
| `helpers/forbiddenPayloadValues.ts` (create) | The payload guard from the design's verification table |
| one `.test.ts` per source file above | |

---

## Task 1: The shared email contract

**Files:**
- Create: `packages/shared/src/email.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/test/email.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/test/email.test.ts
import { describe, expect, it } from "vitest";
import {
  emailCommonSchema,
  OUTBOUND_EMAIL_KINDS,
  signInCodeEmailPayloadSchema,
} from "../src/email.ts";

describe("OUTBOUND_EMAIL_KINDS", () => {
  it("holds the seven kinds the schema's CHECK constraint allows", () => {
    expect([...OUTBOUND_EMAIL_KINDS]).toEqual([
      "sign_in_code",
      "invitation",
      "upload_session",
      "comment",
      "removal_request",
      "removal_reminder",
      "removal_resolved",
    ]);
  });
});

describe("emailCommonSchema", () => {
  it("accepts a resolved common block", () => {
    const parsed = emailCommonSchema.safeParse({
      shoeboxName: "My Shoebox",
      baseUrl: "https://shoebox.example",
      timezone: "Europe/Madrid",
      toDisplayName: "Abuela Rosa",
      preferencesUrl: "https://shoebox.example/account",
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects a relative base URL, because an email can only carry an absolute one", () => {
    const parsed = emailCommonSchema.safeParse({
      shoeboxName: "My Shoebox",
      baseUrl: "/account",
      timezone: "Europe/Madrid",
      toDisplayName: null,
      preferencesUrl: null,
    });

    expect(parsed.success).toBe(false);
  });
});

describe("signInCodeEmailPayloadSchema", () => {
  it("requires preferencesUrl to be null, because this kind has no switch to offer", () => {
    const common = {
      shoeboxName: "My Shoebox",
      baseUrl: "https://shoebox.example",
      timezone: "Europe/Madrid",
      toDisplayName: null,
    };

    expect(
      signInCodeEmailPayloadSchema.safeParse({
        ...common,
        preferencesUrl: null,
        code: "410233",
        expiresAt: "2026-09-27T10:10:00.000Z",
        expiresInMinutes: 10,
      }).success,
    ).toBe(true);

    expect(
      signInCodeEmailPayloadSchema.safeParse({
        ...common,
        preferencesUrl: "https://shoebox.example/account",
        code: "410233",
        expiresAt: "2026-09-27T10:10:00.000Z",
        expiresInMinutes: 10,
      }).success,
    ).toBe(false);
  });

  it("rejects a code that is not six digits", () => {
    const parsed = signInCodeEmailPayloadSchema.safeParse({
      shoeboxName: "My Shoebox",
      baseUrl: "https://shoebox.example",
      timezone: "Europe/Madrid",
      toDisplayName: null,
      preferencesUrl: null,
      code: "41023",
      expiresAt: "2026-09-27T10:10:00.000Z",
      expiresInMinutes: 10,
    });

    expect(parsed.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `pnpm --filter @memory-shoebox/shared exec vitest run test/email.test.ts`
Expected: FAIL, `Failed to resolve import "../src/email.ts"`.

- [ ] **Step 3: Write the module**

```ts
// packages/shared/src/email.ts
import { z } from "zod";
import { signedUrlSchema, timestampSchema } from "./dtos.ts";

/**
 * The seven kinds the product sends.
 *
 * A reaction is deliberately not one of them and must not become one
 * (`apis/notifications.md` § Rules that hold for all nine): it is one tap,
 * meant to cost the person leaving it nothing, which it stops doing the
 * moment it costs somebody else an email.
 *
 * The order matches the `CHECK` constraint in migration
 * `0007_operations_and_audit.ts`, so the two can be read side by side.
 */
export const OUTBOUND_EMAIL_KINDS = [
  "sign_in_code",
  "invitation",
  "upload_session",
  "comment",
  "removal_request",
  "removal_reminder",
  "removal_resolved",
] as const;

/** One of the seven kinds. */
export const outboundEmailKindSchema = z.enum(OUTBOUND_EMAIL_KINDS);

/** One of the seven kinds. */
export type OutboundEmailKind = z.infer<typeof outboundEmailKindSchema>;

/**
 * What caused a message.
 *
 * `item` is in the list and is not an email kind: it is what a `comment`
 * message's link resolves against. The column carries no foreign key, because
 * the trigger can be deleted and the mail record must outlive it.
 */
export const outboundEmailTriggerKindSchema = z.enum([
  "sign_in_code",
  "invitation",
  "upload_session",
  "comment",
  "removal_request",
  "item",
]);

/** What caused a message. */
export type OutboundEmailTriggerKind = z.infer<
  typeof outboundEmailTriggerKindSchema
>;

/**
 * The block on every payload, resolved at enqueue so that rendering is a pure
 * function of the payload (`apis/notifications.md` § Rules that hold for all
 * nine).
 *
 * Every instance setting the renderer reads travels here. Without that,
 * changing `shoebox.timezone` between enqueue and send would move a queued
 * batch's day, which is the same non-determinism the recipient snapshot exists
 * to avoid.
 */
export const emailCommonSchema = z.object({
  shoeboxName: z.string().min(1),
  /** Absolute, from `public.base_url`. No message is renderable without it. */
  baseUrl: signedUrlSchema,
  /** IANA zone from `shoebox.timezone`, frozen at enqueue. */
  timezone: z.string().min(1),
  /** The recipient's own name, for the greeting. Null falls back to nothing. */
  toDisplayName: z.string().nullable(),
  /** Null for `sign_in_code`, which has no switch to offer. */
  preferencesUrl: signedUrlSchema.nullable(),
});

/** The block on every payload. */
export type EmailCommon = z.infer<typeof emailCommonSchema>;

/**
 * `sign_in_code`: the six digits, addressed to whoever typed the address.
 *
 * The code is in the subject line deliberately, so it reads off a lock screen,
 * which is why both `payload_json` and `subject` are scrubbed once the row is
 * terminal (`data-models.md` § `outbound_emails`).
 */
export const signInCodeEmailPayloadSchema = emailCommonSchema.extend({
  /** The six digits, plaintext. Scrubbed from the row once terminal. */
  code: z.string().regex(/^\d{6}$/),
  expiresAt: timestampSchema,
  /** Carried so the copy cannot drift from the row it describes. */
  expiresInMinutes: z.number().int().positive(),
  /** Always null for this kind: there is no preference that turns it off. */
  preferencesUrl: z.null(),
});

/** `sign_in_code`'s payload. */
export type SignInCodeEmailPayload = z.infer<
  typeof signInCodeEmailPayloadSchema
>;

/**
 * What a caller hands `enqueueEmail`.
 *
 * `PayloadExtras` is the kind's payload **minus** `EmailCommon`: the enqueue
 * resolves that block itself, because only code inside the enqueue can
 * discover that `public.base_url` is unset and write the row anyway
 * (`apis/notifications.md` § When `public.base_url` is unset). The subject is
 * derived from the kind's template for the same reason, since
 * `invitation`'s subject interpolates the Shoebox name, which a caller does
 * not hold. Recorded in the step design as a deliberate deviation from the
 * shape `notifications.md` § The enqueue interface freezes.
 */
export type EnqueueEmailInput<
  Kind extends OutboundEmailKind,
  PayloadExtras,
> = {
  kind: Kind;
  /** Normalised by the enqueue. Denormalised onto the row. */
  toAddress: string;
  toMemberId: string | null;
  /** The recipient's own name, for the greeting. */
  toDisplayName: string | null;
  /** Verbatim from the recipe table in `apis/notifications.md`. `UNIQUE`. */
  idempotencyKey: string;
  payload: PayloadExtras;
  triggerKind: OutboundEmailTriggerKind;
  triggerId: string;
  /** Defaults to now. The reminder job is the only caller that sets it. */
  sendAfter?: string;
};

/**
 * What is sitting in `outbound_emails` right now, for the admin's mail banner
 * (`apis/notifications.md` § Mail).
 *
 * No formatted or relative string: the surface's "has not gone out for three
 * hours" is computed in the browser from `oldestQueuedAt`.
 */
export const mailQueueHealthSchema = z.object({
  queuedCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  suppressedCount: z.number().int().nonnegative(),
  sentLast24hCount: z.number().int().nonnegative(),
  oldestQueuedAt: timestampSchema.nullable(),
  lastSentAt: timestampSchema.nullable(),
  lastFailedAt: timestampSchema.nullable(),
});

/** What is sitting in `outbound_emails` right now. */
export type MailQueueHealth = z.infer<typeof mailQueueHealthSchema>;
```

- [ ] **Step 4: Export it from the barrel**

```ts
// packages/shared/src/index.ts, alongside the existing exports
export * from "./email.ts";
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `pnpm --filter @memory-shoebox/shared exec vitest run test/email.test.ts`
Expected: PASS, six assertions across three suites.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/email.ts packages/shared/src/index.ts packages/shared/test/email.test.ts
git commit -m "feat(shared): the outbound email contract

OutboundEmailKind, EmailCommon, EnqueueEmailInput and the sign_in_code
payload. EnqueueEmailInput takes the kind-specific fields only: the enqueue
resolves EmailCommon itself, because only it can discover that public.base_url
is unset and still write the row.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `ApiError`

**Files:**
- Create: `apps/server/src/http/apiError.ts`
- Test: `apps/server/test/http/apiError.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/server/test/http/apiError.test.ts
import { describe, expect, it } from "vitest";
import { ApiError } from "../../src/http/apiError.ts";

describe("ApiError", () => {
  it("carries the status, the code and the details", () => {
    const error = ApiError.rateLimited(42);

    expect(error.statusCode).toBe(429);
    expect(error.code).toBe("rate_limited");
    expect(error.details).toEqual({ retryAfterSeconds: 42 });
  });

  it("is an Error, so a handler may simply throw it", () => {
    expect(ApiError.notSignedIn()).toBeInstanceOf(Error);
  });

  it("maps each named constructor to the status the conventions give it", () => {
    expect(ApiError.notSignedIn().statusCode).toBe(401);
    expect(ApiError.forbidden("mail_forbidden").statusCode).toBe(403);
    expect(ApiError.notFound("item_not_found").statusCode).toBe(404);
    expect(ApiError.conflict("upload_conflict").statusCode).toBe(409);
    expect(ApiError.gone("sign_in_code_expired").statusCode).toBe(410);
    expect(
      ApiError.unavailable("upload_storage_unavailable").statusCode,
    ).toBe(503);
  });

  it("carries fieldErrors on an invalid request", () => {
    const error = ApiError.invalidRequest({ email: ["is required"] });

    expect(error.statusCode).toBe(400);
    expect(error.code).toBe("invalid_request");
    expect(error.details).toEqual({ fieldErrors: { email: ["is required"] } });
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `pnpm --filter @memory-shoebox/server exec vitest run test/http/apiError.test.ts`
Expected: FAIL, `Failed to resolve import "../../src/http/apiError.ts"`.

- [ ] **Step 3: Write the module**

```ts
// apps/server/src/http/apiError.ts
import type { ApiErrorDetails } from "@memory-shoebox/shared";

/**
 * One failure, in the shape every route returns
 * (`apis/conventions.md` § Errors).
 *
 * `code` is a stable `snake_case` string the client branches on, named
 * `<domain>_<condition>`. `message` is English, for a log or a fallback, and
 * is never the primary interface copy. `details` carries the three documented
 * structured cases and nothing else.
 *
 * The named constructors exist so that the status table lives in one place. A
 * handler that writes `new ApiError(404, ...)` by hand is how the 403/404 line
 * gets blurred, and that line is the counting rule: **404 means you may not
 * see it, 403 means you can see it and may not do it.**
 */
export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details: ApiErrorDetails | undefined;

  constructor(options: {
    statusCode: number;
    code: string;
    message: string;
    details?: ApiErrorDetails;
  }) {
    super(options.message);
    this.name = "ApiError";
    this.statusCode = options.statusCode;
    this.code = options.code;
    this.details = options.details;
  }

  /** `400`: malformed, or failed validation. */
  static invalidRequest(
    fieldErrors: Record<string, readonly string[]>,
  ): ApiError {
    return new ApiError({
      statusCode: 400,
      code: "invalid_request",
      message: "The request was not valid.",
      details: { fieldErrors: fieldErrors as Record<string, string[]> },
    });
  }

  /** `401`: no session, or an expired one. */
  static notSignedIn(): ApiError {
    return new ApiError({
      statusCode: 401,
      code: "not_signed_in",
      message: "This request needs a signed-in session.",
    });
  }

  /**
   * `403`: **role or capability only**. The viewer can see the thing and may
   * not do it. Anything they may not see is a 404 instead, always.
   */
  static forbidden(code: string): ApiError {
    return new ApiError({
      statusCode: 403,
      code,
      message: "Your role does not allow this.",
    });
  }

  /**
   * `404`: it does not exist, **or the viewer may not see it**. The two are
   * byte-identical on the wire, which is what stops a 403 confirming that
   * something exists at an id.
   */
  static notFound(code: string): ApiError {
    return new ApiError({
      statusCode: 404,
      code,
      message: "Not found.",
    });
  }

  /** `409`: a state conflict. */
  static conflict(code: string): ApiError {
    return new ApiError({
      statusCode: 409,
      code,
      message: "That conflicts with the current state.",
    });
  }

  /** `410`: a sign-in code that has expired or been superseded. */
  static gone(code: string): ApiError {
    return new ApiError({
      statusCode: 410,
      code,
      message: "That is no longer available.",
    });
  }

  /** `429`: rate limited, carrying the seconds until a retry may work. */
  static rateLimited(retryAfterSeconds: number): ApiError {
    return new ApiError({
      statusCode: 429,
      code: "rate_limited",
      message: "Too many requests.",
      details: { retryAfterSeconds },
    });
  }

  /** `503`: a third party is down while the database is fine. */
  static unavailable(code: string): ApiError {
    return new ApiError({
      statusCode: 503,
      code,
      message: "A service this route depends on is unavailable.",
    });
  }
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `pnpm --filter @memory-shoebox/server exec vitest run test/http/apiError.test.ts`
Expected: PASS, four tests.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/http/apiError.ts apps/server/test/http/apiError.test.ts
git commit -m "feat(server): ApiError, one named constructor per status

The status table from conventions.md lives in one place, so the 403/404 line
is decided once rather than per handler.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Test helpers

Every later task uses these. They are written first so that no task invents its
own copy, and `app.test.ts` stops carrying an inline one.

**Files:**
- Create: `apps/server/test/helpers/testApp.ts`
- Create: `apps/server/test/helpers/fakeB2.ts`
- Create: `apps/server/test/helpers/seed.ts`
- Modify: `apps/server/test/app.test.ts`

- [ ] **Step 1: Write the fake Backblaze client**

```ts
// apps/server/test/helpers/fakeB2.ts
import type { B2Client, B2Object } from "../../src/b2/client.ts";

/** A `B2Client` that records what it was asked to do and talks to nothing. */
export type FakeB2Client = B2Client & {
  readonly deletedKeys: readonly string[];
  /** Keys that will throw when deleted, so a retry path can be exercised. */
  failingKeys: Set<string>;
  readonly objects: Map<string, B2Object>;
};

/**
 * Builds a Backblaze double.
 *
 * No test in this repository may reach Backblaze: the credentials in the test
 * config are placeholders, and a client that signed a real request would be
 * signing it with them.
 */
export function createFakeB2Client(): FakeB2Client {
  const deletedKeys: string[] = [];
  const failingKeys = new Set<string>();
  const objects = new Map<string, B2Object>();

  const client: FakeB2Client = {
    deletedKeys,
    failingKeys,
    objects,

    listObjects: async function* (options = {}) {
      for (const object of objects.values()) {
        if (options.prefix === undefined || object.key.startsWith(options.prefix)) {
          yield object;
        }
      }
    },

    presignGet: ({ key }) => {
      return Promise.resolve(`https://b2.test/get/${encodeURIComponent(key)}`);
    },

    presignPut: ({ key }) => {
      return Promise.resolve(`https://b2.test/put/${encodeURIComponent(key)}`);
    },

    presignMultipart: ({ key, partCount }) => {
      return Promise.resolve({
        uploadId: `upload-${key}`,
        partUrls: Array.from({ length: partCount }, (_unused, index) => {
          return `https://b2.test/part/${encodeURIComponent(key)}/${index + 1}`;
        }),
      });
    },

    completeMultipart: () => {
      return Promise.resolve();
    },

    abortMultipart: () => {
      return Promise.resolve();
    },

    deleteObject: ({ key }) => {
      if (failingKeys.has(key)) {
        return Promise.reject(new Error(`B2 refused to delete ${key}`));
      }
      deletedKeys.push(key);
      objects.delete(key);
      return Promise.resolve();
    },

    putObject: ({ key }) => {
      objects.set(key, {
        key,
        sizeBytes: 0,
        uploadedAt: "2026-09-27T10:00:00.000Z",
      });
      return Promise.resolve();
    },
  };

  return client;
}
```

- [ ] **Step 2: Write the row builders**

Kysely's `Database` type declares no `Generated` columns, so an insert has to
name every column. That is the whole reason these exist: eleven test files
spelling out twelve columns each is eleven chances to disagree about what an
`active` member looks like.

```ts
// apps/server/test/helpers/seed.ts
import type { Kysely } from "kysely";
import { createId } from "../../src/db/ids.ts";
import type { Database } from "../../src/db/types.ts";

/** A fixed instant, so that every fixture reads as one moment in time. */
export const NOW = "2026-09-27T10:00:00.000Z";

/** Shifts an ISO instant by whole minutes. Negative goes into the past. */
export function shiftMinutes(instant: string, minutes: number): string {
  return new Date(Date.parse(instant) + minutes * 60_000).toISOString();
}

/** Shifts an ISO instant by whole days. Negative goes into the past. */
export function shiftDays(instant: string, days: number): string {
  return shiftMinutes(instant, days * 24 * 60);
}

/**
 * Inserts one member and returns its id.
 *
 * Defaults to an active uploader who wants every notification, because that is
 * the row most tests need and the interesting cases are the departures from it.
 */
export async function insertMember(
  database: Kysely<Database>,
  overrides: Partial<Database["members"]> = {},
): Promise<string> {
  const id = overrides.id ?? createId();
  await database
    .insertInto("members")
    .values({
      id,
      email: `${id}@example.com`,
      display_name: "Abuela Rosa",
      role: "uploader",
      status: "active",
      notify_on_upload: 1,
      notify_on_comment: 1,
      notify_on_reply: 1,
      notify_on_removal: 1,
      joined_at: NOW,
      last_signed_in_at: NOW,
      last_seen_at: NOW,
      removed_at: null,
      created_at: NOW,
      ...overrides,
    })
    .execute();
  return id;
}

/** Inserts one session for a member and returns its id. */
export async function insertSession(
  database: Kysely<Database>,
  options: { memberId: string } & Partial<Database["sessions"]>,
): Promise<string> {
  const { memberId, ...overrides } = options;
  const id = overrides.id ?? createId();
  await database
    .insertInto("sessions")
    .values({
      id,
      member_id: memberId,
      token_hash: `hash-${id}`,
      device_label: "A phone",
      user_agent: null,
      created_at: NOW,
      last_used_at: NOW,
      expires_at: shiftDays(NOW, 30),
      ...overrides,
    })
    .execute();
  return id;
}

/** Inserts one invitation and returns its id. */
export async function insertInvitation(
  database: Kysely<Database>,
  options: {
    memberId: string;
    invitedByMemberId: string;
  } & Partial<Database["invitations"]>,
): Promise<string> {
  const { memberId, invitedByMemberId, ...overrides } = options;
  const id = overrides.id ?? createId();
  await database
    .insertInto("invitations")
    .values({
      id,
      member_id: memberId,
      invited_by_member_id: invitedByMemberId,
      created_at: NOW,
      expires_at: shiftDays(NOW, 7),
      send_count: 1,
      last_sent_at: NOW,
      revoked_at: null,
      accepted_at: null,
      ...overrides,
    })
    .execute();
  return id;
}

/** Inserts one open removal request and returns its id. */
export async function insertRemovalRequest(
  database: Kysely<Database>,
  options: {
    requestedByMemberId: string;
    itemUploaderMemberId: string;
  } & Partial<Database["removal_requests"]>,
): Promise<string> {
  const { requestedByMemberId, itemUploaderMemberId, ...overrides } = options;
  const id = overrides.id ?? createId();
  await database
    .insertInto("removal_requests")
    .values({
      id,
      // Null is legal only once the request is no longer open
      // (migration 0009), so an open fixture carries a snapshot instead.
      item_id: null,
      requested_by_member_id: requestedByMemberId,
      reason: "I would rather this one came down.",
      state: "declined",
      decline_reason: "It is the only photograph of that afternoon.",
      created_at: NOW,
      resolved_at: NOW,
      resolved_by_member_id: itemUploaderMemberId,
      item_uploader_member_id: itemUploaderMemberId,
      item_captured_at: NOW,
      item_storage_key: null,
      ...overrides,
    })
    .execute();
  return id;
}

/** Writes one instance-scoped setting, JSON-encoded as the column expects. */
export async function insertInstanceSetting(
  database: Kysely<Database>,
  options: { key: string; value: unknown },
): Promise<void> {
  await database
    .insertInto("settings")
    .values({
      id: createId(),
      scope: "instance",
      scope_id: null,
      key: options.key,
      value: JSON.stringify(options.value),
      updated_at: NOW,
      updated_by_member_id: null,
    })
    .execute();
}

/** Inserts one `pending_object_deletions` row and returns its id. */
export async function insertPendingObjectDeletion(
  database: Kysely<Database>,
  options: { storageKey: string } & Partial<
    Database["pending_object_deletions"]
  >,
): Promise<string> {
  const { storageKey, ...overrides } = options;
  const id = overrides.id ?? createId();
  await database
    .insertInto("pending_object_deletions")
    .values({
      id,
      storage_key: storageKey,
      attempts: 0,
      last_error: null,
      created_at: NOW,
      last_attempted_at: null,
      ...overrides,
    })
    .execute();
  return id;
}

/** Inserts one `outbound_emails` row and returns its id. */
export async function insertOutboundEmail(
  database: Kysely<Database>,
  overrides: Partial<Database["outbound_emails"]> = {},
): Promise<string> {
  const id = overrides.id ?? createId();
  await database
    .insertInto("outbound_emails")
    .values({
      id,
      kind: "sign_in_code",
      to_address: "rosa@example.com",
      to_member_id: null,
      from_address: null,
      subject: "Your code is 410233",
      payload_json: JSON.stringify({ code: "410233" }),
      trigger_kind: "sign_in_code",
      trigger_id: createId(),
      idempotency_key: `signin:${id}`,
      state: "queued",
      send_after: NOW,
      attempts: 0,
      next_attempt_at: null,
      provider_message_id: null,
      provider_request_id: null,
      last_error_code: null,
      last_error_message: null,
      delivery_state: null,
      delivery_updated_at: null,
      created_at: NOW,
      sent_at: null,
      ...overrides,
    })
    .execute();
  return id;
}
```

- [ ] **Step 3: Write the application helper**

```ts
// apps/server/test/helpers/testApp.ts
import type { FastifyInstance } from "fastify";
import type { Kysely } from "kysely";
import { createApp, type AppDeps } from "../../src/app.ts";
import { parseConfig, type Config } from "../../src/config.ts";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import type { Database } from "../../src/db/types.ts";
import { createFakeB2Client, type FakeB2Client } from "./fakeB2.ts";

/** Everything a test needs to drive the real application. */
export type TestApp = {
  app: FastifyInstance;
  database: Kysely<Database>;
  b2: FakeB2Client;
  config: Config;
  /** Closes the app and the database. Always call it, or vitest will hang. */
  close: () => Promise<void>;
};

/**
 * Placeholder credentials.
 *
 * They are deliberately not a real key of any kind. Nothing in the test suite
 * may reach Backblaze or Resend, so a test that somehow did would fail at the
 * network rather than send something.
 */
export function buildTestConfig(
  environment: Record<string, string | undefined> = {},
): Config {
  return parseConfig({
    SESSION_SECRET: "a".repeat(32),
    B2_KEY_ID: "key-id",
    B2_APPLICATION_KEY: "application-key",
    B2_BUCKET: "memory-shoebox-media",
    B2_ENDPOINT: "https://s3.us-west-004.backblazeb2.com",
    B2_REGION: "us-west-004",
    ...environment,
  });
}

/**
 * Builds the real application over an in-memory, fully migrated database.
 *
 * Background work is off by default: a test that wants a job or the mail queue
 * to run calls it directly rather than waiting on an interval.
 */
export async function createTestApp(
  overrides: Partial<AppDeps> = {},
): Promise<TestApp> {
  const database = overrides.database ?? createDatabase(":memory:");
  await migrateToLatest(database);
  const config = overrides.config ?? buildTestConfig();
  const b2 = createFakeB2Client();

  const app = await createApp({
    config,
    database,
    b2,
    logger: false,
    ...overrides,
  });

  return {
    app,
    database,
    b2,
    config,
    close: async () => {
      await app.close();
      await database.destroy();
    },
  };
}
```

- [ ] **Step 4: Rewrite `app.test.ts` onto the helper**

```ts
// apps/server/test/app.test.ts
import { describe, expect, it } from "vitest";
import { createTestApp } from "./helpers/testApp.ts";

describe("createApp", () => {
  it("reports health on GET /api/health", async () => {
    const context = await createTestApp();

    const response = await context.app.inject({
      method: "GET",
      url: "/api/health",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "ok" });
    await context.close();
  });

  it("returns JSON 404 for an unknown API route", async () => {
    const context = await createTestApp();

    const response = await context.app.inject({
      method: "GET",
      url: "/api/nope",
    });

    expect(response.statusCode).toBe(404);
    expect(response.headers["content-type"]).toContain("application/json");
    await context.close();
  });
});
```

- [ ] **Step 5: Run the suite**

Run: `pnpm --filter @memory-shoebox/server exec vitest run test/app.test.ts`
Expected: FAIL. `fakeB2.ts` references `presignGet`, `presignPut`,
`presignMultipart`, `completeMultipart`, `abortMultipart` and `deleteObject`,
none of which are on `B2Client` yet. This is the expected red: Task 4 adds
them. Leave it failing and go to Task 4 rather than weakening the fake.

- [ ] **Step 6: Commit after Task 4 goes green**

These two tasks share one commit, because neither type-checks alone.

---

## Task 4: The Backblaze client gains its four operations

**Files:**
- Modify: `apps/server/src/b2/client.ts`
- Test: `apps/server/test/b2/client.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/server/test/b2/client.test.ts
import { describe, expect, it } from "vitest";
import { createB2Client } from "../../src/b2/client.ts";
import { buildTestConfig } from "../helpers/testApp.ts";

function createClient() {
  return createB2Client(buildTestConfig().b2);
}

describe("createB2Client", () => {
  it("signs a GET for one object", async () => {
    const url = await createClient().presignGet({ key: "media/one.jpg" });

    expect(url).toContain("/memory-shoebox-media/media/one.jpg");
    expect(url).toContain("X-Amz-Signature=");
  });

  it("signs a PUT the browser uploads to directly", async () => {
    const url = await createClient().presignPut({
      key: "media/one.jpg",
      contentType: "image/jpeg",
      expiresInSeconds: 900,
    });

    expect(url).toContain("X-Amz-Signature=");
    expect(url).toContain("X-Amz-Expires=900");
  });

  it("signs one URL per part of a multipart upload", async () => {
    const started = await createClient().presignMultipart({
      key: "media/big.mov",
      contentType: "video/quicktime",
      partCount: 3,
    });

    expect(started.partUrls).toHaveLength(3);
    expect(started.partUrls[0]).toContain("partNumber=1");
    expect(started.partUrls[2]).toContain("partNumber=3");
  });
});
```

`presignMultipart` reaches Backblaze to open the upload, so this third test
cannot run offline. Mark it `it.skip` with the reason in a comment: the
operations that only sign a URL are exercised here, and the two that call the
API (`presignMultipart`, `completeMultipart`, `abortMultipart`) are covered by
step 6a against a real bucket. `deleteObject` is exercised through the fake in
Task 12.

- [ ] **Step 2: Run the test and watch it fail**

Run: `pnpm --filter @memory-shoebox/server exec vitest run test/b2/client.test.ts`
Expected: FAIL, `client.presignGet is not a function`.

- [ ] **Step 3: Extend the client**

Add the imports, extend the `B2Client` type, rename `presignGetUrl` to
`presignGet`, and add the four operations. The existing `listObjects` and
`putObject` stay exactly as they are.

```ts
// apps/server/src/b2/client.ts, imports
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
  type ListObjectsV2CommandOutput,
} from "@aws-sdk/client-s3";
```

```ts
// apps/server/src/b2/client.ts, replacing the B2Client type

/** One part of a multipart upload, as the browser finished it. */
export type UploadedPart = {
  partNumber: number;
  /** The `ETag` header Backblaze returned for that part, verbatim. */
  etag: string;
};

/** A multipart upload that has been opened and signed, part by part. */
export type StartedMultipartUpload = {
  /** Backblaze's own id for the upload, stored on `upload_files`. */
  uploadId: string;
  /** One signed URL per part, in part order. */
  partUrls: readonly string[];
};

/**
 * The Backblaze operations the rest of the server is allowed to use.
 *
 * **Media bytes never pass through the server** (`docs/architecture.md`
 * § Where data lives), which is what confines this interface to signing URLs
 * the browser uses and deleting objects the browser cannot. `putObject` is the
 * one exception and exists for small derived files.
 */
export type B2Client = {
  listObjects: (options?: { prefix?: string }) => AsyncGenerator<B2Object>;
  presignGet: (options: {
    key: string;
    expiresInSeconds?: number;
  }) => Promise<string>;
  presignPut: (options: {
    key: string;
    contentType: string;
    expiresInSeconds?: number;
  }) => Promise<string>;
  presignMultipart: (options: {
    key: string;
    contentType: string;
    partCount: number;
    expiresInSeconds?: number;
  }) => Promise<StartedMultipartUpload>;
  completeMultipart: (options: {
    key: string;
    uploadId: string;
    parts: readonly UploadedPart[];
  }) => Promise<void>;
  abortMultipart: (options: {
    key: string;
    uploadId: string;
  }) => Promise<void>;
  deleteObject: (options: { key: string }) => Promise<void>;
  putObject: (options: {
    key: string;
    body: Uint8Array;
    contentType: string;
  }) => Promise<void>;
};

/**
 * How long an upload URL lives.
 *
 * Far shorter than the seven days a read URL gets: a read URL is a bearer link
 * to bytes that already exist, and a write URL is permission to put new bytes
 * in the bucket. `upload_files.presigned_until` records when one dies, which
 * is also how `upload-abandon-sweep` recognises a stale transfer.
 */
const UPLOAD_URL_SECONDS = 3600;
```

```ts
// apps/server/src/b2/client.ts, inside the returned object, replacing
// presignGetUrl and adding the rest. listObjects and putObject are untouched.

    /**
     * Returns a presigned URL the browser can use to fetch one object.
     *
     * @param options.key The object key.
     * @param options.expiresInSeconds Lifetime of the URL. Defaults to the
     *   seven-day maximum so browser caching stays effective.
     */
    presignGet: ({ key, expiresInSeconds = MAX_PRESIGNED_URL_SECONDS }) => {
      return getSignedUrl(
        s3,
        new GetObjectCommand({
          Bucket: config.bucket,
          Key: key,
          ResponseCacheControl: `private, max-age=${MAX_PRESIGNED_URL_SECONDS}`,
        }),
        { expiresIn: expiresInSeconds },
      );
    },

    /**
     * Returns a presigned URL the browser uploads one whole object to.
     *
     * @param options.key The object key.
     * @param options.contentType The type the browser will send.
     * @param options.expiresInSeconds Lifetime of the URL, one hour by default.
     */
    presignPut: ({ key, contentType, expiresInSeconds = UPLOAD_URL_SECONDS }) => {
      return getSignedUrl(
        s3,
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          ContentType: contentType,
        }),
        { expiresIn: expiresInSeconds },
      );
    },

    /**
     * Opens a multipart upload and signs one URL per part.
     *
     * This is the one place the server talks to Backblaze on the write path,
     * and it still moves no bytes: the browser puts each part straight at the
     * signed URL and reports the `ETag` back.
     */
    presignMultipart: async ({
      key,
      contentType,
      partCount,
      expiresInSeconds = UPLOAD_URL_SECONDS,
    }) => {
      const created = await s3.send(
        new CreateMultipartUploadCommand({
          Bucket: config.bucket,
          Key: key,
          ContentType: contentType,
        }),
      );
      const uploadId = created.UploadId;
      if (uploadId === undefined) {
        throw new Error(`Backblaze opened no multipart upload for ${key}`);
      }

      const partUrls = await Promise.all(
        Array.from({ length: partCount }, (_unused, index) => {
          return getSignedUrl(
            s3,
            new UploadPartCommand({
              Bucket: config.bucket,
              Key: key,
              UploadId: uploadId,
              PartNumber: index + 1,
            }),
            { expiresIn: expiresInSeconds },
          );
        }),
      );

      return { uploadId, partUrls };
    },

    /** Closes a multipart upload once every part has landed. */
    completeMultipart: async ({ key, uploadId, parts }) => {
      await s3.send(
        new CompleteMultipartUploadCommand({
          Bucket: config.bucket,
          Key: key,
          UploadId: uploadId,
          MultipartUpload: {
            Parts: parts.map((part) => {
              return { PartNumber: part.partNumber, ETag: part.etag };
            }),
          },
        }),
      );
    },

    /** Abandons a multipart upload, so Backblaze stops billing for its parts. */
    abortMultipart: async ({ key, uploadId }) => {
      await s3.send(
        new AbortMultipartUploadCommand({
          Bucket: config.bucket,
          Key: key,
          UploadId: uploadId,
        }),
      );
    },

    /**
     * Deletes one object.
     *
     * Driven by `object-deletion-drain` and never called inline, because there
     * is no transaction spanning SQLite and Backblaze: the rows commit first so
     * the photograph genuinely vanishes, and the objects are drained after
     * (`data-models.md` § `pending_object_deletions`).
     */
    deleteObject: async ({ key }) => {
      await s3.send(
        new DeleteObjectCommand({ Bucket: config.bucket, Key: key }),
      );
    },
```

- [ ] **Step 4: Run the B2 and app tests**

Run: `pnpm --filter @memory-shoebox/server exec vitest run test/b2/client.test.ts test/app.test.ts`
Expected: PASS, with the multipart test reported as skipped.

- [ ] **Step 5: Type-check**

Run: `pnpm --filter @memory-shoebox/server type-check`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/b2/client.ts apps/server/test/b2 apps/server/test/helpers apps/server/test/app.test.ts
git commit -m "feat(server): presignPut, presignMultipart and deleteObject

presignGetUrl becomes presignGet to match the step's interface list.
presignMultipart carries complete and abort with it: a presigned multipart
upload that cannot be completed is half an interface. listObjects and
putObject are untouched.

Also the shared test helpers, since the Backblaze double is the first thing
that needs the full interface.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: The error envelope, and a logger that cannot leak an address

Fastify's default request logging includes `remoteAddress`, which
`data-models.md` § Privacy forbids outright: "No IP addresses and no location.
Not stored, not resolved, not logged." That is fixed here, beside the error
handler, because both are how a failure reaches the outside world.

**Files:**
- Create: `apps/server/src/http/errorHandler.ts`
- Modify: `apps/server/src/app.ts`
- Test: `apps/server/test/http/errorHandler.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/server/test/http/errorHandler.test.ts
import { z } from "zod";
import { describe, expect, it } from "vitest";
import { ApiError } from "../../src/http/apiError.ts";
import { createTestApp, type TestApp } from "../helpers/testApp.ts";

async function createAppWithThrowingRoutes(): Promise<TestApp> {
  const context = await createTestApp();
  context.app.get("/api/boom/api-error", () => {
    throw ApiError.notFound("item_not_found");
  });
  context.app.get("/api/boom/rate-limited", () => {
    throw ApiError.rateLimited(30);
  });
  context.app.get("/api/boom/zod", () => {
    z.object({ email: z.email() }).parse({ email: "nope" });
    return { unreachable: true };
  });
  context.app.get("/api/boom/unknown", () => {
    throw new Error("the database fell over, and it says so in English");
  });
  await context.app.ready();
  return context;
}

describe("the error handler", () => {
  it("renders an ApiError as the one envelope", async () => {
    const context = await createAppWithThrowingRoutes();

    const response = await context.app.inject({
      method: "GET",
      url: "/api/boom/api-error",
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: "item_not_found",
      message: "Not found.",
    });
    await context.close();
  });

  it("carries retryAfterSeconds in details and in the header", async () => {
    const context = await createAppWithThrowingRoutes();

    const response = await context.app.inject({
      method: "GET",
      url: "/api/boom/rate-limited",
    });

    expect(response.statusCode).toBe(429);
    expect(response.json()).toMatchObject({
      error: "rate_limited",
      details: { retryAfterSeconds: 30 },
    });
    expect(response.headers["retry-after"]).toBe("30");
    await context.close();
  });

  it("turns a Zod failure into 400 invalid_request with fieldErrors", async () => {
    const context = await createAppWithThrowingRoutes();

    const response = await context.app.inject({
      method: "GET",
      url: "/api/boom/zod",
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error).toBe("invalid_request");
    expect(body.details.fieldErrors.email).toHaveLength(1);
    await context.close();
  });

  it("never leaks an unexpected error's message to the client", async () => {
    const context = await createAppWithThrowingRoutes();

    const response = await context.app.inject({
      method: "GET",
      url: "/api/boom/unknown",
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: "internal_error",
      message: "Something went wrong.",
    });
    expect(response.body).not.toContain("database fell over");
    await context.close();
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `pnpm --filter @memory-shoebox/server exec vitest run test/http/errorHandler.test.ts`
Expected: FAIL. The first test gets Fastify's default `{"statusCode":500,...}`
shape rather than the envelope.

- [ ] **Step 3: Write the handler**

```ts
// apps/server/src/http/errorHandler.ts
import type { FastifyError, FastifyInstance } from "fastify";
import { ZodError } from "zod";
import type { ApiError as ApiErrorBody } from "@memory-shoebox/shared";
import { ApiError } from "./apiError.ts";

/** Groups Zod issues by the field they came from, the way `details` wants. */
function _fieldErrorsFromZod(error: ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    // An issue on the root has an empty path. It is still a field error as far
    // as the client is concerned, so it gets a name rather than being dropped.
    const field = issue.path.length === 0 ? "_" : issue.path.join(".");
    fieldErrors[field] = [...(fieldErrors[field] ?? []), issue.message];
  }
  return fieldErrors;
}

/** Groups Fastify's JSON Schema validation errors the same way. */
function _fieldErrorsFromFastify(
  validation: NonNullable<FastifyError["validation"]>,
): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of validation) {
    const field = issue.instancePath.replace(/^\//, "").replace(/\//g, ".");
    const name = field === "" ? "_" : field;
    fieldErrors[name] = [
      ...(fieldErrors[name] ?? []),
      issue.message ?? "is not valid",
    ];
  }
  return fieldErrors;
}

/** Translates whatever was thrown into the one error shape. */
function _toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }
  if (error instanceof ZodError) {
    return ApiError.invalidRequest(_fieldErrorsFromZod(error));
  }

  const fastifyError = error as FastifyError;
  if (fastifyError.validation !== undefined) {
    return ApiError.invalidRequest(_fieldErrorsFromFastify(fastifyError.validation));
  }
  // A malformed body, an unsupported media type and a too-large payload all
  // arrive as Fastify errors with a 4xx on them. They are the client's
  // mistake, so they keep their status and become `invalid_request`.
  if (
    typeof fastifyError.statusCode === "number" &&
    fastifyError.statusCode >= 400 &&
    fastifyError.statusCode < 500
  ) {
    return new ApiError({
      statusCode: fastifyError.statusCode,
      code: "invalid_request",
      message: "The request was not valid.",
    });
  }

  return new ApiError({
    statusCode: 500,
    code: "internal_error",
    message: "Something went wrong.",
  });
}

/**
 * Installs the one error envelope every failing route returns
 * (`apis/conventions.md` § Errors).
 *
 * Two things it deliberately does. It **never** puts an unexpected error's
 * own message on the wire: `message` is English for a log or a fallback, and a
 * database error's text is a description of the schema. And it logs at `error`
 * only for a 5xx, because a 404 or a 429 is the contract working rather than
 * something going wrong, and a log line per rate-limited request is how a log
 * becomes unreadable on the day it matters.
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    const apiError = _toApiError(error);

    if (apiError.statusCode >= 500) {
      request.log.error({ err: error }, "request failed");
    }

    const body: ApiErrorBody = {
      error: apiError.code,
      message: apiError.message,
      ...(apiError.details === undefined ? {} : { details: apiError.details }),
    };

    const retryAfterSeconds = apiError.details?.retryAfterSeconds;
    if (retryAfterSeconds !== undefined) {
      void reply.header("retry-after", String(retryAfterSeconds));
    }

    return reply
      .code(apiError.statusCode)
      .type("application/json")
      .send(body);
  });
}
```

- [ ] **Step 4: Wire it into `createApp`, and silence the address**

In `apps/server/src/app.ts`, replace the `Fastify({ logger: deps.logger ?? true })`
call and register the handler before the routes:

```ts
// apps/server/src/app.ts
/**
 * Request log fields, minus the caller's address.
 *
 * Fastify's default serializer logs `remoteAddress` and `remotePort`.
 * `data-models.md` § Privacy forbids an IP address reaching the database or
 * the application logs "in any form, coarse or otherwise", so the serializer
 * is replaced rather than the line being filtered later.
 */
const LOGGER_OPTIONS = {
  serializers: {
    req: (request: { method: string; url: string; id: string }) => {
      return { id: request.id, method: request.method, url: request.url };
    },
  },
};

export async function createApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify(
    deps.logger === false ? { logger: false } : { logger: LOGGER_OPTIONS },
  );

  registerErrorHandler(app);

  app.decorate("config", deps.config);
  // ... the rest is unchanged
```

- [ ] **Step 5: Add the privacy test**

```ts
// apps/server/test/http/errorHandler.test.ts, appended
import { createApp } from "../../src/app.ts";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { buildTestConfig } from "../helpers/testApp.ts";
import { createFakeB2Client } from "../helpers/fakeB2.ts";

describe("request logging", () => {
  it("never writes the caller's address to a log line", async () => {
    const lines: string[] = [];
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const app = await createApp({
      config: buildTestConfig(),
      database,
      b2: createFakeB2Client(),
      logger: { stream: { write: (line: string) => lines.push(line) } },
    });

    await app.inject({
      method: "GET",
      url: "/api/health",
      remoteAddress: "203.0.113.7",
    });

    expect(lines.join("")).not.toContain("203.0.113.7");
    expect(lines.join("")).not.toContain("remoteAddress");
    await app.close();
    await database.destroy();
  });
});
```

This needs `AppDeps["logger"]` to accept a Pino options object as well as
`false`. Widen it:

```ts
// apps/server/src/app.ts, in AppDeps
  /**
   * `false` in tests to keep request logs out of the output, or Pino options
   * to capture them. Anything passed here is merged over `LOGGER_OPTIONS`, so
   * the address-free serializer cannot be dropped by accident.
   */
  logger?: false | Record<string, unknown>;
```

and build it as
`deps.logger === false ? { logger: false } : { logger: { ...LOGGER_OPTIONS, ...(deps.logger ?? {}) } }`.

- [ ] **Step 6: Run the tests and watch them pass**

Run: `pnpm --filter @memory-shoebox/server exec vitest run test/http/errorHandler.test.ts`
Expected: PASS, five tests.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/http/errorHandler.ts apps/server/src/app.ts apps/server/test/http/errorHandler.test.ts
git commit -m "feat(server): one error envelope, and a log with no address in it

setErrorHandler renders every failure as { error, message, details }, maps Zod
and Fastify validation to 400 invalid_request with fieldErrors, and never puts
an unexpected error's own message on the wire.

Fastify's default request serializer logs remoteAddress, which data-models.md
forbids in any form. It is replaced rather than filtered.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: The request context

**Files:**
- Create: `apps/server/src/http/requestContext.ts`
- Modify: `apps/server/src/app.ts`
- Test: `apps/server/test/http/requestContext.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/server/test/http/requestContext.test.ts
import { describe, expect, it } from "vitest";
import { requireViewer, type Viewer } from "../../src/http/requestContext.ts";
import { createTestApp } from "../helpers/testApp.ts";

const ROSA: Viewer = {
  memberId: "member-rosa",
  sessionId: "session-rosa",
  role: "uploader",
  isAdmin: false,
  visibleRuleIds: ["rule-everyone"],
};

describe("the request context", () => {
  it("attaches null when nothing authenticates the request", async () => {
    const context = await createTestApp();
    context.app.get("/api/who", (request) => {
      return { viewer: request.viewer };
    });
    await context.app.ready();

    const response = await context.app.inject({ method: "GET", url: "/api/who" });

    expect(response.json()).toEqual({ viewer: null });
    await context.close();
  });

  it("attaches whatever the authenticator returned, before any handler runs", async () => {
    const context = await createTestApp({ authenticate: () => Promise.resolve(ROSA) });
    context.app.get("/api/who", (request) => {
      return { viewer: requireViewer(request) };
    });
    await context.app.ready();

    const response = await context.app.inject({ method: "GET", url: "/api/who" });

    expect(response.json().viewer).toEqual(ROSA);
    await context.close();
  });

  it("requireViewer answers 401 not_signed_in when there is no viewer", async () => {
    const context = await createTestApp();
    context.app.get("/api/who", (request) => {
      return { viewer: requireViewer(request) };
    });
    await context.app.ready();

    const response = await context.app.inject({ method: "GET", url: "/api/who" });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: "not_signed_in" });
    await context.close();
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `pnpm --filter @memory-shoebox/server exec vitest run test/http/requestContext.test.ts`
Expected: FAIL, `Failed to resolve import "../../src/http/requestContext.ts"`.

- [ ] **Step 3: Write the module**

```ts
// apps/server/src/http/requestContext.ts
import type { FastifyInstance, FastifyRequest } from "fastify";
import { ApiError } from "./apiError.ts";

/**
 * Who is making this request.
 *
 * Frozen by `apis/conventions.md` § The request context, which also says
 * "assume it exists; do not design it". Every route reads it and no route
 * builds it.
 */
export type Viewer = {
  memberId: string;
  sessionId: string;
  role: "viewer" | "uploader" | "admin";
  isAdmin: boolean;
  /** Cached per (memberId, visibilityGeneration). */
  visibleRuleIds: readonly string[];
};

/**
 * Turns a request into a viewer, or into nothing.
 *
 * **Step 2 ships the seam and not the lookup.** The default returns null, and
 * step 3a replaces it with the session lookup, the throttled slide of
 * `sessions.last_used_at` and the `visibleRuleIds` cache. That split is what
 * lets rate limiting ship complete now: it reads the viewer when there is one
 * and falls back to the per-IP bucket when there is not, and neither branch
 * cares where the viewer came from.
 */
export type Authenticator = (request: FastifyRequest) => Promise<Viewer | null>;

declare module "fastify" {
  interface FastifyRequest {
    /** Null on an anonymous route, and before step 3a on every route. */
    viewer: Viewer | null;
  }
}

/** The authenticator a server with no session lookup yet runs. */
const anonymousAuthenticator: Authenticator = () => Promise.resolve(null);

/**
 * Attaches `request.viewer` before any handler runs.
 *
 * `onRequest` rather than `preHandler`, because it needs no body and because
 * the rate limiter, which does need one, has to be able to read the viewer.
 *
 * @param app The Fastify instance.
 * @param options.authenticate How to resolve a request to a viewer.
 */
export function registerRequestContext(
  app: FastifyInstance,
  options: { authenticate?: Authenticator } = {},
): void {
  const authenticate = options.authenticate ?? anonymousAuthenticator;

  app.decorateRequest("viewer", null);

  app.addHook("onRequest", async (request) => {
    request.viewer = await authenticate(request);
  });
}

/**
 * Returns the viewer, or fails the request with `401 not_signed_in`.
 *
 * The one exception in the whole product is `DELETE /api/auth/session`, which
 * `conventions.md` exempts because signing out is idempotent: a person
 * pressing "sign out" and being told they are not signed in has been failed by
 * the software rather than informed by it. That route must not call this.
 */
export function requireViewer(request: FastifyRequest): Viewer {
  if (request.viewer === null) {
    throw ApiError.notSignedIn();
  }
  return request.viewer;
}
```

- [ ] **Step 4: Wire it into `createApp`**

```ts
// apps/server/src/app.ts, in AppDeps
  /**
   * How a request resolves to a viewer. Step 3a supplies the session lookup;
   * until then every request is anonymous.
   */
  authenticate?: Authenticator;
```

```ts
// apps/server/src/app.ts, after registerErrorHandler(app)
  registerRequestContext(app, { authenticate: deps.authenticate });
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `pnpm --filter @memory-shoebox/server exec vitest run test/http/requestContext.test.ts`
Expected: PASS, three tests.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/http/requestContext.ts apps/server/src/app.ts apps/server/test/http/requestContext.test.ts
git commit -m "feat(server): the request context, as a shape and a seam

conventions.md freezes Viewer and says not to design it, so this ships the
type, the decoration and requireViewer. The authenticator is an injected
dependency defaulting to anonymous; step 3a replaces it with the session
lookup.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Fixed-window counters

**Files:**
- Create: `apps/server/src/http/rateLimit/buckets.ts`
- Test: `apps/server/test/http/rateLimit/buckets.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/server/test/http/rateLimit/buckets.test.ts
import { describe, expect, it } from "vitest";
import { createFixedWindowLimiter } from "../../../src/http/rateLimit/buckets.ts";

const ONE_PER_MINUTE = [{ limit: 1, windowSeconds: 60 }];
const FIVE_PER_HOUR = [{ limit: 5, windowSeconds: 3600 }];

describe("createFixedWindowLimiter", () => {
  it("allows up to the limit and refuses the next one", () => {
    const limiter = createFixedWindowLimiter();
    const nowMs = Date.parse("2026-09-27T10:00:00.000Z");

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(
        limiter.consume({ key: "rosa@example.com", windows: FIVE_PER_HOUR, nowMs })
          .isAllowed,
      ).toBe(true);
    }

    expect(
      limiter.consume({ key: "rosa@example.com", windows: FIVE_PER_HOUR, nowMs })
        .isAllowed,
    ).toBe(false);
  });

  it("reports the seconds left in the window", () => {
    const limiter = createFixedWindowLimiter();
    const nowMs = Date.parse("2026-09-27T10:00:10.000Z");

    limiter.consume({ key: "rosa", windows: ONE_PER_MINUTE, nowMs });
    const refused = limiter.consume({ key: "rosa", windows: ONE_PER_MINUTE, nowMs });

    expect(refused.isAllowed).toBe(false);
    expect(refused.retryAfterSeconds).toBe(50);
  });

  it("starts again in the next window", () => {
    const limiter = createFixedWindowLimiter();
    const nowMs = Date.parse("2026-09-27T10:00:10.000Z");

    limiter.consume({ key: "rosa", windows: ONE_PER_MINUTE, nowMs });
    const next = limiter.consume({
      key: "rosa",
      windows: ONE_PER_MINUTE,
      nowMs: nowMs + 60_000,
    });

    expect(next.isAllowed).toBe(true);
  });

  it("keeps separate counts per key", () => {
    const limiter = createFixedWindowLimiter();
    const nowMs = Date.parse("2026-09-27T10:00:00.000Z");

    limiter.consume({ key: "rosa", windows: ONE_PER_MINUTE, nowMs });

    expect(
      limiter.consume({ key: "ines", windows: ONE_PER_MINUTE, nowMs }).isAllowed,
    ).toBe(true);
  });

  it("refuses when any window is full, and consumes nothing when it refuses", () => {
    const limiter = createFixedWindowLimiter();
    const nowMs = Date.parse("2026-09-27T10:00:00.000Z");
    const windows = [
      { limit: 1, windowSeconds: 60 },
      { limit: 10, windowSeconds: 86_400 },
    ];

    limiter.consume({ key: "invitation-1", windows, nowMs });
    limiter.consume({ key: "invitation-1", windows, nowMs });
    limiter.consume({ key: "invitation-1", windows, nowMs });

    // The minute window refused twice, so the day window has one, not three.
    const nextMinute = limiter.consume({
      key: "invitation-1",
      windows,
      nowMs: nowMs + 60_000,
    });
    expect(nextMinute.isAllowed).toBe(true);
  });

  it("forgets windows that have passed rather than growing without bound", () => {
    const limiter = createFixedWindowLimiter({ pruneEvery: 2 });
    const nowMs = Date.parse("2026-09-27T10:00:00.000Z");

    limiter.consume({ key: "one", windows: ONE_PER_MINUTE, nowMs });
    limiter.consume({ key: "two", windows: ONE_PER_MINUTE, nowMs });
    expect(limiter.size()).toBe(2);

    limiter.consume({ key: "three", windows: ONE_PER_MINUTE, nowMs: nowMs + 600_000 });
    limiter.consume({ key: "four", windows: ONE_PER_MINUTE, nowMs: nowMs + 600_000 });

    expect(limiter.size()).toBe(2);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `pnpm --filter @memory-shoebox/server exec vitest run test/http/rateLimit/buckets.test.ts`
Expected: FAIL, `Failed to resolve import ".../buckets.ts"`.

- [ ] **Step 3: Write the module**

```ts
// apps/server/src/http/rateLimit/buckets.ts

/** One allowance: how many requests, over how long. */
export type RateLimitWindow = {
  limit: number;
  windowSeconds: number;
};

/** What the limiter decided, and what to tell the caller if it refused. */
export type RateLimitOutcome = {
  isAllowed: boolean;
  /** Zero when allowed. Seconds until the fullest window turns over. */
  retryAfterSeconds: number;
};

/** A counter store with no persistence and no knowledge of what it counts. */
export type FixedWindowLimiter = {
  consume: (options: {
    key: string;
    windows: readonly RateLimitWindow[];
    nowMs: number;
  }) => RateLimitOutcome;
  /** Drops every counter. Tests use it; nothing in the server does. */
  reset: () => void;
  /** How many live counters are held. Diagnostics and tests only. */
  size: () => number;
};

/** One counter, and the instant after which it means nothing. */
type Counter = {
  count: number;
  expiresAtMs: number;
};

/** How many calls between sweeps of counters whose window has passed. */
const DEFAULT_PRUNE_EVERY = 1000;

/**
 * Builds an in-memory fixed-window rate limiter.
 *
 * **Fixed windows rather than a token bucket**, because
 * `apis/conventions.md` § Errors requires `details.retryAfterSeconds` and a
 * fixed window has an exact answer for it: the seconds until the window turns
 * over. A leaky bucket's answer is an estimate, and this number is printed to
 * somebody waiting.
 *
 * **In memory rather than in SQLite.** The deployment is one Fly machine
 * (`docs/architecture.md`), and a counter row per request would put write
 * contention on the one part of the system with a single writer. The cost is
 * that a restart forgets every count, which is the right trade for limits
 * whose longest window is an hour.
 *
 * **Nothing here is ever written down.** The per-IP bucket is the only place
 * in the product that touches an address (`data-models.md` § Privacy), and it
 * touches it as a `Map` key that dies with the process.
 *
 * @param options.pruneEvery How many `consume` calls between sweeps.
 */
export function createFixedWindowLimiter(
  options: { pruneEvery?: number } = {},
): FixedWindowLimiter {
  const pruneEvery = options.pruneEvery ?? DEFAULT_PRUNE_EVERY;
  const counters = new Map<string, Counter>();
  let consumeCount = 0;

  const buildCounterKey = (
    key: string,
    window: RateLimitWindow,
    windowStartMs: number,
  ): string => {
    return `${key}|${window.windowSeconds}|${windowStartMs}`;
  };

  const startOfWindowMs = (nowMs: number, windowSeconds: number): number => {
    const windowMs = windowSeconds * 1000;
    return Math.floor(nowMs / windowMs) * windowMs;
  };

  const prune = (nowMs: number): void => {
    for (const [counterKey, counter] of counters) {
      if (counter.expiresAtMs <= nowMs) {
        counters.delete(counterKey);
      }
    }
  };

  return {
    consume: ({ key, windows, nowMs }) => {
      consumeCount += 1;
      if (consumeCount % pruneEvery === 0) {
        prune(nowMs);
      }

      // Two passes, because a refusal must consume nothing. Incrementing as we
      // go would charge the day-long window for an attempt the minute-long one
      // was always going to refuse, and the invitation resend limit would then
      // exhaust its ten a day after ten impatient clicks in one minute.
      let retryAfterSeconds = 0;
      for (const window of windows) {
        const windowStartMs = startOfWindowMs(nowMs, window.windowSeconds);
        const counter = counters.get(buildCounterKey(key, window, windowStartMs));
        if (counter !== undefined && counter.count >= window.limit) {
          const secondsLeft = Math.ceil(
            (windowStartMs + window.windowSeconds * 1000 - nowMs) / 1000,
          );
          retryAfterSeconds = Math.max(retryAfterSeconds, secondsLeft);
        }
      }

      if (retryAfterSeconds > 0) {
        return { isAllowed: false, retryAfterSeconds };
      }

      for (const window of windows) {
        const windowStartMs = startOfWindowMs(nowMs, window.windowSeconds);
        const counterKey = buildCounterKey(key, window, windowStartMs);
        const counter = counters.get(counterKey);
        if (counter === undefined) {
          counters.set(counterKey, {
            count: 1,
            expiresAtMs: windowStartMs + window.windowSeconds * 1000,
          });
        } else {
          counter.count += 1;
        }
      }

      return { isAllowed: true, retryAfterSeconds: 0 };
    },

    reset: () => {
      counters.clear();
    },

    size: () => {
      return counters.size;
    },
  };
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `pnpm --filter @memory-shoebox/server exec vitest run test/http/rateLimit/buckets.test.ts`
Expected: PASS, six tests.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/http/rateLimit/buckets.ts apps/server/test/http/rateLimit/buckets.test.ts
git commit -m "feat(server): in-memory fixed-window rate limit counters

Fixed windows because retryAfterSeconds has to be a number somebody can wait
out, and a fixed window has an exact one. A refusal consumes nothing, so a
minute-long window cannot exhaust a day-long one beside it.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: The rule table, and the one rule that reads the database

**Files:**
- Create: `apps/server/src/http/rateLimit/rules.ts`
- Create: `apps/server/src/http/rateLimit/invitationResend.ts`
- Test: `apps/server/test/http/rateLimit/invitationResend.test.ts`

- [ ] **Step 1: Write the rule table**

No test of its own: it is data, and asserting that 5 equals 5 is the
tautological test `AGENTS.md` says to skip. Task 9 exercises every row through
the plugin.

```ts
// apps/server/src/http/rateLimit/rules.ts
import type { RateLimitWindow } from "./buckets.ts";

/**
 * What a rule counts against.
 *
 * `invitation` is the one that is not a counter at all: `conventions.md` says
 * the middleware reads `invitations.last_sent_at`, which exists for it.
 */
export type RateLimitScope =
  | "address"
  | "ip"
  | "session"
  | "member"
  | "invitation";

/** The rules a route may name. */
export type RateLimitRuleName =
  | "signInCodeRequestPerAddress"
  | "signInCodeRequestPerIp"
  | "sessionCreatePerAddress"
  | "invitationResendPerInvitation"
  | "conversationWritePerMember"
  | "authenticatedDefault";

/** One named rule: what it counts against, and its allowances. */
export type RateLimitRule = {
  scope: RateLimitScope;
  windows: readonly RateLimitWindow[];
};

/**
 * Every row of `apis/conventions.md` § Rate limits, applied by the middleware
 * and never by a handler.
 *
 * A route names the rules that apply to it in its Fastify route config. An
 * authenticated route that names none gets `authenticatedDefault`, which is
 * the table's last row.
 */
export const RATE_LIMIT_RULES = {
  /**
   * **Shared with the resend path**, which is why the key is the address and
   * not the address and the route: a resend that drew on its own bucket would
   * be a way round the cap.
   */
  signInCodeRequestPerAddress: {
    scope: "address",
    windows: [{ limit: 5, windowSeconds: 3600 }],
  },
  /**
   * The one place in the product an IP address is touched, in memory, never
   * stored and never logged (`data-models.md` § Privacy).
   */
  signInCodeRequestPerIp: {
    scope: "ip",
    windows: [{ limit: 20, windowSeconds: 3600 }],
  },
  /** On top of the per-code attempt cap, which `sign_in_codes` holds. */
  sessionCreatePerAddress: {
    scope: "address",
    windows: [{ limit: 10, windowSeconds: 3600 }],
  },
  /** Two windows: an admin's impatient second click, and their tenth. */
  invitationResendPerInvitation: {
    scope: "invitation",
    windows: [
      { limit: 1, windowSeconds: 60 },
      { limit: 10, windowSeconds: 86_400 },
    ],
  },
  conversationWritePerMember: {
    scope: "member",
    windows: [{ limit: 60, windowSeconds: 60 }],
  },
  /** Everything else authenticated. */
  authenticatedDefault: {
    scope: "session",
    windows: [{ limit: 600, windowSeconds: 60 }],
  },
} as const satisfies Record<RateLimitRuleName, RateLimitRule>;
```

- [ ] **Step 2: Write the failing test for the database-backed rule**

```ts
// apps/server/test/http/rateLimit/invitationResend.test.ts
import { describe, expect, it } from "vitest";
import { checkInvitationResendLimit } from "../../../src/http/rateLimit/invitationResend.ts";
import { createDatabase } from "../../../src/db/client.ts";
import { migrateToLatest } from "../../../src/db/migrate.ts";
import {
  NOW,
  insertInvitation,
  insertMember,
  insertOutboundEmail,
  shiftMinutes,
} from "../../helpers/seed.ts";

async function createDatabaseWithInvitation(
  invitationOverrides: Record<string, unknown> = {},
) {
  const database = createDatabase(":memory:");
  await migrateToLatest(database);
  const adminId = await insertMember(database, { role: "admin" });
  const invitedId = await insertMember(database, { status: "invited" });
  const invitationId = await insertInvitation(database, {
    memberId: invitedId,
    invitedByMemberId: adminId,
    ...invitationOverrides,
  });
  return { database, invitationId, invitedId };
}

describe("checkInvitationResendLimit", () => {
  it("refuses a second send inside the minute, and says how long is left", async () => {
    const { database, invitedId } = await createDatabaseWithInvitation({
      last_sent_at: shiftMinutes(NOW, -0.25),
    });

    const outcome = await checkInvitationResendLimit({
      database,
      memberId: invitedId,
      now: NOW,
    });

    expect(outcome.isAllowed).toBe(false);
    expect(outcome.retryAfterSeconds).toBe(45);
    await database.destroy();
  });

  it("allows one a minute later", async () => {
    const { database, invitedId } = await createDatabaseWithInvitation({
      last_sent_at: shiftMinutes(NOW, -2),
    });

    const outcome = await checkInvitationResendLimit({
      database,
      memberId: invitedId,
      now: NOW,
    });

    expect(outcome.isAllowed).toBe(true);
    await database.destroy();
  });

  it("refuses the eleventh in a day", async () => {
    const { database, invitationId, invitedId } =
      await createDatabaseWithInvitation({ last_sent_at: shiftMinutes(NOW, -10) });
    for (let sendCount = 1; sendCount <= 10; sendCount += 1) {
      await insertOutboundEmail(database, {
        kind: "invitation",
        trigger_kind: "invitation",
        trigger_id: invitationId,
        idempotency_key: `invite:${invitationId}:${sendCount}`,
        created_at: shiftMinutes(NOW, -60 * sendCount),
      });
    }

    const outcome = await checkInvitationResendLimit({
      database,
      memberId: invitedId,
      now: NOW,
    });

    expect(outcome.isAllowed).toBe(false);
    expect(outcome.retryAfterSeconds).toBeGreaterThan(0);
    await database.destroy();
  });

  it("allows when the member has no invitation, leaving the 404 to the route", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const memberId = await insertMember(database);

    const outcome = await checkInvitationResendLimit({
      database,
      memberId,
      now: NOW,
    });

    expect(outcome.isAllowed).toBe(true);
    await database.destroy();
  });
});
```

- [ ] **Step 3: Run the test and watch it fail**

Run: `pnpm --filter @memory-shoebox/server exec vitest run test/http/rateLimit/invitationResend.test.ts`
Expected: FAIL, `Failed to resolve import ".../invitationResend.ts"`.

- [ ] **Step 4: Write the module**

```ts
// apps/server/src/http/rateLimit/invitationResend.ts
import type { Kysely } from "kysely";
import type { Database } from "../../db/types.ts";
import type { RateLimitOutcome } from "./buckets.ts";

/** One per minute. */
const MINUTE_WINDOW_SECONDS = 60;
/** Ten per day. */
const DAY_WINDOW_SECONDS = 86_400;
const DAY_LIMIT = 10;

/**
 * Applies `POST /api/members/:memberId/invitation/resend`'s limit.
 *
 * **The one rule in the table that is not an in-memory counter.**
 * `conventions.md` § Rate limits says the middleware reads
 * `invitations.last_sent_at`, which exists for this, and it is the right call:
 * a restart forgetting that an invitation went out a moment ago would let an
 * admin send a second one, and the person receiving two identical invitations
 * has been told something about our uptime rather than about the Shoebox.
 *
 * The daily half counts `outbound_emails` rows rather than a column, because
 * `send_count` is a running total with no times on it, and the rows are the
 * only record of **when** each send happened.
 *
 * A member with no invitation is allowed through: the route's own 404 is the
 * right answer there, and a rate limiter that answered first would turn a
 * missing row into a 429.
 */
export async function checkInvitationResendLimit(options: {
  database: Kysely<Database>;
  memberId: string;
  now: string;
}): Promise<RateLimitOutcome> {
  const nowMs = Date.parse(options.now);

  const invitation = await options.database
    .selectFrom("invitations")
    .select(["id", "last_sent_at"])
    .where("member_id", "=", options.memberId)
    // uuidv7 sorts by creation, so the largest id is the latest invitation.
    .orderBy("id", "desc")
    .limit(1)
    .executeTakeFirst();

  if (invitation === undefined) {
    return { isAllowed: true, retryAfterSeconds: 0 };
  }

  const secondsSinceLastSend = (nowMs - Date.parse(invitation.last_sent_at)) / 1000;
  if (secondsSinceLastSend < MINUTE_WINDOW_SECONDS) {
    return {
      isAllowed: false,
      retryAfterSeconds: Math.ceil(MINUTE_WINDOW_SECONDS - secondsSinceLastSend),
    };
  }

  const dayStart = new Date(nowMs - DAY_WINDOW_SECONDS * 1000).toISOString();
  const sends = await options.database
    .selectFrom("outbound_emails")
    .select(["created_at"])
    .where("trigger_kind", "=", "invitation")
    .where("trigger_id", "=", invitation.id)
    .where("created_at", ">", dayStart)
    .orderBy("created_at", "asc")
    .execute();

  if (sends.length < DAY_LIMIT) {
    return { isAllowed: true, retryAfterSeconds: 0 };
  }

  // The window frees up when the oldest send in it falls out of the day.
  const oldestMs = Date.parse(sends[0].created_at);
  return {
    isAllowed: false,
    retryAfterSeconds: Math.max(
      1,
      Math.ceil((oldestMs + DAY_WINDOW_SECONDS * 1000 - nowMs) / 1000),
    ),
  };
}
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `pnpm --filter @memory-shoebox/server exec vitest run test/http/rateLimit/invitationResend.test.ts`
Expected: PASS, four tests.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/http/rateLimit/rules.ts apps/server/src/http/rateLimit/invitationResend.ts apps/server/test/http/rateLimit/invitationResend.test.ts
git commit -m "feat(server): the rate limit rule table, and the invitation resend check

Every row of conventions.md's table as named rules. The invitation resend is
the only one backed by the database, because a restart must not let a second
identical invitation go out, and because send_count carries no times.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: The rate limit middleware

**Files:**
- Create: `apps/server/src/http/rateLimit/plugin.ts`
- Modify: `apps/server/src/app.ts`
- Test: `apps/server/test/http/rateLimit/plugin.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/server/test/http/rateLimit/plugin.test.ts
import { describe, expect, it } from "vitest";
import type { Viewer } from "../../../src/http/requestContext.ts";
import { createTestApp } from "../../helpers/testApp.ts";

const ROSA: Viewer = {
  memberId: "member-rosa",
  sessionId: "session-rosa",
  role: "uploader",
  isAdmin: false,
  visibleRuleIds: [],
};

describe("the rate limit middleware", () => {
  it("answers 429 with retryAfterSeconds once a bucket is full", async () => {
    const context = await createTestApp();
    context.app.post(
      "/api/sign-in-codes",
      { config: { rateLimit: ["signInCodeRequestPerAddress"] } },
      () => {
        return { ok: true };
      },
    );
    await context.app.ready();

    const send = () => {
      return context.app.inject({
        method: "POST",
        url: "/api/sign-in-codes",
        payload: { email: "Rosa@Example.com " },
      });
    };

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await send()).statusCode).toBe(200);
    }
    const refused = await send();

    expect(refused.statusCode).toBe(429);
    expect(refused.json()).toMatchObject({ error: "rate_limited" });
    expect(refused.json().details.retryAfterSeconds).toBeGreaterThan(0);
    await context.close();
  });

  it("shares one bucket between the request and the resend path", async () => {
    const context = await createTestApp();
    const config = { rateLimit: ["signInCodeRequestPerAddress"] } as const;
    context.app.post("/api/sign-in-codes", { config }, () => ({ ok: true }));
    context.app.post("/api/sign-in-codes/resend", { config }, () => ({ ok: true }));
    await context.app.ready();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await context.app.inject({
        method: "POST",
        url: "/api/sign-in-codes",
        payload: { email: "rosa@example.com" },
      });
    }

    const resend = await context.app.inject({
      method: "POST",
      url: "/api/sign-in-codes/resend",
      payload: { email: "rosa@example.com" },
    });

    expect(resend.statusCode).toBe(429);
    await context.close();
  });

  it("counts different addresses separately", async () => {
    const context = await createTestApp();
    context.app.post(
      "/api/sign-in-codes",
      { config: { rateLimit: ["signInCodeRequestPerAddress"] } },
      () => ({ ok: true }),
    );
    await context.app.ready();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await context.app.inject({
        method: "POST",
        url: "/api/sign-in-codes",
        payload: { email: "rosa@example.com" },
      });
    }

    const other = await context.app.inject({
      method: "POST",
      url: "/api/sign-in-codes",
      payload: { email: "ines@example.com" },
    });

    expect(other.statusCode).toBe(200);
    await context.close();
  });

  it("applies the default rule to an authenticated route that names none", async () => {
    const context = await createTestApp({
      authenticate: () => Promise.resolve(ROSA),
    });
    context.app.get("/api/anything", () => ({ ok: true }));
    await context.app.ready();

    // 600 a minute: this asserts the rule is attached, not that it is slow.
    const first = await context.app.inject({ method: "GET", url: "/api/anything" });

    expect(first.statusCode).toBe(200);
    expect(context.app.rateLimiter.size()).toBeGreaterThan(0);
    await context.close();
  });

  it("leaves an anonymous route with no rule alone", async () => {
    const context = await createTestApp();

    const response = await context.app.inject({ method: "GET", url: "/api/health" });

    expect(response.statusCode).toBe(200);
    expect(context.app.rateLimiter.size()).toBe(0);
    await context.close();
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `pnpm --filter @memory-shoebox/server exec vitest run test/http/rateLimit/plugin.test.ts`
Expected: FAIL, `Property 'rateLimiter' does not exist on type 'FastifyInstance'`.

- [ ] **Step 3: Write the plugin**

```ts
// apps/server/src/http/rateLimit/plugin.ts
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Kysely } from "kysely";
import type { Database } from "../../db/types.ts";
import { ApiError } from "../apiError.ts";
import {
  createFixedWindowLimiter,
  type FixedWindowLimiter,
  type RateLimitOutcome,
} from "./buckets.ts";
import { checkInvitationResendLimit } from "./invitationResend.ts";
import {
  RATE_LIMIT_RULES,
  type RateLimitRuleName,
  type RateLimitScope,
} from "./rules.ts";

declare module "fastify" {
  interface FastifyContextConfig {
    /**
     * The rules that apply to this route. An authenticated route that names
     * none gets `authenticatedDefault`. Rate limiting is applied by the
     * middleware and never by a handler
     * (`apis/conventions.md` § Rate limits).
     */
    rateLimit?: readonly RateLimitRuleName[];
  }

  interface FastifyInstance {
    rateLimiter: FixedWindowLimiter;
  }
}

/** The address a sign-in route is about, normalised the way the row is. */
function _addressFromBody(request: FastifyRequest): string | null {
  const body: unknown = request.body;
  if (typeof body !== "object" || body === null || !("email" in body)) {
    return null;
  }
  const email: unknown = (body as { email: unknown }).email;
  if (typeof email !== "string" || email.trim() === "") {
    return null;
  }
  return email.trim().toLowerCase();
}

/**
 * What a rule counts against for this request, or null when the request
 * carries nothing to count.
 *
 * Null skips the rule rather than refusing: a sign-in body with no address
 * fails validation in the handler with a `400 invalid_request` naming the
 * field, which is a better answer than a `429` about a bucket nobody could
 * have filled.
 */
function _scopeValue(
  scope: RateLimitScope,
  request: FastifyRequest,
): string | null {
  switch (scope) {
    case "address":
      return _addressFromBody(request);
    case "ip":
      return request.ip;
    case "session":
      return request.viewer?.sessionId ?? null;
    case "member":
      return request.viewer?.memberId ?? null;
    case "invitation": {
      const params: unknown = request.params;
      if (typeof params !== "object" || params === null || !("memberId" in params)) {
        return null;
      }
      const memberId: unknown = (params as { memberId: unknown }).memberId;
      return typeof memberId === "string" ? memberId : null;
    }
  }
}

/**
 * Applies every rate limit in `apis/conventions.md` § Rate limits.
 *
 * `preHandler` rather than `onRequest`, because two of the six rules key on
 * the address in the body and the body is not parsed until after `onRequest`.
 * It is still middleware: a handler neither knows about a limit nor can forget
 * one.
 *
 * @param app The Fastify instance.
 * @param options.database Read by the invitation resend rule, and by no other.
 * @param options.clock Overridable so a test can hold time still.
 */
export function registerRateLimit(
  app: FastifyInstance,
  options: {
    database: Kysely<Database>;
    clock?: () => Date;
  },
): void {
  const clock = options.clock ?? (() => new Date());
  const limiter = createFixedWindowLimiter();
  app.decorate("rateLimiter", limiter);

  app.addHook("preHandler", async (request) => {
    const declared = request.routeOptions.config.rateLimit;
    const ruleNames: readonly RateLimitRuleName[] =
      declared ?? (request.viewer === null ? [] : ["authenticatedDefault"]);

    const now = clock();
    for (const ruleName of ruleNames) {
      const rule = RATE_LIMIT_RULES[ruleName];
      const value = _scopeValue(rule.scope, request);
      if (value === null) {
        continue;
      }

      const outcome: RateLimitOutcome =
        rule.scope === "invitation"
          ? await checkInvitationResendLimit({
              database: options.database,
              memberId: value,
              now: now.toISOString(),
            })
          : limiter.consume({
              key: `${ruleName}:${value}`,
              windows: rule.windows,
              nowMs: now.getTime(),
            });

      if (!outcome.isAllowed) {
        throw ApiError.rateLimited(outcome.retryAfterSeconds);
      }
    }
  });
}
```

**Why the key is `${ruleName}:${value}` and not `${value}`.** The two
sign-in rules and the session-create rule all key on an address, and a shared
key would make one address's ten sign-in attempts eat its five code requests.
`signInCodeRequestPerAddress` is the one rule two **routes** deliberately
share, and they share it by naming the same rule, which is exactly what this
key expresses.

- [ ] **Step 4: Wire it into `createApp`**

```ts
// apps/server/src/app.ts, after registerRequestContext(...)
  registerRateLimit(app, { database: deps.database, clock: deps.clock });
```

```ts
// apps/server/src/app.ts, in AppDeps
  /** Overridable so a test can hold time still. Defaults to the real clock. */
  clock?: () => Date;
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `pnpm --filter @memory-shoebox/server exec vitest run test/http/`
Expected: PASS, every file in `test/http/`.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/http/rateLimit/plugin.ts apps/server/src/app.ts apps/server/test/http/rateLimit/plugin.test.ts
git commit -m "feat(server): apply rate limits in the middleware

A route names its rules in its Fastify route config; an authenticated route
that names none gets 600 a minute per session. preHandler rather than
onRequest, because two rules key on the address in the body.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: The local day, and reading instance settings

Two small modules the jobs and the mail queue both need. One commit.

**Files:**
- Create: `apps/server/src/time/localDay.ts`
- Create: `apps/server/src/settings/instanceSettings.ts`
- Test: `apps/server/test/time/localDay.test.ts`
- Test: `apps/server/test/settings/instanceSettings.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// apps/server/test/time/localDay.test.ts
import { describe, expect, it } from "vitest";
import { countLocalDaysBetween, toLocalDay } from "../../src/time/localDay.ts";

describe("toLocalDay", () => {
  it("resolves an instant to the calendar day it fell on in that zone", () => {
    expect(toLocalDay("2026-09-27T23:30:00.000Z", "UTC")).toBe("2026-09-27");
    expect(toLocalDay("2026-09-27T23:30:00.000Z", "Europe/Madrid")).toBe(
      "2026-09-28",
    );
    expect(toLocalDay("2026-09-27T02:30:00.000Z", "America/Los_Angeles")).toBe(
      "2026-09-26",
    );
  });
});

describe("countLocalDaysBetween", () => {
  it("counts whole calendar days, not elapsed hours", () => {
    expect(
      countLocalDaysBetween({
        from: "2026-09-27T23:00:00.000Z",
        to: "2026-09-28T01:00:00.000Z",
        timezone: "UTC",
      }),
    ).toBe(1);
  });

  it("is zero inside one day however many hours have passed", () => {
    expect(
      countLocalDaysBetween({
        from: "2026-09-27T00:01:00.000Z",
        to: "2026-09-27T23:59:00.000Z",
        timezone: "UTC",
      }),
    ).toBe(0);
  });

  it("counts a week as seven", () => {
    expect(
      countLocalDaysBetween({
        from: "2026-09-14T09:00:00.000Z",
        to: "2026-09-21T09:00:00.000Z",
        timezone: "Europe/Madrid",
      }),
    ).toBe(7);
  });
});
```

```ts
// apps/server/test/settings/instanceSettings.test.ts
import { describe, expect, it } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { readInstanceSettings } from "../../src/settings/instanceSettings.ts";
import { insertInstanceSetting } from "../helpers/seed.ts";

async function createEmptyDatabase() {
  const database = createDatabase(":memory:");
  await migrateToLatest(database);
  return database;
}

describe("readInstanceSettings", () => {
  it("answers from SETTING_DEFINITIONS when the instance holds no rows", async () => {
    const database = await createEmptyDatabase();

    const settings = await readInstanceSettings(database, [
      "shoebox.name",
      "shoebox.timezone",
      "public.base_url",
    ]);

    expect(settings).toEqual({
      "shoebox.name": "My Shoebox",
      "shoebox.timezone": "UTC",
      "public.base_url": null,
    });
    await database.destroy();
  });

  it("prefers a stored override", async () => {
    const database = await createEmptyDatabase();
    await insertInstanceSetting(database, {
      key: "shoebox.name",
      value: "Casa Mateo",
    });

    const settings = await readInstanceSettings(database, ["shoebox.name"]);

    expect(settings["shoebox.name"]).toBe("Casa Mateo");
    await database.destroy();
  });

  it("falls back to the default rather than throwing on a corrupt row", async () => {
    const database = await createEmptyDatabase();
    await insertInstanceSetting(database, {
      key: "shoebox.timezone",
      value: "Mars/Olympus_Mons",
    });

    const settings = await readInstanceSettings(database, ["shoebox.timezone"]);

    expect(settings["shoebox.timezone"]).toBe("UTC");
    await database.destroy();
  });

  it("reads every requested key in one query", async () => {
    const database = await createEmptyDatabase();

    const settings = await readInstanceSettings(database, [
      "shoebox.name",
      "mail.from_address",
      "mail.from_name",
    ]);

    expect(Object.keys(settings)).toHaveLength(3);
    await database.destroy();
  });
});
```

- [ ] **Step 2: Run both and watch them fail**

Run: `pnpm --filter @memory-shoebox/server exec vitest run test/time test/settings`
Expected: FAIL, both imports unresolved.

- [ ] **Step 3: Write `localDay.ts`**

```ts
// apps/server/src/time/localDay.ts

/**
 * Formatters are expensive to build and there are at most a handful of zones
 * in play, so they are built once and kept.
 */
const formatters = new Map<string, Intl.DateTimeFormat>();

function _formatterFor(timezone: string): Intl.DateTimeFormat {
  const existing = formatters.get(timezone);
  if (existing !== undefined) {
    return existing;
  }
  // `en-CA` formats a date as `YYYY-MM-DD`, which is the form the schema and
  // the contract both use for a calendar date.
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  formatters.set(timezone, formatter);
  return formatter;
}

/**
 * The calendar day an instant fell on, in one IANA zone, as `YYYY-MM-DD`.
 *
 * SQLite has no zone database, so every day boundary in the product resolves
 * here instead: the day a photograph lands on, the activity log's day, and the
 * removal reminder's week (`data-models.md` § `settings`, Decision 10).
 *
 * @param instant An ISO-8601 instant.
 * @param timezone An IANA zone, from `shoebox.timezone`.
 */
export function toLocalDay(instant: string, timezone: string): string {
  return _formatterFor(timezone).format(new Date(instant));
}

/**
 * Whole calendar days from one instant to another, in one zone.
 *
 * Calendar days rather than elapsed hours, which is the difference that makes
 * `removal-reminder`'s week boundary land at local midnight rather than at
 * whatever time of day somebody happened to ask. Negative when `to` is before
 * `from`.
 */
export function countLocalDaysBetween(options: {
  from: string;
  to: string;
  timezone: string;
}): number {
  const fromDay = Date.parse(`${toLocalDay(options.from, options.timezone)}T00:00:00Z`);
  const toDay = Date.parse(`${toLocalDay(options.to, options.timezone)}T00:00:00Z`);
  return Math.round((toDay - fromDay) / 86_400_000);
}
```

- [ ] **Step 4: Write `instanceSettings.ts`**

```ts
// apps/server/src/settings/instanceSettings.ts
import type { Kysely } from "kysely";
import {
  resolveSetting,
  type SettingKey,
  type SettingValue,
} from "@memory-shoebox/shared";
import type { Database } from "../db/types.ts";

/** The requested keys, each resolved to its stored value or its default. */
export type ResolvedSettings<Key extends SettingKey> = {
  [K in Key]: SettingValue<K>;
};

/**
 * Reads instance-scoped settings, resolving each through
 * `SETTING_DEFINITIONS`.
 *
 * **A fresh Shoebox holds zero `settings` rows and every key still answers**
 * (`data-models.md` § `settings`): a row is an override somebody wrote, never
 * a seed. `resolveSetting` also swallows a corrupt row and returns the
 * default, so a bad value leaves a degraded instance rather than a dead one.
 *
 * One query for every key, because the mail enqueue reads three of them on a
 * path that is already inside somebody else's transaction.
 *
 * @param database A Kysely handle or a transaction.
 * @param keys The keys to read.
 */
export async function readInstanceSettings<const Key extends SettingKey>(
  database: Kysely<Database>,
  keys: readonly Key[],
): Promise<ResolvedSettings<Key>> {
  const rows = await database
    .selectFrom("settings")
    .select(["key", "value"])
    .where("scope", "=", "instance")
    .where("key", "in", keys as readonly string[])
    .execute();

  const stored = new Map(rows.map((row) => [row.key, row.value]));
  const resolved = {} as ResolvedSettings<Key>;
  for (const key of keys) {
    resolved[key] = resolveSetting(key, stored.get(key));
  }
  return resolved;
}
```

- [ ] **Step 5: Run both and watch them pass**

Run: `pnpm --filter @memory-shoebox/server exec vitest run test/time test/settings`
Expected: PASS, seven tests.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/time apps/server/src/settings apps/server/test/time apps/server/test/settings
git commit -m "feat(server): local calendar days, and reading instance settings

SQLite has no zone database, so every day boundary in the product resolves
through toLocalDay. readInstanceSettings answers from SETTING_DEFINITIONS when
a fresh Shoebox holds no rows, which is the normal case on day one.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: The job runner

**Files:**
- Create: `apps/server/src/jobs/runner.ts`
- Test: `apps/server/test/jobs/runner.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/server/test/jobs/runner.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createJobRunner, type Job } from "../../src/jobs/runner.ts";

const silentLogger = {
  info: () => undefined,
  error: () => undefined,
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createJobRunner", () => {
  it("runs a job on its cadence and not before", async () => {
    let runCount = 0;
    const job: Job = {
      name: "counter",
      intervalMs: 60_000,
      run: () => {
        runCount += 1;
        return Promise.resolve();
      },
    };
    const runner = createJobRunner({ jobs: [job], logger: silentLogger });

    runner.start();
    expect(runCount).toBe(0);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(runCount).toBe(1);

    await vi.advanceTimersByTimeAsync(120_000);
    expect(runCount).toBe(3);

    await runner.stop();
  });

  it("never runs a job while its previous run is still going", async () => {
    let started = 0;
    let release: (() => void) | undefined;
    const job: Job = {
      name: "slow",
      intervalMs: 1000,
      run: () => {
        started += 1;
        return new Promise<void>((resolve) => {
          release = resolve;
        });
      },
    };
    const runner = createJobRunner({ jobs: [job], logger: silentLogger });

    runner.start();
    await vi.advanceTimersByTimeAsync(5000);

    expect(started).toBe(1);
    release?.();
    await runner.stop();
  });

  it("logs a failure and keeps the schedule", async () => {
    const errors: unknown[] = [];
    let runCount = 0;
    const job: Job = {
      name: "flaky",
      intervalMs: 1000,
      run: () => {
        runCount += 1;
        return runCount === 1
          ? Promise.reject(new Error("no"))
          : Promise.resolve();
      },
    };
    const runner = createJobRunner({
      jobs: [job],
      logger: { info: () => undefined, error: (details) => errors.push(details) },
    });

    runner.start();
    await vi.advanceTimersByTimeAsync(2000);

    expect(errors).toHaveLength(1);
    expect(runCount).toBe(2);
    await runner.stop();
  });

  it("stops the schedule and waits for what is in flight", async () => {
    let finished = false;
    let release: (() => void) | undefined;
    const job: Job = {
      name: "slow",
      intervalMs: 1000,
      run: () => {
        return new Promise<void>((resolve) => {
          release = () => {
            finished = true;
            resolve();
          };
        });
      },
    };
    const runner = createJobRunner({ jobs: [job], logger: silentLogger });

    runner.start();
    await vi.advanceTimersByTimeAsync(1000);
    const stopped = runner.stop();
    release?.();
    await stopped;

    expect(finished).toBe(true);
    await vi.advanceTimersByTimeAsync(10_000);
  });

  it("runs one job by name, for a test or an operator", async () => {
    let runCount = 0;
    const runner = createJobRunner({
      jobs: [
        {
          name: "counter",
          intervalMs: 60_000,
          run: () => {
            runCount += 1;
            return Promise.resolve();
          },
        },
      ],
      logger: silentLogger,
    });

    await runner.runOnce("counter");

    expect(runCount).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `pnpm --filter @memory-shoebox/server exec vitest run test/jobs/runner.test.ts`
Expected: FAIL, `Failed to resolve import "../../src/jobs/runner.ts"`.

- [ ] **Step 3: Write the runner**

```ts
// apps/server/src/jobs/runner.ts

/** One scheduled piece of background work. */
export type Job = {
  /** The name `conventions.md` § The job runner gives it, kebab-case. */
  name: string;
  intervalMs: number;
  run: () => Promise<void>;
};

/** Just enough of a logger for the runner. Fastify's satisfies it. */
export type JobLogger = {
  info: (details: Record<string, unknown>, message: string) => void;
  error: (details: Record<string, unknown>, message: string) => void;
};

/** The scheduler. One per process, owned by `createApp`. */
export type JobRunner = {
  start: () => void;
  /** Clears the schedule and waits for anything still running. */
  stop: () => Promise<void>;
  /** Runs one job now, by name. Tests and a future operator command. */
  runOnce: (name: string) => Promise<void>;
};

/**
 * Builds the background job runner.
 *
 * A plain interval in the Fastify process is enough for a single-machine Fly
 * deployment (`data-models.md` § There is no job runner yet), and what that
 * section actually asks for is the part that is easy to skip: it "has to exist
 * and shut down cleanly on `SIGTERM` alongside the database".
 *
 * Three properties the jobs themselves rely on:
 *
 * - **No overlap.** A run that is still going when the next tick arrives skips
 *   that tick. SQLite has one writer, and a slow sweep queueing behind itself
 *   is how a hung job becomes a hung database.
 * - **A failure is logged and the schedule survives.** A job that threw on one
 *   tick runs again on the next. Every job here is idempotent, so retrying is
 *   free.
 * - **Nothing runs at `start()`.** The first run of each job is one interval
 *   later, which keeps boot fast and makes a test that advances a clock by a
 *   known amount say exactly what it means.
 */
export function createJobRunner(options: {
  jobs: readonly Job[];
  logger: JobLogger;
}): JobRunner {
  const timers = new Map<string, NodeJS.Timeout>();
  const inFlight = new Map<string, Promise<void>>();

  const runJob = async (job: Job): Promise<void> => {
    if (inFlight.has(job.name)) {
      return;
    }
    const started = Date.now();
    const promise = job
      .run()
      .then(() => {
        options.logger.info(
          { job: job.name, durationMs: Date.now() - started },
          "job finished",
        );
      })
      .catch((error: unknown) => {
        options.logger.error({ job: job.name, err: error }, "job failed");
      })
      .finally(() => {
        inFlight.delete(job.name);
      });
    inFlight.set(job.name, promise);
    await promise;
  };

  return {
    start: () => {
      for (const job of options.jobs) {
        const timer = setInterval(() => {
          void runJob(job);
        }, job.intervalMs);
        // Unref so an interval never holds the process open on its own: the
        // HTTP server decides how long the process lives, not the sweeps.
        timer.unref();
        timers.set(job.name, timer);
      }
    },

    stop: async () => {
      for (const timer of timers.values()) {
        clearInterval(timer);
      }
      timers.clear();
      await Promise.allSettled([...inFlight.values()]);
    },

    runOnce: async (name) => {
      const job = options.jobs.find((candidate) => candidate.name === name);
      if (job === undefined) {
        throw new Error(`No job named ${name}`);
      }
      await runJob(job);
    },
  };
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `pnpm --filter @memory-shoebox/server exec vitest run test/jobs/runner.test.ts`
Expected: PASS, five tests.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/jobs/runner.ts apps/server/test/jobs/runner.test.ts
git commit -m "feat(server): the background job runner

Intervals, an overlap guard so a slow sweep cannot queue behind itself on
SQLite's single writer, a failure that is logged rather than fatal, and a stop
that waits for what is in flight.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: The four housekeeping sweeps

`session-sweep`, `sign-in-code-sweep`, `invitation-lapse` and
`visibility-rule-sweep`. Every table they touch exists, so all four are
complete here.

**Files:**
- Create: `apps/server/src/visibility/everyoneRule.ts`
- Modify: `apps/server/src/db/migrations/0002_visibility.ts`
- Modify: `apps/server/test/schema.test.ts`
- Create: `apps/server/src/jobs/sessionSweep.ts`
- Create: `apps/server/src/jobs/signInCodeSweep.ts`
- Create: `apps/server/src/jobs/invitationLapse.ts`
- Create: `apps/server/src/jobs/visibilityRuleSweep.ts`
- Test: `apps/server/test/jobs/sweeps.test.ts`

- [ ] **Step 1: Move `EVERYONE_VISIBILITY_RULE_ID` out of the migration**

`docs/server.md` names this as debt and says who should pay it: "whichever
later step first needs the constant at runtime should move it into a
non-migration module and have the migration import it from there". That step is
this one, because `visibility-rule-sweep` must never delete the seeded rule.

The migration's emitted SQL does not change, so this is not an edit to a
shipped migration's behaviour.

```ts
// apps/server/src/visibility/everyoneRule.ts

/**
 * The id of the `everyone` visibility rule, seeded by migration 0002.
 *
 * A constant rather than a lookup, because it is referenced before anything
 * else exists: it is the default for an upload whose uploader made no
 * visibility decision, and it is the one rule `visibility-rule-sweep` must
 * never delete however many items reference it, which on a fresh Shoebox is
 * none.
 *
 * It lives here rather than in the migration that seeds it, so that runtime
 * code never has to reach into a historical migration for a value
 * (`docs/server.md` § Migrations).
 */
export const EVERYONE_VISIBILITY_RULE_ID = "visibility-rule-everyone";
```

```ts
// apps/server/src/db/migrations/0002_visibility.ts
// Replace the `export const EVERYONE_VISIBILITY_RULE_ID = ...` line with:
import { EVERYONE_VISIBILITY_RULE_ID } from "../../visibility/everyoneRule.ts";
```

Update the one importer:

```ts
// apps/server/test/schema.test.ts
// was: import { EVERYONE_VISIBILITY_RULE_ID } from "../src/db/migrations/0002_visibility.ts";
import { EVERYONE_VISIBILITY_RULE_ID } from "../src/visibility/everyoneRule.ts";
```

Run: `pnpm --filter @memory-shoebox/server exec vitest run test/schema.test.ts`
Expected: PASS, unchanged. If anything fails here, stop: the seed value moved
when it should not have.

- [ ] **Step 2: Write the failing tests for all four sweeps**

```ts
// apps/server/test/jobs/sweeps.test.ts
import { describe, expect, it } from "vitest";
import type { Kysely } from "kysely";
import { createDatabase } from "../../src/db/client.ts";
import { createId } from "../../src/db/ids.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import type { Database } from "../../src/db/types.ts";
import { runInvitationLapse } from "../../src/jobs/invitationLapse.ts";
import { runSessionSweep } from "../../src/jobs/sessionSweep.ts";
import { runSignInCodeSweep } from "../../src/jobs/signInCodeSweep.ts";
import { runVisibilityRuleSweep } from "../../src/jobs/visibilityRuleSweep.ts";
import { EVERYONE_VISIBILITY_RULE_ID } from "../../src/visibility/everyoneRule.ts";
import {
  NOW,
  insertInvitation,
  insertMember,
  insertSession,
  shiftDays,
  shiftMinutes,
} from "../helpers/seed.ts";

async function createEmptyDatabase(): Promise<Kysely<Database>> {
  const database = createDatabase(":memory:");
  await migrateToLatest(database);
  return database;
}

describe("session-sweep", () => {
  it("does nothing against an empty table", async () => {
    const database = await createEmptyDatabase();

    const summary = await runSessionSweep({ database, now: NOW });

    expect(summary.deletedCount).toBe(0);
    await database.destroy();
  });

  it("deletes expired sessions and leaves live ones", async () => {
    const database = await createEmptyDatabase();
    const memberId = await insertMember(database);
    await insertSession(database, {
      memberId,
      expires_at: shiftDays(NOW, -1),
    });
    await insertSession(database, { memberId, expires_at: shiftDays(NOW, 10) });

    const first = await runSessionSweep({ database, now: NOW });
    const second = await runSessionSweep({ database, now: NOW });

    expect(first.deletedCount).toBe(1);
    expect(second.deletedCount).toBe(0);
    expect(
      await database.selectFrom("sessions").select("id").execute(),
    ).toHaveLength(1);
    await database.destroy();
  });
});

describe("sign-in-code-sweep", () => {
  it("does nothing against an empty table", async () => {
    const database = await createEmptyDatabase();

    expect((await runSignInCodeSweep({ database, now: NOW })).deletedCount).toBe(0);
    await database.destroy();
  });

  it("deletes expired and consumed codes, twice over without change", async () => {
    const database = await createEmptyDatabase();
    const insertCode = async (overrides: Partial<Database["sign_in_codes"]>) => {
      await database
        .insertInto("sign_in_codes")
        .values({
          id: createId(),
          email: "rosa@example.com",
          member_id: null,
          code_hash: "hmac",
          attempts: 0,
          max_attempts: 3,
          expires_at: shiftMinutes(NOW, 10),
          consumed_at: null,
          invalidated_at: null,
          created_at: NOW,
          ...overrides,
        })
        .execute();
    };
    await insertCode({ expires_at: shiftMinutes(NOW, -1) });
    await insertCode({ consumed_at: NOW });
    await insertCode({});

    const first = await runSignInCodeSweep({ database, now: NOW });
    const second = await runSignInCodeSweep({ database, now: NOW });

    expect(first.deletedCount).toBe(2);
    expect(second.deletedCount).toBe(0);
    await database.destroy();
  });
});

describe("invitation-lapse", () => {
  it("does nothing against an empty table", async () => {
    const database = await createEmptyDatabase();

    expect((await runInvitationLapse({ database, now: NOW })).lapsedCount).toBe(0);
    await database.destroy();
  });

  it("removes an invited member whose latest invitation has expired", async () => {
    const database = await createEmptyDatabase();
    const adminId = await insertMember(database, { role: "admin" });
    const invitedId = await insertMember(database, { status: "invited" });
    await insertInvitation(database, {
      memberId: invitedId,
      invitedByMemberId: adminId,
      expires_at: shiftDays(NOW, -1),
    });

    const first = await runInvitationLapse({ database, now: NOW });
    const second = await runInvitationLapse({ database, now: NOW });

    expect(first.lapsedCount).toBe(1);
    expect(second.lapsedCount).toBe(0);
    const member = await database
      .selectFrom("members")
      .select(["status", "removed_at"])
      .where("id", "=", invitedId)
      .executeTakeFirstOrThrow();
    expect(member.status).toBe("removed");
    expect(member.removed_at).toBe(NOW);
    await database.destroy();
  });

  it("leaves a member whose latest invitation is a live resend", async () => {
    const database = await createEmptyDatabase();
    const adminId = await insertMember(database, { role: "admin" });
    const invitedId = await insertMember(database, { status: "invited" });
    await insertInvitation(database, {
      memberId: invitedId,
      invitedByMemberId: adminId,
      expires_at: shiftDays(NOW, -1),
    });
    await insertInvitation(database, {
      memberId: invitedId,
      invitedByMemberId: adminId,
      expires_at: shiftDays(NOW, 7),
    });

    await runInvitationLapse({ database, now: NOW });

    const member = await database
      .selectFrom("members")
      .select("status")
      .where("id", "=", invitedId)
      .executeTakeFirstOrThrow();
    expect(member.status).toBe("invited");
    await database.destroy();
  });

  it("leaves a member whose expired invitation was revoked", async () => {
    const database = await createEmptyDatabase();
    const adminId = await insertMember(database, { role: "admin" });
    const invitedId = await insertMember(database, { status: "invited" });
    await insertInvitation(database, {
      memberId: invitedId,
      invitedByMemberId: adminId,
      expires_at: shiftDays(NOW, -1),
      revoked_at: shiftDays(NOW, -2),
    });

    await runInvitationLapse({ database, now: NOW });

    const member = await database
      .selectFrom("members")
      .select("status")
      .where("id", "=", invitedId)
      .executeTakeFirstOrThrow();
    expect(member.status).toBe("invited");
    await database.destroy();
  });
});

describe("visibility-rule-sweep", () => {
  it("does nothing against a fresh database, and never touches the everyone rule", async () => {
    const database = await createEmptyDatabase();

    const first = await runVisibilityRuleSweep({ database });
    const second = await runVisibilityRuleSweep({ database });

    expect(first.deletedCount).toBe(0);
    expect(second.deletedCount).toBe(0);
    expect(
      await database
        .selectFrom("visibility_rules")
        .select("id")
        .where("id", "=", EVERYONE_VISIBILITY_RULE_ID)
        .executeTakeFirst(),
    ).toBeDefined();
    await database.destroy();
  });

  it("deletes a rule nothing references, and its subjects with it", async () => {
    const database = await createEmptyDatabase();
    const memberId = await insertMember(database);
    const ruleId = createId();
    await database
      .insertInto("visibility_rules")
      .values({
        id: ruleId,
        mode: "only",
        subject_digest: "member:one",
        created_at: NOW,
      })
      .execute();
    await database
      .insertInto("visibility_rule_subjects")
      .values({
        id: createId(),
        rule_id: ruleId,
        subject_type: "member",
        member_id: memberId,
        group_id: null,
      })
      .execute();

    const summary = await runVisibilityRuleSweep({ database });

    expect(summary.deletedCount).toBe(1);
    expect(
      await database.selectFrom("visibility_rule_subjects").select("id").execute(),
    ).toHaveLength(0);
    await database.destroy();
  });
});
```

- [ ] **Step 3: Run them and watch them fail**

Run: `pnpm --filter @memory-shoebox/server exec vitest run test/jobs/sweeps.test.ts`
Expected: FAIL, four unresolved imports.

- [ ] **Step 4: Write the four jobs**

```ts
// apps/server/src/jobs/sessionSweep.ts
import type { Kysely } from "kysely";
import type { Database } from "../db/types.ts";

/** What one run removed. */
export type SessionSweepSummary = {
  deletedCount: number;
};

/**
 * Deletes `sessions` rows past `expires_at`.
 *
 * **Housekeeping, not security** (`conventions.md` § The job runner). The
 * session is looked up in the database on every request, so an expired row is
 * already dead and this only stops the table growing. Nothing may come to
 * depend on the sweep having run.
 */
export async function runSessionSweep(options: {
  database: Kysely<Database>;
  now: string;
}): Promise<SessionSweepSummary> {
  const result = await options.database
    .deleteFrom("sessions")
    .where("expires_at", "<=", options.now)
    .executeTakeFirst();

  return { deletedCount: Number(result.numDeletedRows) };
}
```

```ts
// apps/server/src/jobs/signInCodeSweep.ts
import type { Kysely } from "kysely";
import type { Database } from "../db/types.ts";

/** What one run removed. */
export type SignInCodeSweepSummary = {
  deletedCount: number;
};

/**
 * Deletes expired and consumed `sign_in_codes` rows.
 *
 * The codes are stored as an HMAC rather than in the clear, so this is not
 * what protects them: it is what stops a table of dead hashes growing forever
 * beside the addresses they were sent to.
 */
export async function runSignInCodeSweep(options: {
  database: Kysely<Database>;
  now: string;
}): Promise<SignInCodeSweepSummary> {
  const result = await options.database
    .deleteFrom("sign_in_codes")
    .where((eb) => {
      return eb.or([
        eb("expires_at", "<=", options.now),
        eb("consumed_at", "is not", null),
      ]);
    })
    .executeTakeFirst();

  return { deletedCount: Number(result.numDeletedRows) };
}
```

```ts
// apps/server/src/jobs/invitationLapse.ts
import { sql, type Kysely, type SqlBool } from "kysely";
import type { Database } from "../db/types.ts";

/** What one run changed. */
export type InvitationLapseSummary = {
  lapsedCount: number;
};

/**
 * Removes any `invited` member whose latest invitation has expired unrevoked.
 *
 * **Without this a lapsed invitation stays signable forever**
 * (`conventions.md` § The job runner), because no token ever gated it:
 * `members.status` alone decides whether an address may sign in
 * (`data-models.md` § `invitations`, Decision 2). The expiry is therefore not
 * enforced by the invitation at all, it is enforced here.
 *
 * "Latest" is the largest id, because ids are uuidv7 and sort by creation. A
 * resend writes a new row, so an admin who sent it again yesterday keeps the
 * member invited even though the first invitation has expired.
 */
export async function runInvitationLapse(options: {
  database: Kysely<Database>;
  now: string;
}): Promise<InvitationLapseSummary> {
  const result = await options.database
    .updateTable("members")
    .set({ status: "removed", removed_at: options.now })
    .where("status", "=", "invited")
    .where(
      sql<SqlBool>`EXISTS (
        SELECT 1
        FROM invitations AS latest
        WHERE latest.member_id = members.id
          AND latest.id = (
            SELECT max(any_invitation.id)
            FROM invitations AS any_invitation
            WHERE any_invitation.member_id = members.id
          )
          AND latest.revoked_at IS NULL
          AND latest.accepted_at IS NULL
          AND latest.expires_at <= ${options.now}
      )`,
    )
    .executeTakeFirst();

  return { lapsedCount: Number(result.numUpdatedRows) };
}
```

```ts
// apps/server/src/jobs/visibilityRuleSweep.ts
import { sql, type Kysely, type SqlBool } from "kysely";
import type { Database } from "../db/types.ts";
import { EVERYONE_VISIBILITY_RULE_ID } from "../visibility/everyoneRule.ts";

/** What one run removed. */
export type VisibilityRuleSweepSummary = {
  deletedCount: number;
};

/**
 * Deletes `visibility_rules` rows nothing references.
 *
 * `POST /api/visibility-rules/resolve` mints a rule for an upload that may
 * then be abandoned, so orphans accumulate and nothing else clears them
 * (`conventions.md` § The job runner). `visibility_rule_subjects` cascades, so
 * deleting the rule takes its subjects with it.
 *
 * Two exclusions, and both are load-bearing. `items.visibility_rule_id` and
 * `upload_sessions.visibility_rule_id` are both `ON DELETE RESTRICT`, so a
 * sweep that ignored either would not quietly corrupt anything: it would throw,
 * every five minutes, forever. And the seeded `everyone` rule is never deleted
 * even when no item references it, because a fresh Shoebox references it with
 * nothing and the first upload expects it to be there.
 */
export async function runVisibilityRuleSweep(options: {
  database: Kysely<Database>;
}): Promise<VisibilityRuleSweepSummary> {
  const result = await options.database
    .deleteFrom("visibility_rules")
    .where("id", "!=", EVERYONE_VISIBILITY_RULE_ID)
    .where(
      sql<SqlBool>`NOT EXISTS (
        SELECT 1 FROM items
        WHERE items.visibility_rule_id = visibility_rules.id
      )`,
    )
    .where(
      sql<SqlBool>`NOT EXISTS (
        SELECT 1 FROM upload_sessions
        WHERE upload_sessions.visibility_rule_id = visibility_rules.id
      )`,
    )
    .executeTakeFirst();

  return { deletedCount: Number(result.numDeletedRows) };
}
```

- [ ] **Step 5: Run them and watch them pass**

Run: `pnpm --filter @memory-shoebox/server exec vitest run test/jobs/sweeps.test.ts test/schema.test.ts`
Expected: PASS, nine sweep tests plus the schema oracle.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/visibility apps/server/src/jobs apps/server/src/db/migrations/0002_visibility.ts apps/server/test/jobs/sweeps.test.ts apps/server/test/schema.test.ts
git commit -m "feat(server): the four housekeeping sweeps

session-sweep, sign-in-code-sweep, invitation-lapse and
visibility-rule-sweep, each tested against an empty table and each run twice
to prove the second run changes nothing.

invitation-lapse is the one that is not housekeeping: members.status alone
decides who may sign in, so a lapsed invitation is enforced here or nowhere.

EVERYONE_VISIBILITY_RULE_ID moves out of migration 0002 into
src/visibility/everyoneRule.ts, which is the debt docs/server.md names and
assigns to whichever step first needs it at runtime. This is that step: the
sweep must never delete the seeded rule.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: `object-deletion-drain`

The one job that talks to a third party.

**Files:**
- Create: `apps/server/src/jobs/objectDeletionDrain.ts`
- Test: `apps/server/test/jobs/objectDeletionDrain.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/server/test/jobs/objectDeletionDrain.test.ts
import { describe, expect, it } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { runObjectDeletionDrain } from "../../src/jobs/objectDeletionDrain.ts";
import { createFakeB2Client } from "../helpers/fakeB2.ts";
import { NOW, insertPendingObjectDeletion } from "../helpers/seed.ts";

async function createContext() {
  const database = createDatabase(":memory:");
  await migrateToLatest(database);
  return { database, b2: createFakeB2Client() };
}

describe("object-deletion-drain", () => {
  it("does nothing against an empty table", async () => {
    const { database, b2 } = await createContext();

    const summary = await runObjectDeletionDrain({ database, b2, now: NOW });

    expect(summary).toEqual({ deletedCount: 0, failedCount: 0 });
    expect(b2.deletedKeys).toEqual([]);
    await database.destroy();
  });

  it("deletes the object and then the row, and changes nothing on a second run", async () => {
    const { database, b2 } = await createContext();
    await insertPendingObjectDeletion(database, { storageKey: "media/one.jpg" });

    const first = await runObjectDeletionDrain({ database, b2, now: NOW });
    const second = await runObjectDeletionDrain({ database, b2, now: NOW });

    expect(first).toEqual({ deletedCount: 1, failedCount: 0 });
    expect(second).toEqual({ deletedCount: 0, failedCount: 0 });
    expect(b2.deletedKeys).toEqual(["media/one.jpg"]);
    expect(
      await database.selectFrom("pending_object_deletions").select("id").execute(),
    ).toHaveLength(0);
    await database.destroy();
  });

  it("keeps the row and records the failure when Backblaze refuses", async () => {
    const { database, b2 } = await createContext();
    b2.failingKeys.add("media/stuck.jpg");
    await insertPendingObjectDeletion(database, { storageKey: "media/stuck.jpg" });

    const summary = await runObjectDeletionDrain({ database, b2, now: NOW });

    expect(summary).toEqual({ deletedCount: 0, failedCount: 1 });
    const row = await database
      .selectFrom("pending_object_deletions")
      .select(["attempts", "last_error", "last_attempted_at"])
      .executeTakeFirstOrThrow();
    expect(row.attempts).toBe(1);
    expect(row.last_error).toContain("stuck.jpg");
    expect(row.last_attempted_at).toBe(NOW);
    await database.destroy();
  });

  it("keeps draining after one key fails", async () => {
    const { database, b2 } = await createContext();
    b2.failingKeys.add("media/stuck.jpg");
    await insertPendingObjectDeletion(database, { storageKey: "media/stuck.jpg" });
    await insertPendingObjectDeletion(database, { storageKey: "media/fine.jpg" });

    const summary = await runObjectDeletionDrain({ database, b2, now: NOW });

    expect(summary).toEqual({ deletedCount: 1, failedCount: 1 });
    expect(b2.deletedKeys).toEqual(["media/fine.jpg"]);
    await database.destroy();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @memory-shoebox/server exec vitest run test/jobs/objectDeletionDrain.test.ts`
Expected: FAIL, unresolved import.

- [ ] **Step 3: Write the job**

```ts
// apps/server/src/jobs/objectDeletionDrain.ts
import type { Kysely } from "kysely";
import type { B2Client } from "../b2/client.ts";
import type { Database } from "../db/types.ts";

/** What one run did. */
export type ObjectDeletionDrainSummary = {
  deletedCount: number;
  failedCount: number;
};

/** How many objects one run will try. */
const BATCH_SIZE = 100;

/**
 * Drains `pending_object_deletions` into Backblaze deletes, retrying failures.
 *
 * **There is no transaction spanning SQLite and Backblaze**
 * (`data-models.md` § `pending_object_deletions`). A delete commits the rows
 * first, so the photograph genuinely vanishes from the Shoebox, and enqueues
 * every rendition's key here inside that same transaction. Without this table a
 * Backblaze failure would leave a family paying to store a photograph they were
 * told was destroyed, with no record that it is still there.
 *
 * A failure keeps its row and increments `attempts`, so the next run tries
 * again. There is deliberately no attempt ceiling: an object that will not
 * delete is a bill somebody is paying and a promise that has not been kept, and
 * a row that gave up would be neither visible nor recoverable.
 *
 * The loop is per object because the S3 delete is per object and each one can
 * fail on its own. One slow key must not strand the rest of the batch.
 */
export async function runObjectDeletionDrain(options: {
  database: Kysely<Database>;
  b2: B2Client;
  now: string;
}): Promise<ObjectDeletionDrainSummary> {
  const pending = await options.database
    .selectFrom("pending_object_deletions")
    .select(["id", "storage_key"])
    .orderBy("created_at", "asc")
    .limit(BATCH_SIZE)
    .execute();

  let deletedCount = 0;
  let failedCount = 0;

  for (const row of pending) {
    try {
      await options.b2.deleteObject({ key: row.storage_key });
      await options.database
        .deleteFrom("pending_object_deletions")
        .where("id", "=", row.id)
        .execute();
      deletedCount += 1;
    } catch (error: unknown) {
      failedCount += 1;
      await options.database
        .updateTable("pending_object_deletions")
        .set((eb) => {
          return {
            attempts: eb("attempts", "+", 1),
            last_error:
              error instanceof Error ? error.message : String(error),
            last_attempted_at: options.now,
          };
        })
        .where("id", "=", row.id)
        .execute();
    }
  }

  return { deletedCount, failedCount };
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm --filter @memory-shoebox/server exec vitest run test/jobs/objectDeletionDrain.test.ts`
Expected: PASS, four tests.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/jobs/objectDeletionDrain.ts apps/server/test/jobs/objectDeletionDrain.test.ts
git commit -m "feat(server): object-deletion-drain

The object goes first and the row second, so a failure retries rather than
losing the record. No attempt ceiling: an object that will not delete is a
bill somebody is paying and a promise that has not been kept.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 14: `upload-abandon-sweep`

Two halves, because both mean "this batch is not coming back". The settle
latch is **not** here: `data-models.md` calls it "the single most important
piece of upload plumbing the mockup does not show", and step 6a owns it.

**Files:**
- Modify: `app.config.ts`
- Modify: `apps/server/test/helpers/seed.ts`
- Create: `apps/server/src/jobs/uploadAbandonSweep.ts`
- Test: `apps/server/test/jobs/uploadAbandonSweep.test.ts`

- [ ] **Step 1: Add the grace period to `app.config.ts`**

The draft half has its number already (`appConfig.upload.draftExpiryHours`).
The file half has none anywhere in the specification, and cannot be written
without one.

```ts
// app.config.ts, inside `upload`, after draftExpiryHours

    /**
     * How long a file may sit mid-transfer before it counts as abandoned, in
     * minutes.
     *
     * A committed batch whose browser was closed leaves `waiting` and
     * `sending` rows that nothing will ever finish. They have to become
     * `failed` with `problem_code = 'abandoned'`, or the batch never settles
     * and the nine people who can see the two hundred files that did arrive
     * are never told.
     *
     * Thirty minutes, because the two failure modes are not symmetric and the
     * number is bounded on both sides. Too short marks a live upload dead: a
     * single large video on a slow connection can legitimately sit in
     * `sending` for a long time, and a file marked `failed` under somebody
     * who is still uploading it is a bug they can see. Too long delays the
     * only notification the batch will ever produce. A presigned upload URL
     * lives an hour, so a transfer with no progress for half of that has
     * already lost more than it is going to recover.
     *
     * `upload_files.updated_at` is what this measures against, so a batch
     * where most files finished and four stalled loses only the four.
     */
    abandonGraceMinutes: 30,
```

- [ ] **Step 2: Add the upload row builders**

```ts
// apps/server/test/helpers/seed.ts, appended
import { EVERYONE_VISIBILITY_RULE_ID } from "../../src/visibility/everyoneRule.ts";

/** Inserts one upload session and returns its id. */
export async function insertUploadSession(
  database: Kysely<Database>,
  options: { uploadedBy: string } & Partial<Database["upload_sessions"]>,
): Promise<string> {
  const { uploadedBy, ...overrides } = options;
  const id = overrides.id ?? createId();
  await database
    .insertInto("upload_sessions")
    .values({
      id,
      uploaded_by: uploadedBy,
      state: "uploading",
      visibility_rule_id: EVERYONE_VISIBILITY_RULE_ID,
      file_count: 1,
      total_bytes: 1024,
      client_timezone: "Europe/Madrid",
      created_at: NOW,
      committed_at: NOW,
      last_activity_at: NOW,
      settled_at: null,
      notified_at: null,
      notified_member_count: null,
      ...overrides,
    })
    .execute();
  return id;
}

/** Inserts one upload file and returns its id. */
export async function insertUploadFile(
  database: Kysely<Database>,
  options: { uploadSessionId: string } & Partial<Database["upload_files"]>,
): Promise<string> {
  const { uploadSessionId, ...overrides } = options;
  const id = overrides.id ?? createId();
  await database
    .insertInto("upload_files")
    .values({
      id,
      upload_session_id: uploadSessionId,
      item_id: null,
      position: 0,
      original_filename: "IMG_0001.jpg",
      declared_content_type: "image/jpeg",
      declared_bytes: 1024,
      content_hash: null,
      kind: "photo",
      storage_key: null,
      state: "waiting",
      attempt_count: 0,
      presigned_until: null,
      multipart_upload_id: null,
      problem_code: null,
      problem_detail: null,
      captured_at: null,
      capture_date: null,
      capture_offset_minutes: null,
      capture_source: null,
      original_captured_at: null,
      width: null,
      height: null,
      duration_ms: null,
      created_at: NOW,
      updated_at: NOW,
      ...overrides,
    })
    .execute();
  return id;
}
```

- [ ] **Step 3: Write the failing test**

```ts
// apps/server/test/jobs/uploadAbandonSweep.test.ts
import { describe, expect, it } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { runUploadAbandonSweep } from "../../src/jobs/uploadAbandonSweep.ts";
import {
  NOW,
  insertMember,
  insertUploadFile,
  insertUploadSession,
  shiftMinutes,
} from "../helpers/seed.ts";

async function createContext() {
  const database = createDatabase(":memory:");
  await migrateToLatest(database);
  const memberId = await insertMember(database);
  return { database, memberId };
}

describe("upload-abandon-sweep", () => {
  it("does nothing against empty tables", async () => {
    const { database } = await createContext();

    const summary = await runUploadAbandonSweep({ database, now: NOW });

    expect(summary).toEqual({ abandonedFileCount: 0, cancelledDraftCount: 0 });
    await database.destroy();
  });

  it("marks a stalled file abandoned, and is idempotent", async () => {
    const { database, memberId } = await createContext();
    const sessionId = await insertUploadSession(database, {
      uploadedBy: memberId,
    });
    const stalledId = await insertUploadFile(database, {
      uploadSessionId: sessionId,
      state: "sending",
      updated_at: shiftMinutes(NOW, -45),
    });
    await insertUploadFile(database, {
      uploadSessionId: sessionId,
      position: 1,
      state: "sending",
      updated_at: shiftMinutes(NOW, -5),
    });

    const first = await runUploadAbandonSweep({ database, now: NOW });
    const second = await runUploadAbandonSweep({ database, now: NOW });

    expect(first.abandonedFileCount).toBe(1);
    expect(second.abandonedFileCount).toBe(0);
    const stalled = await database
      .selectFrom("upload_files")
      .select(["state", "problem_code"])
      .where("id", "=", stalledId)
      .executeTakeFirstOrThrow();
    expect(stalled.state).toBe("failed");
    expect(stalled.problem_code).toBe("abandoned");
    await database.destroy();
  });

  it("leaves a file whose batch was never committed to the draft half", async () => {
    const { database, memberId } = await createContext();
    const sessionId = await insertUploadSession(database, {
      uploadedBy: memberId,
      state: "draft",
      committed_at: null,
      last_activity_at: shiftMinutes(NOW, -60),
    });
    const fileId = await insertUploadFile(database, {
      uploadSessionId: sessionId,
      updated_at: shiftMinutes(NOW, -60),
    });

    await runUploadAbandonSweep({ database, now: NOW });

    const file = await database
      .selectFrom("upload_files")
      .select("state")
      .where("id", "=", fileId)
      .executeTakeFirstOrThrow();
    expect(file.state).toBe("waiting");
    await database.destroy();
  });

  it("cancels a draft idle past appConfig.upload.draftExpiryHours, and is idempotent", async () => {
    const { database, memberId } = await createContext();
    const staleId = await insertUploadSession(database, {
      uploadedBy: memberId,
      state: "draft",
      committed_at: null,
      last_activity_at: shiftMinutes(NOW, -8 * 24 * 60),
    });
    await insertUploadSession(database, {
      uploadedBy: memberId,
      state: "draft",
      committed_at: null,
      last_activity_at: shiftMinutes(NOW, -60),
    });

    const first = await runUploadAbandonSweep({ database, now: NOW });
    const second = await runUploadAbandonSweep({ database, now: NOW });

    expect(first.cancelledDraftCount).toBe(1);
    expect(second.cancelledDraftCount).toBe(0);
    const stale = await database
      .selectFrom("upload_sessions")
      .select("state")
      .where("id", "=", staleId)
      .executeTakeFirstOrThrow();
    expect(stale.state).toBe("cancelled");
    await database.destroy();
  });

  it("never touches a settled batch", async () => {
    const { database, memberId } = await createContext();
    const sessionId = await insertUploadSession(database, {
      uploadedBy: memberId,
      state: "settled",
      settled_at: shiftMinutes(NOW, -120),
    });
    await insertUploadFile(database, {
      uploadSessionId: sessionId,
      state: "done",
      updated_at: shiftMinutes(NOW, -120),
    });

    const summary = await runUploadAbandonSweep({ database, now: NOW });

    expect(summary.abandonedFileCount).toBe(0);
    await database.destroy();
  });
});
```

- [ ] **Step 4: Run it and watch it fail**

Run: `pnpm --filter @memory-shoebox/server exec vitest run test/jobs/uploadAbandonSweep.test.ts`
Expected: FAIL, unresolved import.

- [ ] **Step 5: Write the job**

```ts
// apps/server/src/jobs/uploadAbandonSweep.ts
import { sql, type Kysely, type SqlBool } from "kysely";
import { appConfig } from "../../../../app.config.ts";
import type { Database } from "../db/types.ts";

/** What one run changed. */
export type UploadAbandonSweepSummary = {
  abandonedFileCount: number;
  cancelledDraftCount: number;
};

/** Non-terminal file states: nothing else can still be waiting on a transfer. */
const IN_FLIGHT_FILE_STATES = ["waiting", "sending"] as const;

/**
 * Two jobs in one, because both mean "this batch is not coming back"
 * (`conventions.md` § The job runner).
 *
 * **The committed half.** A batch whose browser was closed leaves `waiting`
 * and `sending` rows that nothing will ever finish. They become `failed` with
 * `problem_code = 'abandoned'`, measured against `upload_files.updated_at` so
 * a batch where most files landed loses only the ones that did not.
 *
 * **The draft half.** A pre-commit draft idle past
 * `appConfig.upload.draftExpiryHours` is cancelled. The settle latch cannot
 * reach these, because it requires `committed_at IS NOT NULL`, and one member
 * may have only one open session, so an abandoned draft blocks them from
 * starting another until something clears it.
 *
 * **The settle latch is deliberately not here.** Marking the last in-flight
 * file terminal is what makes a batch eligible to settle and notify, and that
 * latch belongs to step 6a with the rest of the upload slice
 * (`data-models.md` § Exactly one email when the last file lands). Step 6a
 * calls it from this function, after both halves have run.
 */
export async function runUploadAbandonSweep(options: {
  database: Kysely<Database>;
  now: string;
}): Promise<UploadAbandonSweepSummary> {
  const nowMs = Date.parse(options.now);
  const abandonBefore = new Date(
    nowMs - appConfig.upload.abandonGraceMinutes * 60_000,
  ).toISOString();
  const draftsIdleBefore = new Date(
    nowMs - appConfig.upload.draftExpiryHours * 3_600_000,
  ).toISOString();

  const abandoned = await options.database
    .updateTable("upload_files")
    .set({
      state: "failed",
      problem_code: "abandoned",
      problem_detail: "The upload stopped and did not come back.",
      updated_at: options.now,
    })
    .where("state", "in", [...IN_FLIGHT_FILE_STATES])
    .where("updated_at", "<=", abandonBefore)
    .where(
      sql<SqlBool>`EXISTS (
        SELECT 1 FROM upload_sessions
        WHERE upload_sessions.id = upload_files.upload_session_id
          AND upload_sessions.committed_at IS NOT NULL
          AND upload_sessions.state = 'uploading'
      )`,
    )
    .executeTakeFirst();

  const cancelledDrafts = await options.database
    .updateTable("upload_sessions")
    .set({ state: "cancelled", last_activity_at: options.now })
    .where("state", "=", "draft")
    .where("committed_at", "is", null)
    .where("last_activity_at", "<=", draftsIdleBefore)
    .executeTakeFirst();

  return {
    abandonedFileCount: Number(abandoned.numUpdatedRows),
    cancelledDraftCount: Number(cancelledDrafts.numUpdatedRows),
  };
}
```

The import path `../../../../app.config.ts` is four levels up from
`apps/server/src/jobs/`: `jobs` to `src` to `server` to `apps` to the
repository root. Check it resolves before moving on; `app.config.ts`'s own
docstring says the server imports it with a relative path and a `.ts`
extension.

- [ ] **Step 6: Run it and watch it pass**

Run: `pnpm --filter @memory-shoebox/server exec vitest run test/jobs/uploadAbandonSweep.test.ts`
Expected: PASS, five tests.

- [ ] **Step 7: Commit**

```bash
git add app.config.ts apps/server/src/jobs/uploadAbandonSweep.ts apps/server/test/jobs/uploadAbandonSweep.test.ts apps/server/test/helpers/seed.ts
git commit -m "feat(server): upload-abandon-sweep, both halves

Stalled files in a committed batch become failed with problem_code
'abandoned'; pre-commit drafts idle past draftExpiryHours are cancelled,
which the settle latch cannot reach because it requires committed_at.

appConfig.upload.abandonGraceMinutes is new: the file half had no number
anywhere in the specification and cannot be written without one.

The settle latch itself stays with step 6a.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 15: `removal-reminder`

The arithmetic that makes two reminders in one week impossible, and the
recipient set it applies to. **The enqueue call is step 7a's**, with the copy
and the payload type.

**Files:**
- Modify: `apps/server/test/helpers/seed.ts`
- Create: `apps/server/src/jobs/removalReminder.ts`
- Test: `apps/server/test/jobs/removalReminder.test.ts`

- [ ] **Step 1: Add the item builder**

An open removal request needs an item: migration 0009 added
`CHECK (state <> 'open' OR item_id IS NOT NULL)`, because an open request must
name a photograph.

```ts
// apps/server/test/helpers/seed.ts, appended

/** Inserts one photograph and returns its id. */
export async function insertItem(
  database: Kysely<Database>,
  options: { uploadedBy: string } & Partial<Database["items"]>,
): Promise<string> {
  const { uploadedBy, ...overrides } = options;
  const id = overrides.id ?? createId();
  await database
    .insertInto("items")
    .values({
      id,
      kind: "photo",
      captured_at: NOW,
      captured_at_offset_minutes: 120,
      captured_on: "2026-09-27",
      capture_source: "exif",
      original_captured_at: NOW,
      seq: 0,
      uploaded_by: uploadedBy,
      upload_session_id: null,
      visibility_rule_id: EVERYONE_VISIBILITY_RULE_ID,
      burst_id: null,
      burst_index: null,
      width: 4032,
      height: 3024,
      duration_ms: null,
      byte_size: 2_400_000,
      content_type: "image/jpeg",
      checksum: null,
      original_filename: "IMG_0001.jpg",
      alt_text: null,
      created_at: NOW,
      ...overrides,
    })
    .execute();
  return id;
}
```

- [ ] **Step 2: Write the failing test**

```ts
// apps/server/test/jobs/removalReminder.test.ts
import { describe, expect, it } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import {
  buildRemovalReminderKey,
  computeWeekIndex,
  runRemovalReminder,
} from "../../src/jobs/removalReminder.ts";
import {
  NOW,
  insertItem,
  insertMember,
  insertRemovalRequest,
  shiftDays,
} from "../helpers/seed.ts";

async function createContextWithOpenRequest(
  requestOverrides: Record<string, unknown> = {},
) {
  const database = createDatabase(":memory:");
  await migrateToLatest(database);
  const uploaderId = await insertMember(database, { role: "uploader" });
  const adminId = await insertMember(database, { role: "admin" });
  const requesterId = await insertMember(database, { role: "viewer" });
  const itemId = await insertItem(database, { uploadedBy: uploaderId });
  const requestId = await insertRemovalRequest(database, {
    requestedByMemberId: requesterId,
    itemUploaderMemberId: uploaderId,
    item_id: itemId,
    state: "open",
    decline_reason: null,
    resolved_at: null,
    resolved_by_member_id: null,
    created_at: shiftDays(NOW, -8),
    ...requestOverrides,
  });
  return { database, uploaderId, adminId, requesterId, requestId };
}

describe("computeWeekIndex", () => {
  it("is zero in the week of the request", () => {
    expect(
      computeWeekIndex({
        createdAt: "2026-09-14T09:00:00.000Z",
        now: "2026-09-20T09:00:00.000Z",
        timezone: "Europe/Madrid",
      }),
    ).toBe(0);
  });

  it("is one from the seventh day", () => {
    expect(
      computeWeekIndex({
        createdAt: "2026-09-14T09:00:00.000Z",
        now: "2026-09-21T09:00:00.000Z",
        timezone: "Europe/Madrid",
      }),
    ).toBe(1);
  });

  it("is two a fortnight later", () => {
    expect(
      computeWeekIndex({
        createdAt: "2026-09-14T09:00:00.000Z",
        now: "2026-09-28T09:00:00.000Z",
        timezone: "Europe/Madrid",
      }),
    ).toBe(2);
  });
});

describe("buildRemovalReminderKey", () => {
  it("is the recipe from notifications.md", () => {
    expect(
      buildRemovalReminderKey({
        requestId: "request-1",
        memberId: "member-2",
        weekIndex: 1,
      }),
    ).toBe("removal-reminder:request-1:member-2:1");
  });

  it("makes two reminders in one week arithmetically impossible", () => {
    const createdAt = "2026-09-14T09:00:00.000Z";
    const keyFor = (now: string) => {
      return buildRemovalReminderKey({
        requestId: "request-1",
        memberId: "member-2",
        weekIndex: computeWeekIndex({ createdAt, now, timezone: "UTC" }),
      });
    };

    // Every hour of one week produces one key, so the unique index on
    // outbound_emails.idempotency_key rejects all but the first.
    expect(keyFor("2026-09-21T09:00:00.000Z")).toBe(
      keyFor("2026-09-27T23:00:00.000Z"),
    );
    // The next week is a different key, so exactly one more goes out.
    expect(keyFor("2026-09-28T09:00:00.000Z")).not.toBe(
      keyFor("2026-09-27T23:00:00.000Z"),
    );
  });
});

describe("removal-reminder", () => {
  it("finds nothing against empty tables", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);

    const summary = await runRemovalReminder({ database, now: NOW });

    expect(summary.due).toEqual([]);
    await database.destroy();
  });

  it("is due for the snapshot uploader and every admin, minus the requester", async () => {
    const { database, uploaderId, adminId, requesterId, requestId } =
      await createContextWithOpenRequest();

    const summary = await runRemovalReminder({ database, now: NOW });

    expect(summary.due).toHaveLength(2);
    expect(summary.due.map((due) => due.memberId).sort()).toEqual(
      [uploaderId, adminId].sort(),
    );
    expect(summary.due.map((due) => due.memberId)).not.toContain(requesterId);
    expect(summary.due[0].weekIndex).toBe(1);
    expect(
      summary.due.map((due) => due.idempotencyKey).every((key) => {
        return key.startsWith(`removal-reminder:${requestId}:`);
      }),
    ).toBe(true);
    await database.destroy();
  });

  it("is not due in week zero, so nothing chases within the hour of asking", async () => {
    const { database } = await createContextWithOpenRequest({
      created_at: shiftDays(NOW, -2),
    });

    const summary = await runRemovalReminder({ database, now: NOW });

    expect(summary.due).toEqual([]);
    await database.destroy();
  });

  it("is not due once the request is resolved", async () => {
    const { database } = await createContextWithOpenRequest({
      state: "withdrawn",
      resolved_at: NOW,
    });

    const summary = await runRemovalReminder({ database, now: NOW });

    expect(summary.due).toEqual([]);
    await database.destroy();
  });

  it("skips somebody who has turned the removal conversation off", async () => {
    const { database, adminId } = await createContextWithOpenRequest();
    await database
      .updateTable("members")
      .set({ notify_on_removal: 0 })
      .where("id", "=", adminId)
      .execute();

    const summary = await runRemovalReminder({ database, now: NOW });

    expect(summary.due.map((due) => due.memberId)).not.toContain(adminId);
    await database.destroy();
  });

  it("returns the same set twice, because it writes nothing yet", async () => {
    const { database } = await createContextWithOpenRequest();

    const first = await runRemovalReminder({ database, now: NOW });
    const second = await runRemovalReminder({ database, now: NOW });

    expect(second.due).toEqual(first.due);
    await database.destroy();
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `pnpm --filter @memory-shoebox/server exec vitest run test/jobs/removalReminder.test.ts`
Expected: FAIL, unresolved import.

- [ ] **Step 4: Write the job**

```ts
// apps/server/src/jobs/removalReminder.ts
import { sql, type Kysely } from "kysely";
import type { Database } from "../db/types.ts";
import { readInstanceSettings } from "../settings/instanceSettings.ts";
import { countLocalDaysBetween } from "../time/localDay.ts";

/** One reminder that is owed to one person about one request. */
export type DueRemovalReminder = {
  requestId: string;
  memberId: string;
  /** Chooses "you put it up" against "an admin is copied on this". */
  relation: "uploader" | "admin";
  /** 1 for the first reminder. Lets the copy escalate if it ever should. */
  weekIndex: number;
  idempotencyKey: string;
};

/** What one run found. */
export type RemovalReminderSummary = {
  due: readonly DueRemovalReminder[];
};

/**
 * `week_index = floor((now - request.created_at) / 7 days)`.
 *
 * The neat part, and the whole reason the job holds no scheduler state: run it
 * hourly with a blind `INSERT ... ON CONFLICT DO NOTHING` and it is
 * arithmetically impossible to send two reminders in one week
 * (`data-models.md` § `outbound_emails`). No "last reminded at" column to
 * drift.
 *
 * **Calendar days in `shoebox.timezone`, not elapsed hours.** The week
 * boundary lands at local midnight, which is the third place that setting
 * fixes a clock that otherwise has none
 * (`apis/notifications.md` § 6 `removal_reminder`).
 */
export function computeWeekIndex(options: {
  createdAt: string;
  now: string;
  timezone: string;
}): number {
  const days = countLocalDaysBetween({
    from: options.createdAt,
    to: options.now,
    timezone: options.timezone,
  });
  return Math.floor(days / 7);
}

/**
 * The idempotency recipe:
 * `removal-reminder:<request_id>:<member_id>:<week_index>`.
 *
 * Verbatim from `apis/notifications.md` § The nine messages. It is the only
 * thing standing between an hourly job and a reminder every hour.
 */
export function buildRemovalReminderKey(options: {
  requestId: string;
  memberId: string;
  weekIndex: number;
}): string {
  return `removal-reminder:${options.requestId}:${options.memberId}:${options.weekIndex}`;
}

/**
 * Finds every weekly reminder that is owed right now.
 *
 * **Recipients are re-evaluated at every firing, not snapshotted from the
 * original request** (`apis/notifications.md` § 6), because the admin set may
 * have changed during the week. The uploader comes from
 * `removal_requests.item_uploader_member_id`, the snapshot column, and never
 * from a join to `items`: `item_id` is `SET NULL`, so the join drops the row
 * in exactly the case that matters.
 *
 * **`week_index >= 1` is required, not optional.** Week zero is the week of
 * the request itself, during which `removal_request` already went out, and
 * without the guard the first "still waiting" reminder lands within the hour
 * of somebody asking, chasing an uploader who has not yet had a chance to read
 * the original.
 *
 * **This does not enqueue anything yet.** The message's copy, its subject and
 * its payload type belong to step 7a with the other four removal messages, and
 * a payload invented here would be a guess. Step 7a passes each row of `due`
 * to `enqueueEmail` with the key this already built.
 */
export async function runRemovalReminder(options: {
  database: Kysely<Database>;
  now: string;
}): Promise<RemovalReminderSummary> {
  const settings = await readInstanceSettings(options.database, [
    "shoebox.timezone",
  ]);

  // One query, not one per request: the recipient set is the snapshot uploader
  // OR any active admin, and an admin who is also the uploader matches the one
  // member row once, so there is nothing to de-duplicate afterwards.
  const candidates = await options.database
    .selectFrom("removal_requests as request")
    .innerJoin("members as member", (join) => {
      return join.on((eb) => {
        return eb.or([
          eb("member.id", "=", eb.ref("request.item_uploader_member_id")),
          eb("member.role", "=", "admin"),
        ]);
      });
    })
    .select([
      "request.id as requestId",
      "request.created_at as requestCreatedAt",
      "request.item_uploader_member_id as uploaderMemberId",
      "member.id as memberId",
    ])
    .where("request.state", "=", "open")
    .where("member.status", "=", "active")
    .where("member.notify_on_removal", "=", 1)
    .where(sql`member.id`, "<>", sql`request.requested_by_member_id`)
    .execute();

  const due: DueRemovalReminder[] = [];
  for (const candidate of candidates) {
    const weekIndex = computeWeekIndex({
      createdAt: candidate.requestCreatedAt,
      now: options.now,
      timezone: settings["shoebox.timezone"],
    });
    if (weekIndex < 1) {
      continue;
    }
    due.push({
      requestId: candidate.requestId,
      memberId: candidate.memberId,
      relation:
        candidate.memberId === candidate.uploaderMemberId ? "uploader" : "admin",
      weekIndex,
      idempotencyKey: buildRemovalReminderKey({
        requestId: candidate.requestId,
        memberId: candidate.memberId,
        weekIndex,
      }),
    });
  }

  return { due };
}
```

If Kysely rejects `.where(sql\`member.id\`, "<>", sql\`request.requested_by_member_id\`)`,
use `.whereRef("member.id", "<>", "request.requested_by_member_id")`, which is
the idiomatic form for comparing two columns and should be preferred if it
type-checks.

- [ ] **Step 5: Run it and watch it pass**

Run: `pnpm --filter @memory-shoebox/server exec vitest run test/jobs/removalReminder.test.ts`
Expected: PASS, eleven tests.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/jobs/removalReminder.ts apps/server/test/jobs/removalReminder.test.ts apps/server/test/helpers/seed.ts
git commit -m "feat(server): removal-reminder's arithmetic and recipient set

week_index = floor((now - created_at) / 7 days) over calendar days in
shoebox.timezone, with week_index >= 1 so nothing chases within the hour of
asking. The uploader comes from the snapshot column, never from a join to
items, because item_id is SET NULL.

The enqueue call belongs to step 7a with the copy. What ships here is the key
the unique index rejects a second time in the same week.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 16: The job registry, and starting the runner

**Files:**
- Create: `apps/server/src/jobs/registry.ts`
- Modify: `apps/server/src/app.ts`
- Modify: `apps/server/src/index.ts`
- Test: `apps/server/test/jobs/registry.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/server/test/jobs/registry.test.ts
import { describe, expect, it } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { createJobRegistry } from "../../src/jobs/registry.ts";
import { createFakeB2Client } from "../helpers/fakeB2.ts";

async function createRegistry() {
  const database = createDatabase(":memory:");
  await migrateToLatest(database);
  const jobs = createJobRegistry({
    database,
    b2: createFakeB2Client(),
    clock: () => new Date("2026-09-27T10:00:00.000Z"),
  });
  return { database, jobs };
}

describe("createJobRegistry", () => {
  it("registers the seven jobs conventions.md names, with their cadences", async () => {
    const { database, jobs } = await createRegistry();

    expect(
      jobs.map((job) => [job.name, job.intervalMs]),
    ).toEqual([
      ["session-sweep", 3_600_000],
      ["invitation-lapse", 3_600_000],
      ["sign-in-code-sweep", 3_600_000],
      ["upload-abandon-sweep", 900_000],
      ["removal-reminder", 3_600_000],
      ["object-deletion-drain", 300_000],
      ["visibility-rule-sweep", 86_400_000],
    ]);
    await database.destroy();
  });

  it("runs every job twice against an empty database without failing or changing anything", async () => {
    const { database, jobs } = await createRegistry();

    for (const job of jobs) {
      await job.run();
      await job.run();
    }

    // Nothing to assert beyond "no throw": an empty database has nothing to
    // change, and a job that threw here would take the whole schedule with it
    // on a fresh instance.
    expect(jobs).toHaveLength(7);
    await database.destroy();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @memory-shoebox/server exec vitest run test/jobs/registry.test.ts`
Expected: FAIL, unresolved import.

- [ ] **Step 3: Write the registry**

```ts
// apps/server/src/jobs/registry.ts
import type { Kysely } from "kysely";
import type { B2Client } from "../b2/client.ts";
import type { Database } from "../db/types.ts";
import { runInvitationLapse } from "./invitationLapse.ts";
import { runObjectDeletionDrain } from "./objectDeletionDrain.ts";
import { runRemovalReminder } from "./removalReminder.ts";
import type { Job } from "./runner.ts";
import { runSessionSweep } from "./sessionSweep.ts";
import { runSignInCodeSweep } from "./signInCodeSweep.ts";
import { runUploadAbandonSweep } from "./uploadAbandonSweep.ts";
import { runVisibilityRuleSweep } from "./visibilityRuleSweep.ts";

const ONE_HOUR_MS = 3_600_000;
const FIFTEEN_MINUTES_MS = 900_000;
const FIVE_MINUTES_MS = 300_000;
const ONE_DAY_MS = 86_400_000;

/**
 * The seven background jobs, with the cadences
 * `apis/conventions.md` § The job runner gives them.
 *
 * **Seven, and the set is closed.** The document names them so a slice can
 * cite one, and nothing else may join the list: the mail queue runs on the
 * same runner and is deliberately not in here, because it is not one of the
 * seven and its cadence is seconds rather than minutes.
 *
 * Order matches the document's table, so the two can be read side by side.
 *
 * @param deps.database The catalog.
 * @param deps.b2 Backblaze, which only `object-deletion-drain` touches.
 * @param deps.clock Overridable so a test can hold time still.
 */
export function createJobRegistry(deps: {
  database: Kysely<Database>;
  b2: B2Client;
  clock?: () => Date;
}): readonly Job[] {
  const clock = deps.clock ?? (() => new Date());
  const now = (): string => {
    return clock().toISOString();
  };

  return [
    {
      name: "session-sweep",
      intervalMs: ONE_HOUR_MS,
      run: async () => {
        await runSessionSweep({ database: deps.database, now: now() });
      },
    },
    {
      name: "invitation-lapse",
      intervalMs: ONE_HOUR_MS,
      run: async () => {
        await runInvitationLapse({ database: deps.database, now: now() });
      },
    },
    {
      name: "sign-in-code-sweep",
      intervalMs: ONE_HOUR_MS,
      run: async () => {
        await runSignInCodeSweep({ database: deps.database, now: now() });
      },
    },
    {
      name: "upload-abandon-sweep",
      intervalMs: FIFTEEN_MINUTES_MS,
      run: async () => {
        await runUploadAbandonSweep({ database: deps.database, now: now() });
      },
    },
    {
      name: "removal-reminder",
      intervalMs: ONE_HOUR_MS,
      run: async () => {
        await runRemovalReminder({ database: deps.database, now: now() });
      },
    },
    {
      name: "object-deletion-drain",
      intervalMs: FIVE_MINUTES_MS,
      run: async () => {
        await runObjectDeletionDrain({
          database: deps.database,
          b2: deps.b2,
          now: now(),
        });
      },
    },
    {
      name: "visibility-rule-sweep",
      intervalMs: ONE_DAY_MS,
      run: async () => {
        await runVisibilityRuleSweep({ database: deps.database });
      },
    },
  ];
}
```

- [ ] **Step 4: Wire the runner into `createApp`**

```ts
// apps/server/src/app.ts, in the module declaration
    jobRunner: JobRunner;
```

```ts
// apps/server/src/app.ts, in AppDeps
  /**
   * Whether to start the background jobs and the mail queue.
   *
   * False in tests, which call a job directly rather than waiting on an
   * interval. `index.ts` passes true.
   */
  startBackgroundWork?: boolean;
```

```ts
// apps/server/src/app.ts, after the b2 decoration
  const b2 = deps.b2 ?? createB2Client(deps.config.b2);
  app.decorate("b2", b2);

  const jobRunner = createJobRunner({
    jobs: createJobRegistry({ database: deps.database, b2, clock: deps.clock }),
    logger: app.log,
  });
  app.decorate("jobRunner", jobRunner);

  if (deps.startBackgroundWork === true) {
    jobRunner.start();
  }

  // Fly stops a machine with SIGTERM, and index.ts closes the app on it. The
  // schedule has to stop with the server, or a sweep runs against a database
  // that is being closed underneath it.
  app.addHook("onClose", async () => {
    await jobRunner.stop();
  });
```

```ts
// apps/server/src/index.ts, in the createApp call
const app = await createApp({ config, database, startBackgroundWork: true });
```

- [ ] **Step 5: Run the whole server suite**

Run: `pnpm --filter @memory-shoebox/server test`
Expected: PASS, everything so far.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/jobs/registry.ts apps/server/src/app.ts apps/server/src/index.ts apps/server/test/jobs/registry.test.ts
git commit -m "feat(server): register the seven jobs and start the runner

Cadences verbatim from conventions.md, and a test that runs every one of them
twice against an empty database: a fresh instance has nothing to sweep, and a
job that threw there would take the whole schedule down on day one.

The runner stops on app close, so a sweep cannot outlive the database on
SIGTERM.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 17: The email layout and the one worked message

**Open the prototype before writing a line of this.** Run
`pnpm dev:prototypes` and visit
`http://localhost:5174/s/emails?state=code`. It shows the message twice: as a
client with styles on renders it, and as the plain-text alternative a client
with them off shows instead. Both have to stand on their own, because for some
members in this audience the second one is the only version that ever arrives.

**Files:**
- Create: `apps/server/src/mail/templates/layout.ts`
- Create: `apps/server/src/mail/templates/signInCode.ts`
- Create: `apps/server/src/mail/templates/registry.ts`
- Test: `apps/server/test/mail/templates/signInCode.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/server/test/mail/templates/signInCode.test.ts
import { describe, expect, it } from "vitest";
import type { SignInCodeEmailPayload } from "@memory-shoebox/shared";
import { signInCodeTemplate } from "../../../src/mail/templates/signInCode.ts";

const PAYLOAD: SignInCodeEmailPayload = {
  shoeboxName: "My Shoebox",
  baseUrl: "https://shoebox.example",
  timezone: "Europe/Madrid",
  toDisplayName: "Abuela Rosa",
  preferencesUrl: null,
  code: "410233",
  expiresAt: "2026-09-27T10:10:00.000Z",
  expiresInMinutes: 10,
};

describe("the sign-in code message", () => {
  it("puts the digits in the subject, so the code reads off a lock screen", () => {
    expect(signInCodeTemplate.subject(PAYLOAD)).toBe("Your code is 410233");
  });

  it("renders the digits, the ten minutes, and the reassurance", () => {
    const html = signInCodeTemplate.html(PAYLOAD);

    expect(html).toContain("410233");
    expect(html).toContain("It works for ten minutes and then it stops.");
    expect(html).toContain("somebody typed your address by mistake");
    expect(html).toContain("My Shoebox");
  });

  it("renders a plain-text alternative that stands on its own", () => {
    const text = signInCodeTemplate.text(PAYLOAD);

    expect(text).toContain("MY SHOEBOX");
    expect(text).toContain("410233");
    expect(text).toContain("This went to you because you are in My Shoebox.");
  });

  it("omits the preferences link in both forms, because there is no switch to offer", () => {
    expect(signInCodeTemplate.html(PAYLOAD)).not.toContain("Turn these emails off");
    expect(signInCodeTemplate.text(PAYLOAD)).not.toContain("Turn these emails off");
  });

  it("references no design token, because a mail client resolves none", () => {
    const html = signInCodeTemplate.html(PAYLOAD);

    expect(html).not.toContain("var(--");
    expect(html).not.toContain("color-mix");
    expect(html).toContain("Arial");
  });

  it("takes the minutes from the payload rather than hard-coding the word", () => {
    const html = signInCodeTemplate.html({ ...PAYLOAD, expiresInMinutes: 5 });

    expect(html).toContain("It works for five minutes and then it stops.");
  });

  it("escapes a Shoebox name that contains markup", () => {
    const html = signInCodeTemplate.html({
      ...PAYLOAD,
      shoeboxName: "<script>alert(1)</script>",
    });

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @memory-shoebox/server exec vitest run test/mail/templates/signInCode.test.ts`
Expected: FAIL, unresolved import.

- [ ] **Step 3: Write the layout**

```ts
// apps/server/src/mail/templates/layout.ts
import type { EmailCommon } from "@memory-shoebox/shared";

/**
 * Where an AGPL-licensed instance offers its source.
 *
 * The footer's offer is a licence obligation as much as a courtesy, so it is
 * in every message rather than configurable per deployment.
 */
const SOURCE_URL = "https://github.com/jpsyx/memory-shoebox";

/** Columns the plain-text alternative wraps at. */
const PLAIN_TEXT_COLUMNS = 64;

/**
 * One rendered message, in both forms a mail client may choose between.
 */
export type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
};

/**
 * One kind's copy.
 *
 * **Takes the payload and nothing else.** That is the mechanical test for
 * whether a payload is right (`apis/notifications.md` § Rules that hold for
 * all nine): if rendering would need a query, the payload is wrong, and a
 * retry a day later would produce a different message from the same row.
 */
export type EmailTemplate<Payload extends EmailCommon> = {
  subject: (payload: Payload) => string;
  html: (payload: Payload) => string;
  text: (payload: Payload) => string;
};

/** Escapes text for an HTML attribute or a text node. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Spells a small number in English, falling back to digits.
 *
 * The mockup reads "It works for ten minutes", and the payload carries `10` so
 * the copy cannot drift from the row. Hard-coding the word would defeat the
 * field, and printing "10" would not be the copy that was designed, so the
 * number is spelled.
 */
export function spellSmallNumber(value: number): string {
  const words = [
    "zero",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
    "eleven",
    "twelve",
  ];
  return words[value] ?? String(value);
}

/** Wraps plain text at a width a narrow mail client will not re-wrap badly. */
export function wrapPlainText(
  text: string,
  columns: number = PLAIN_TEXT_COLUMNS,
): string {
  return text
    .split("\n")
    .map((line) => {
      if (line.length <= columns || line.startsWith("    ")) {
        return line;
      }
      const wrapped: string[] = [];
      let current = "";
      for (const word of line.split(" ")) {
        if (current === "") {
          current = word;
        } else if (`${current} ${word}`.length <= columns) {
          current = `${current} ${word}`;
        } else {
          wrapped.push(current);
          current = word;
        }
      }
      wrapped.push(current);
      return wrapped.join("\n");
    })
    .join("\n");
}

/**
 * Wraps a message body in the shared masthead and footer.
 *
 * **Nothing here may reference a design token, a webfont, or a layout that
 * needs a modern renderer.** `prototypes/src/surfaces/Emails.module.css` says
 * so in as many words and gives the reason: a mail client strips webfonts,
 * ignores custom properties, flattens `color-mix`, and may show the plain-text
 * alternative instead of any of it. The thing being designed here is whether
 * it still reads after somebody forwards it to four people.
 *
 * The preferences link is rendered when `preferencesUrl` is set and omitted
 * when it is null, which is `sign_in_code` and only `sign_in_code`: offering
 * to turn off a message that cannot be turned off is a lie.
 */
export function renderEmailHtml(options: {
  shoeboxName: string;
  preferencesUrl: string | null;
  bodyHtml: string;
}): string {
  const name = escapeHtml(options.shoeboxName);
  const preferences =
    options.preferencesUrl === null
      ? ""
      : `<a href="${escapeHtml(options.preferencesUrl)}" style="color:#1b1f22;">Turn these emails off</a> &middot; `;

  return [
    `<div style="padding:24px;background:#ffffff;color:#1b1f22;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;">`,
    `<div style="max-width:600px;margin:0 auto;">`,
    `<p style="margin:0;padding-bottom:12px;border-bottom:2px solid #1b1f22;font-size:18px;font-weight:bold;">${name}</p>`,
    options.bodyHtml,
    `<div style="margin-top:28px;padding-top:16px;border-top:1px solid #cccccc;color:#4a4a4a;font-size:14px;">`,
    `<p style="margin:0;">This went to you because you are in ${name}. Nobody outside it can see anything here.</p>`,
    `<p style="margin:8px 0 0;">${preferences}Memory Shoebox, which you can <a href="${SOURCE_URL}" style="color:#1b1f22;">get the source of</a>.</p>`,
    `</div></div></div>`,
  ].join("");
}

/**
 * The plain-text alternative, with the same masthead and footer.
 *
 * The footer is shorter than the HTML one on purpose: the mockup's plain-text
 * `code` state carries one line, and a plain-text message that reproduces
 * every link in the HTML one reads like a machine rather than a note.
 */
export function renderEmailText(options: {
  shoeboxName: string;
  preferencesUrl: string | null;
  bodyText: string;
}): string {
  const lines = [
    options.shoeboxName.toUpperCase(),
    "",
    wrapPlainText(options.bodyText.trim()),
    "",
    "--",
    `This went to you because you are in ${options.shoeboxName}.`,
  ];
  if (options.preferencesUrl !== null) {
    lines.push(`Turn these emails off: ${options.preferencesUrl}`);
  }
  return `${lines.join("\n")}\n`;
}
```

- [ ] **Step 4: Write the sign-in code message**

```ts
// apps/server/src/mail/templates/signInCode.ts
import type { SignInCodeEmailPayload } from "@memory-shoebox/shared";
import {
  escapeHtml,
  renderEmailHtml,
  renderEmailText,
  spellSmallNumber,
  type EmailTemplate,
} from "./layout.ts";

/** "It works for ten minutes and then it stops." */
function _lifetimeSentence(payload: SignInCodeEmailPayload): string {
  return `It works for ${spellSmallNumber(payload.expiresInMinutes)} minutes and then it stops.`;
}

const REASSURANCE =
  "If you did not ask for this, somebody typed your address by mistake. Nothing has happened and you can ignore it.";

/**
 * `sign_in_code`: surface 16, state `code`.
 *
 * **The six digits are in the subject deliberately**, so the code reads off a
 * lock screen without opening anything. That is also why both `payload_json`
 * and `subject` are scrubbed once the row is terminal: the subject column is
 * otherwise a permanent log of live-looking codes sitting beside the address
 * each was sent to (`data-models.md` § `outbound_emails`).
 *
 * The footer carries no preferences link, because a sign-in code is the one
 * message nobody may turn off.
 */
export const signInCodeTemplate: EmailTemplate<SignInCodeEmailPayload> = {
  subject: (payload) => {
    return `Your code is ${payload.code}`;
  },

  html: (payload) => {
    const body = [
      `<h1 style="margin:24px 0 0;font-size:24px;line-height:1.2;font-weight:bold;">Your code</h1>`,
      `<p style="margin:20px 0 0;padding:16px;border:2px solid #1b1f22;font-family:'Courier New',Courier,monospace;font-size:34px;font-weight:bold;letter-spacing:0.35em;text-align:center;">${escapeHtml(payload.code)}</p>`,
      `<p style="margin:16px 0 0;">Type it into the page you left open. ${_lifetimeSentence(payload)}</p>`,
      `<p style="margin:16px 0 0;">${REASSURANCE}</p>`,
    ].join("");

    return renderEmailHtml({
      shoeboxName: payload.shoeboxName,
      preferencesUrl: payload.preferencesUrl,
      bodyHtml: body,
    });
  },

  text: (payload) => {
    const body = [
      "Your code is",
      "",
      `    ${payload.code}`,
      "",
      `Type it into the page you left open. ${_lifetimeSentence(payload)}`,
      "",
      REASSURANCE,
    ].join("\n");

    return renderEmailText({
      shoeboxName: payload.shoeboxName,
      preferencesUrl: payload.preferencesUrl,
      bodyText: body,
    });
  },
};
```

- [ ] **Step 5: Write the registry**

```ts
// apps/server/src/mail/templates/registry.ts
import type { SignInCodeEmailPayload } from "@memory-shoebox/shared";
import type { EmailTemplate } from "./layout.ts";
import { signInCodeTemplate } from "./signInCode.ts";

/**
 * The payload each built kind carries, minus `EmailCommon`, which
 * `enqueueEmail` resolves.
 *
 * A later step adds its kind here in the same change as its copy and its
 * callers. The six missing entries are step 3a's caller for `sign_in_code`
 * aside: `comment` in 5a, `upload_session` in 6a, the five removal messages
 * in 7a, and `invitation` in 8a.
 */
export type EmailPayloadExtras = {
  sign_in_code: Omit<SignInCodeEmailPayload, keyof import("@memory-shoebox/shared").EmailCommon>;
};

/**
 * Kind to copy, for every kind that has copy.
 *
 * **This object is what gates the mail queue.** `enqueueEmail` derives a
 * message's subject from its template, so a kind absent from here cannot be
 * enqueued at all, and the attempt is a type error rather than a row that sits
 * `queued` forever behind a renderer that cannot render it. That is how the
 * step split is enforced rather than merely stated.
 */
export const EMAIL_TEMPLATES = {
  sign_in_code: signInCodeTemplate,
} as const satisfies Record<string, EmailTemplate<never>>;

/** A kind that has copy today, and so may be enqueued today. */
export type BuiltEmailKind = keyof typeof EMAIL_TEMPLATES;
```

If the `satisfies Record<string, EmailTemplate<never>>` clause fights the
variance of `EmailTemplate`, drop the clause: the object literal is already
exactly typed and `BuiltEmailKind` derives from it either way.

- [ ] **Step 6: Run it and watch it pass**

Run: `pnpm --filter @memory-shoebox/server exec vitest run test/mail/templates/signInCode.test.ts`
Expected: PASS, seven tests.

- [ ] **Step 7: Compare against the prototype by eye**

With `pnpm dev:prototypes` running, open
`http://localhost:5174/s/emails?state=code` and put the rendered output beside
it. Write the HTML to a scratch file to look at it:

```bash
cd apps/server && node --input-type=module -e "
import { signInCodeTemplate } from './src/mail/templates/signInCode.ts';
const payload = {
  shoeboxName: 'My Shoebox', baseUrl: 'https://shoebox.example',
  timezone: 'Europe/Madrid', toDisplayName: 'Abuela Rosa',
  preferencesUrl: null, code: '410233',
  expiresAt: '2026-09-27T10:10:00.000Z', expiresInMinutes: 10,
};
console.log(signInCodeTemplate.html(payload));
console.log('\n---- plain text ----\n');
console.log(signInCodeTemplate.text(payload));
" > /tmp/sign-in-code.html
```

Open `/tmp/sign-in-code.html` in a browser beside the prototype. **Look at it
rather than diffing the markup**: the masthead rule, the bordered digit block,
the spacing between the paragraphs and the footer's grey rule are the things to
check. Fix the template, not the prototype.

- [ ] **Step 8: Commit**

```bash
git add apps/server/src/mail/templates apps/server/test/mail
git commit -m "feat(server): the email layout and the sign-in code message

A system font stack, literal hex and a 600px column, because a mail client
strips webfonts, ignores custom properties and may show the plain-text
alternative instead of any of it.

The template registry is what gates the queue: enqueueEmail derives a subject
from it, so a kind with no copy cannot be enqueued, and the attempt is a type
error rather than a row nothing can render.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 18: `enqueueEmail`

**Files:**
- Create: `apps/server/src/mail/enqueue.ts`
- Test: `apps/server/test/mail/enqueue.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/server/test/mail/enqueue.test.ts
import { describe, expect, it } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import { createId } from "../../src/db/ids.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { enqueueEmail } from "../../src/mail/enqueue.ts";
import { NOW, insertInstanceSetting } from "../helpers/seed.ts";

async function createContext(options: { withBaseUrl?: boolean } = {}) {
  const database = createDatabase(":memory:");
  await migrateToLatest(database);
  if (options.withBaseUrl !== false) {
    await insertInstanceSetting(database, {
      key: "public.base_url",
      value: "https://shoebox.example",
    });
  }
  return database;
}

function buildInput(overrides: Record<string, unknown> = {}) {
  const codeId = createId();
  return {
    kind: "sign_in_code" as const,
    toAddress: " Rosa@Example.com ",
    toMemberId: null,
    toDisplayName: "Abuela Rosa",
    idempotencyKey: `signin:${codeId}`,
    payload: {
      code: "410233",
      expiresAt: "2026-09-27T10:10:00.000Z",
      expiresInMinutes: 10,
    },
    triggerKind: "sign_in_code" as const,
    triggerId: codeId,
    ...overrides,
  };
}

describe("enqueueEmail", () => {
  it("queues a row with the subject the template derives", async () => {
    const database = await createContext();

    const result = await enqueueEmail({
      executor: database,
      input: buildInput(),
      now: NOW,
    });

    expect(result.state).toBe("queued");
    const row = await database
      .selectFrom("outbound_emails")
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(row.subject).toBe("Your code is 410233");
    expect(row.state).toBe("queued");
    expect(row.send_after).toBe(NOW);
    expect(row.next_attempt_at).toBeNull();
    expect(row.attempts).toBe(0);
    await database.destroy();
  });

  it("normalises the address onto the row", async () => {
    const database = await createContext();

    await enqueueEmail({ executor: database, input: buildInput(), now: NOW });

    const row = await database
      .selectFrom("outbound_emails")
      .select("to_address")
      .executeTakeFirstOrThrow();
    expect(row.to_address).toBe("rosa@example.com");
    await database.destroy();
  });

  it("resolves EmailCommon from settings, so the renderer needs no query", async () => {
    const database = await createContext();
    await insertInstanceSetting(database, {
      key: "shoebox.name",
      value: "Casa Mateo",
    });
    await insertInstanceSetting(database, {
      key: "shoebox.timezone",
      value: "Europe/Madrid",
    });

    await enqueueEmail({ executor: database, input: buildInput(), now: NOW });

    const row = await database
      .selectFrom("outbound_emails")
      .select("payload_json")
      .executeTakeFirstOrThrow();
    expect(JSON.parse(row.payload_json)).toMatchObject({
      shoeboxName: "Casa Mateo",
      timezone: "Europe/Madrid",
      baseUrl: "https://shoebox.example",
      toDisplayName: "Abuela Rosa",
      preferencesUrl: null,
      code: "410233",
    });
    await database.destroy();
  });

  it("writes a failed row and does not throw when public.base_url is unset", async () => {
    const database = await createContext({ withBaseUrl: false });

    const result = await enqueueEmail({
      executor: database,
      input: buildInput(),
      now: NOW,
    });

    expect(result.state).toBe("failed");
    const row = await database
      .selectFrom("outbound_emails")
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(row.state).toBe("failed");
    expect(row.attempts).toBe(0);
    expect(row.last_error_code).toBe("base_url_unset");
    expect(row.last_error_message).toContain("public.base_url");
    await database.destroy();
  });

  it("lets the caller's transaction commit even with no base URL", async () => {
    const database = await createContext({ withBaseUrl: false });

    await database.transaction().execute(async (transaction) => {
      await insertInstanceSetting(transaction as never, {
        key: "shoebox.name",
        value: "Casa Mateo",
      });
      await enqueueEmail({
        executor: transaction,
        input: buildInput(),
        now: NOW,
      });
    });

    const settings = await database
      .selectFrom("settings")
      .select("key")
      .where("key", "=", "shoebox.name")
      .execute();
    expect(settings).toHaveLength(1);
    await database.destroy();
  });

  it("is idempotent: the same key twice writes one row", async () => {
    const database = await createContext();
    const input = buildInput();

    const first = await enqueueEmail({ executor: database, input, now: NOW });
    const second = await enqueueEmail({ executor: database, input, now: NOW });

    expect(first.state).toBe("queued");
    expect(second.state).toBe("already_enqueued");
    expect(second.emailId).toBe(first.emailId);
    expect(
      await database.selectFrom("outbound_emails").select("id").execute(),
    ).toHaveLength(1);
    await database.destroy();
  });

  it("honours sendAfter, which only the reminder job sets", async () => {
    const database = await createContext();

    await enqueueEmail({
      executor: database,
      input: buildInput({ sendAfter: "2026-10-04T10:00:00.000Z" }),
      now: NOW,
    });

    const row = await database
      .selectFrom("outbound_emails")
      .select("send_after")
      .executeTakeFirstOrThrow();
    expect(row.send_after).toBe("2026-10-04T10:00:00.000Z");
    await database.destroy();
  });
});
```

The `insertInstanceSetting(transaction as never, ...)` cast in the fifth test
is ugly. Widen the helper's first parameter to
`Kysely<Database> | Transaction<Database>` in `helpers/seed.ts` and drop the
cast.

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @memory-shoebox/server exec vitest run test/mail/enqueue.test.ts`
Expected: FAIL, unresolved import.

- [ ] **Step 3: Write the enqueue**

```ts
// apps/server/src/mail/enqueue.ts
import type { Kysely, Transaction } from "kysely";
import type { EmailCommon, EnqueueEmailInput } from "@memory-shoebox/shared";
import { createId } from "../db/ids.ts";
import type { Database } from "../db/types.ts";
import { readInstanceSettings } from "../settings/instanceSettings.ts";
import {
  EMAIL_TEMPLATES,
  type BuiltEmailKind,
  type EmailPayloadExtras,
} from "./templates/registry.ts";

/** Either a handle or a transaction: the enqueue runs inside the caller's. */
export type MailExecutor = Kysely<Database> | Transaction<Database>;

/** What the enqueue did. */
export type EnqueueEmailResult = {
  emailId: string;
  /**
   * `queued` is the normal case. `failed` means `public.base_url` was unset,
   * which is terminal. `already_enqueued` means the idempotency key was
   * already taken, which is a retried handler doing exactly what it should.
   */
  state: "queued" | "failed" | "already_enqueued";
};

/**
 * Where a member turns a notification off. Not a setting: it is the account
 * surface, and the only variable part of it is the instance's own address.
 */
function _preferencesUrl(kind: BuiltEmailKind, baseUrl: string): string | null {
  // `sign_in_code` is the one kind with no switch to offer, so its footer
  // omits the link rather than offering something that does not work.
  return kind === "sign_in_code" ? null : `${baseUrl}/account`;
}

/**
 * Writes one outbound message, inside the caller's transaction.
 *
 * **It never throws.** The triggering transaction is always doing something
 * else that has to succeed: the upload latch is deliberately on `settled_at`
 * rather than `notified_at` so a batch can finish while mail is down, and a
 * sign-in code that cannot be mailed must still exist for the resend path
 * (`apis/notifications.md` § When `public.base_url` is unset).
 *
 * **It composes `EmailCommon` and derives the subject**, rather than taking
 * both from the caller as `notifications.md` § The enqueue interface writes
 * it. Only code here can discover that `public.base_url` is unset and still
 * write the row, and `invitation`'s subject interpolates the Shoebox name,
 * which a caller does not hold. Recorded as a deliberate deviation in the step
 * design.
 *
 * **With no absolute `public.base_url` the row is written `failed`** with
 * `attempts = 0` and `last_error_code = 'base_url_unset'`. The consequence is
 * stated rather than mitigated: those messages are lost, not retried, and
 * `GET /api/mail/health` reports it above every other diagnostic because every
 * other symptom is downstream of it.
 *
 * @param options.executor The caller's transaction, or a plain handle.
 * @param options.input The kind, the recipient, the idempotency key and the
 *   kind-specific payload fields.
 * @param options.now Overridable so a test can hold time still.
 */
export async function enqueueEmail<Kind extends BuiltEmailKind>(options: {
  executor: MailExecutor;
  input: EnqueueEmailInput<Kind, EmailPayloadExtras[Kind]>;
  now?: string;
}): Promise<EnqueueEmailResult> {
  const { executor, input } = options;
  const now = options.now ?? new Date().toISOString();

  const settings = await readInstanceSettings(executor as Kysely<Database>, [
    "shoebox.name",
    "shoebox.timezone",
    "public.base_url",
  ]);
  const baseUrl = settings["public.base_url"];

  // `resolveSetting` returns the default, null, for a missing row and for a
  // stored value that is not an absolute http(s) URL, so this one check covers
  // all three failures the document names: missing, empty, and not absolute.
  const isBaseUrlSet = baseUrl !== null;

  const common: EmailCommon = {
    shoeboxName: settings["shoebox.name"],
    // The empty string on the failed path. The row is terminal and is never
    // rendered, and the payload is kept because the requeue that a later
    // `public.base_url` triggers recomposes its links from it.
    baseUrl: baseUrl ?? "",
    timezone: settings["shoebox.timezone"],
    toDisplayName: input.toDisplayName,
    preferencesUrl: isBaseUrlSet
      ? _preferencesUrl(input.kind, baseUrl)
      : null,
  };

  const payload = { ...common, ...input.payload };
  const template = EMAIL_TEMPLATES[input.kind];
  const subject = template.subject(payload as never);

  const emailId = createId();
  const inserted = await executor
    .insertInto("outbound_emails")
    .values({
      id: emailId,
      kind: input.kind,
      to_address: input.toAddress.trim().toLowerCase(),
      to_member_id: input.toMemberId,
      from_address: null,
      subject,
      payload_json: JSON.stringify(payload),
      trigger_kind: input.triggerKind,
      trigger_id: input.triggerId,
      idempotency_key: input.idempotencyKey,
      state: isBaseUrlSet ? "queued" : "failed",
      send_after: input.sendAfter ?? now,
      attempts: 0,
      next_attempt_at: null,
      provider_message_id: null,
      provider_request_id: null,
      last_error_code: isBaseUrlSet ? null : "base_url_unset",
      last_error_message: isBaseUrlSet
        ? null
        : "public.base_url is not set, so this message has no absolute link and was not sent.",
      delivery_state: null,
      delivery_updated_at: null,
      created_at: now,
      sent_at: null,
    })
    .onConflict((conflict) => {
      return conflict.column("idempotency_key").doNothing();
    })
    .executeTakeFirst();

  if (Number(inserted.numInsertedOrUpdatedRows ?? 0) === 0) {
    // The unique index did its job. This is a retried handler, not an error:
    // it is the only thing standing between one and two hundred duplicates.
    const existing = await executor
      .selectFrom("outbound_emails")
      .select("id")
      .where("idempotency_key", "=", input.idempotencyKey)
      .executeTakeFirstOrThrow();
    return { emailId: existing.id, state: "already_enqueued" };
  }

  return { emailId, state: isBaseUrlSet ? "queued" : "failed" };
}
```

- [ ] **Step 4: Add the constraint test the step asks for by name**

```ts
// apps/server/test/mail/enqueue.test.ts, appended
import { insertOutboundEmail } from "../helpers/seed.ts";

describe("outbound_emails.idempotency_key", () => {
  it("is rejected by the constraint, not by application code", async () => {
    const database = await createContext();
    await insertOutboundEmail(database, { idempotency_key: "signin:one" });

    await expect(
      insertOutboundEmail(database, { idempotency_key: "signin:one" }),
    ).rejects.toThrow(/UNIQUE constraint failed/);

    await database.destroy();
  });
});
```

This test bypasses `enqueueEmail` on purpose. The guarantee the whole mail
design rests on is the **index**, not the function: a second caller that
forgot the `ON CONFLICT` clause must still be unable to write a duplicate.

- [ ] **Step 5: Run it and watch it pass**

Run: `pnpm --filter @memory-shoebox/server exec vitest run test/mail/enqueue.test.ts`
Expected: PASS, eight tests.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/mail/enqueue.ts apps/server/test/mail/enqueue.test.ts apps/server/test/helpers/seed.ts
git commit -m "feat(server): enqueueEmail, which never throws

It resolves EmailCommon from settings and derives the subject from the kind's
template, because only the enqueue can discover an unset public.base_url and
still write the row, and because invitation's subject interpolates a field no
caller holds.

With no base URL the row is written failed with attempts 0, and the caller's
transaction commits: a batch must be able to settle while mail is down, and a
sign-in code that could not be mailed must still exist for the resend path.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 19: The provider seam

**Nothing in the test suite ever sends.** `RESEND_API_KEY` is a placeholder in
`.env.example` for the operator to fill in, and every test substitutes a
recording double.

**Files:**
- Modify: `apps/server/package.json`
- Modify: `apps/server/src/config.ts`
- Modify: `apps/server/.env.example`
- Create: `apps/server/src/mail/sender.ts`
- Create: `apps/server/test/helpers/recordingMailSender.ts`
- Test: `apps/server/test/mail/sender.test.ts`
- Test: `apps/server/test/config.test.ts` (extend)

- [ ] **Step 1: Add the dependency**

```bash
pnpm --filter @memory-shoebox/server add resend@^6.30.0
```

- [ ] **Step 2: Make `RESEND_API_KEY` optional configuration**

```ts
// apps/server/src/config.ts, in the Config type
  /**
   * Resend API key. **Optional**: a Shoebox with no key starts and serves
   * every route, and its mail sits `queued` until a key arrives. Refusing to
   * boot would make first-run setup impossible, because an admin has to reach
   * the settings surface to configure mail at all, and an existing session
   * must survive a mail outage (`docs/architecture.md`).
   */
  resendApiKey: string | undefined;
```

```ts
// apps/server/src/config.ts, in environmentSchema
  RESEND_API_KEY: z.string().min(1).optional(),
```

```ts
// apps/server/src/config.ts, in the returned object
    resendApiKey: parsed.RESEND_API_KEY,
```

```ts
// apps/server/test/config.test.ts, appended
it("treats RESEND_API_KEY as optional, so an unconfigured instance still boots", () => {
  expect(
    parseConfig({
      SESSION_SECRET: "a".repeat(32),
      B2_KEY_ID: "key-id",
      B2_APPLICATION_KEY: "application-key",
      B2_BUCKET: "bucket",
      B2_ENDPOINT: "https://s3.us-west-004.backblazeb2.com",
      B2_REGION: "us-west-004",
    }).resendApiKey,
  ).toBeUndefined();
});
```

- [ ] **Step 3: Update `.env.example`**

Replace the whole `--- Email (Resend) ---` block with:

```
# --- Email (Resend) -----------------------------------------------------
# Transactional mail: the six-digit sign-in code and every notification.
# Optional. Without it the server starts and serves normally, and queued mail
# waits: nobody new can sign in until a key is set, although everybody already
# signed in is unaffected.
# Create a key at https://resend.com and verify your sending domain there.
RESEND_API_KEY=
#
# The sending identity is NOT an environment variable. It is the
# `mail.from_address` and `mail.from_name` settings, edited on the Shoebox
# settings surface, so that the mail health banner has one place to point at
# when it is missing. See docs/mail.md.
```

`MAIL_FROM` is deleted. It was never read.

- [ ] **Step 4: Write the failing test**

```ts
// apps/server/test/mail/sender.test.ts
import { describe, expect, it } from "vitest";
import {
  createResendMailSender,
  MailSendError,
  type ResendEmailsApi,
} from "../../src/mail/sender.ts";

const REQUEST = {
  from: "My Shoebox <shoebox@example.com>",
  to: "rosa@example.com",
  subject: "Your code is 410233",
  html: "<p>410233</p>",
  text: "410233",
  idempotencyKey: "signin:one",
};

describe("createResendMailSender", () => {
  it("returns the provider's message id", async () => {
    const calls: unknown[] = [];
    const emails: ResendEmailsApi = {
      send: (payload, options) => {
        calls.push({ payload, options });
        return Promise.resolve({ data: { id: "resend-1" }, error: null });
      },
    };

    const result = await createResendMailSender({ apiKey: "k", emails }).send(
      REQUEST,
    );

    expect(result.providerMessageId).toBe("resend-1");
    expect(calls).toHaveLength(1);
    await expect(Promise.resolve(calls[0])).resolves.toMatchObject({
      options: { idempotencyKey: "signin:one" },
    });
  });

  it("sends both the HTML and the plain-text alternative", async () => {
    let sent: Record<string, unknown> | undefined;
    const emails: ResendEmailsApi = {
      send: (payload) => {
        sent = payload as Record<string, unknown>;
        return Promise.resolve({ data: { id: "resend-1" }, error: null });
      },
    };

    await createResendMailSender({ apiKey: "k", emails }).send(REQUEST);

    expect(sent?.html).toBe("<p>410233</p>");
    expect(sent?.text).toBe("410233");
  });

  it("turns the provider's refusal into a MailSendError carrying its own words", async () => {
    const emails: ResendEmailsApi = {
      send: () => {
        return Promise.resolve({
          data: null,
          error: { name: "validation_error", message: "domain not verified" },
        });
      },
    };

    await expect(
      createResendMailSender({ apiKey: "k", emails }).send(REQUEST),
    ).rejects.toThrow(MailSendError);
    await expect(
      createResendMailSender({ apiKey: "k", emails }).send(REQUEST),
    ).rejects.toMatchObject({
      code: "validation_error",
      message: "domain not verified",
    });
  });

  it("turns a thrown network error into a MailSendError too", async () => {
    const emails: ResendEmailsApi = {
      send: () => Promise.reject(new Error("socket hang up")),
    };

    await expect(
      createResendMailSender({ apiKey: "k", emails }).send(REQUEST),
    ).rejects.toMatchObject({ code: "provider_unreachable" });
  });
});
```

- [ ] **Step 5: Write the sender**

```ts
// apps/server/src/mail/sender.ts
import { Resend } from "resend";

/** One message, rendered and addressed, ready to hand to the provider. */
export type MailSendRequest = {
  /** The full identity, for example `My Shoebox <shoebox@example.com>`. */
  from: string;
  to: string;
  subject: string;
  html: string;
  /** The plain-text alternative. Never omitted: for some members in this
   * audience it is the only version that ever arrives. */
  text: string;
  /** The row's own `idempotency_key`, so a retry cannot duplicate a send that
   * in fact succeeded and whose response we lost. */
  idempotencyKey: string;
};

/** What the provider said about one accepted message. */
export type MailSendResult = {
  providerMessageId: string | null;
};

/** Sends one message. The one seam every test substitutes. */
export type MailSender = {
  send: (request: MailSendRequest) => Promise<MailSendResult>;
};

/**
 * A refusal, carrying the provider's own vocabulary.
 *
 * The code is **not** constrained to a list: the provider owns that
 * vocabulary, and `outbound_emails.last_error_code` carries it through
 * verbatim to the admin banner rather than parsing it
 * (migration `0007_operations_and_audit.ts`).
 */
export class MailSendError extends Error {
  readonly code: string;

  constructor(options: { code: string; message: string }) {
    super(options.message);
    this.name = "MailSendError";
    this.code = options.code;
  }
}

/** The slice of the Resend SDK this uses, so a test can stand in for it. */
export type ResendEmailsApi = {
  send: (
    payload: {
      from: string;
      to: string[];
      subject: string;
      html: string;
      text: string;
    },
    options: { idempotencyKey: string },
  ) => Promise<{
    data: { id: string } | null;
    error: { name?: string; message: string } | null;
  }>;
};

/**
 * Builds the Resend-backed sender.
 *
 * The provider's own idempotency key is passed as well as our unique index,
 * and the two guard different things: the index stops a retried **handler**
 * writing a second row, and this stops a retried **send** of one row
 * duplicating a message whose success we did not hear about. Resend's keys
 * expire after 24 hours, which is longer than this worker's whole retry
 * schedule.
 *
 * @param options.apiKey From `RESEND_API_KEY`.
 * @param options.emails Overridable so a test never reaches the network.
 */
export function createResendMailSender(options: {
  apiKey: string;
  emails?: ResendEmailsApi;
}): MailSender {
  const emails =
    options.emails ?? (new Resend(options.apiKey).emails as ResendEmailsApi);

  return {
    send: async (request) => {
      let response: Awaited<ReturnType<ResendEmailsApi["send"]>>;
      try {
        response = await emails.send(
          {
            from: request.from,
            to: [request.to],
            subject: request.subject,
            html: request.html,
            text: request.text,
          },
          { idempotencyKey: request.idempotencyKey },
        );
      } catch (error: unknown) {
        throw new MailSendError({
          code: "provider_unreachable",
          message: error instanceof Error ? error.message : String(error),
        });
      }

      if (response.error !== null) {
        throw new MailSendError({
          code: response.error.name ?? "provider_rejected",
          message: response.error.message,
        });
      }

      return { providerMessageId: response.data?.id ?? null };
    },
  };
}
```

- [ ] **Step 6: Write the recording double**

```ts
// apps/server/test/helpers/recordingMailSender.ts
import {
  MailSendError,
  type MailSender,
  type MailSendRequest,
} from "../../src/mail/sender.ts";

/** A `MailSender` that records and never sends. */
export type RecordingMailSender = MailSender & {
  readonly sent: readonly MailSendRequest[];
  /** Set to make the next and every later send fail with this code. */
  failWith: { code: string; message: string } | null;
};

/**
 * Builds the only sender any test uses.
 *
 * There is no path from the test suite to a mail provider, deliberately: the
 * repository holds no key, and a test that somehow constructed the real sender
 * would be sending with a placeholder.
 */
export function createRecordingMailSender(): RecordingMailSender {
  const sent: MailSendRequest[] = [];
  const sender: RecordingMailSender = {
    sent,
    failWith: null,
    send: (request) => {
      if (sender.failWith !== null) {
        return Promise.reject(new MailSendError(sender.failWith));
      }
      sent.push(request);
      return Promise.resolve({ providerMessageId: `fake-${sent.length}` });
    },
  };
  return sender;
}
```

- [ ] **Step 7: Run and watch it pass**

Run: `pnpm --filter @memory-shoebox/server exec vitest run test/mail/sender.test.ts test/config.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/server/package.json apps/server/src/config.ts apps/server/src/mail/sender.ts apps/server/.env.example apps/server/test/mail/sender.test.ts apps/server/test/config.test.ts apps/server/test/helpers/recordingMailSender.ts pnpm-lock.yaml
git commit -m "feat(server): the Resend sender, behind an interface tests substitute

RESEND_API_KEY is optional: a Shoebox with no key starts and serves, and its
mail waits. Refusing to boot would make first-run setup impossible, since an
admin has to reach the settings surface to configure mail at all.

MAIL_FROM is gone from .env.example. The sending identity is the
mail.from_address and mail.from_name settings, so the health banner has one
place to point at.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 20: The mail worker

**Files:**
- Create: `apps/server/src/mail/worker.ts`
- Test: `apps/server/test/mail/worker.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/server/test/mail/worker.test.ts
import { describe, expect, it } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import { createId } from "../../src/db/ids.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { enqueueEmail } from "../../src/mail/enqueue.ts";
import { runMailQueueOnce } from "../../src/mail/worker.ts";
import { createRecordingMailSender } from "../helpers/recordingMailSender.ts";
import {
  NOW,
  insertInstanceSetting,
  insertOutboundEmail,
  shiftMinutes,
} from "../helpers/seed.ts";

async function createContext(options: { configured?: boolean } = {}) {
  const database = createDatabase(":memory:");
  await migrateToLatest(database);
  await insertInstanceSetting(database, {
    key: "public.base_url",
    value: "https://shoebox.example",
  });
  if (options.configured !== false) {
    await insertInstanceSetting(database, {
      key: "mail.from_address",
      value: "shoebox@example.com",
    });
    await insertInstanceSetting(database, {
      key: "mail.from_name",
      value: "My Shoebox",
    });
  }
  return { database, sender: createRecordingMailSender() };
}

async function queueSignInCode(
  database: Awaited<ReturnType<typeof createContext>>["database"],
) {
  const codeId = createId();
  await enqueueEmail({
    executor: database,
    now: NOW,
    input: {
      kind: "sign_in_code",
      toAddress: "rosa@example.com",
      toMemberId: null,
      toDisplayName: "Abuela Rosa",
      idempotencyKey: `signin:${codeId}`,
      payload: {
        code: "410233",
        expiresAt: shiftMinutes(NOW, 10),
        expiresInMinutes: 10,
      },
      triggerKind: "sign_in_code",
      triggerId: codeId,
    },
  });
}

describe("the mail worker", () => {
  it("does nothing against an empty queue", async () => {
    const { database, sender } = await createContext();

    const summary = await runMailQueueOnce({ database, sender, now: NOW });

    expect(summary).toEqual({
      sentCount: 0,
      failedCount: 0,
      suppressedCount: 0,
      deferredCount: 0,
    });
    expect(sender.sent).toEqual([]);
    await database.destroy();
  });

  it("sends a queued message and marks it sent", async () => {
    const { database, sender } = await createContext();
    await queueSignInCode(database);

    const summary = await runMailQueueOnce({ database, sender, now: NOW });

    expect(summary.sentCount).toBe(1);
    expect(sender.sent[0].from).toBe("My Shoebox <shoebox@example.com>");
    expect(sender.sent[0].to).toBe("rosa@example.com");
    expect(sender.sent[0].subject).toBe("Your code is 410233");
    expect(sender.sent[0].html).toContain("410233");
    expect(sender.sent[0].text).toContain("410233");

    const row = await database
      .selectFrom("outbound_emails")
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(row.state).toBe("sent");
    expect(row.sent_at).toBe(NOW);
    expect(row.from_address).toBe("shoebox@example.com");
    expect(row.provider_message_id).toBe("fake-1");
    await database.destroy();
  });

  it("scrubs both payload_json and subject on a terminal sign_in_code row", async () => {
    const { database, sender } = await createContext();
    await queueSignInCode(database);

    await runMailQueueOnce({ database, sender, now: NOW });

    const row = await database
      .selectFrom("outbound_emails")
      .select(["payload_json", "subject"])
      .executeTakeFirstOrThrow();
    expect(row.payload_json).toBe("{}");
    expect(row.subject).toBe("Your code");
    await database.destroy();
  });

  it("claims each row once, so a second run finds nothing", async () => {
    const { database, sender } = await createContext();
    await queueSignInCode(database);

    await runMailQueueOnce({ database, sender, now: NOW });
    const second = await runMailQueueOnce({ database, sender, now: NOW });

    expect(second.sentCount).toBe(0);
    expect(sender.sent).toHaveLength(1);
    await database.destroy();
  });

  it("leaves a row whose send_after has not arrived", async () => {
    const { database, sender } = await createContext();
    await insertOutboundEmail(database, {
      send_after: shiftMinutes(NOW, 60),
    });

    const summary = await runMailQueueOnce({ database, sender, now: NOW });

    expect(summary.sentCount).toBe(0);
    await database.destroy();
  });

  it("suppresses a non-sign-in message to a suppressed address, without sending", async () => {
    const { database, sender } = await createContext();
    await database
      .insertInto("email_suppressions")
      .values({
        id: createId(),
        address: "rosa@example.com",
        reason: "complained",
        created_at: NOW,
        cleared_at: null,
      })
      .execute();
    await insertOutboundEmail(database, {
      kind: "comment",
      trigger_kind: "comment",
      idempotency_key: "comment:one:two",
    });

    const summary = await runMailQueueOnce({ database, sender, now: NOW });

    expect(summary.suppressedCount).toBe(1);
    expect(sender.sent).toEqual([]);
    const row = await database
      .selectFrom("outbound_emails")
      .select("state")
      .executeTakeFirstOrThrow();
    expect(row.state).toBe("suppressed");
    await database.destroy();
  });

  it("still sends a sign-in code to a suppressed address", async () => {
    const { database, sender } = await createContext();
    await database
      .insertInto("email_suppressions")
      .values({
        id: createId(),
        address: "rosa@example.com",
        reason: "complained",
        created_at: NOW,
        cleared_at: null,
      })
      .execute();
    await queueSignInCode(database);

    const summary = await runMailQueueOnce({ database, sender, now: NOW });

    expect(summary.sentCount).toBe(1);
    await database.destroy();
  });

  it("defers rather than spending an attempt when mail.from_address is unset", async () => {
    const { database, sender } = await createContext({ configured: false });
    await queueSignInCode(database);

    const summary = await runMailQueueOnce({ database, sender, now: NOW });

    expect(summary).toMatchObject({ deferredCount: 1, sentCount: 0 });
    const row = await database
      .selectFrom("outbound_emails")
      .select(["state", "attempts", "last_error_code", "next_attempt_at"])
      .executeTakeFirstOrThrow();
    expect(row.state).toBe("queued");
    expect(row.attempts).toBe(0);
    expect(row.last_error_code).toBe("from_address_unset");
    expect(row.next_attempt_at).toBe(shiftMinutes(NOW, 5));
    await database.destroy();
  });

  it("defers the same way when there is no API key at all", async () => {
    const { database } = await createContext();
    await queueSignInCode(database);

    const summary = await runMailQueueOnce({ database, sender: null, now: NOW });

    expect(summary.deferredCount).toBe(1);
    const row = await database
      .selectFrom("outbound_emails")
      .select(["state", "attempts", "last_error_code"])
      .executeTakeFirstOrThrow();
    expect(row.state).toBe("queued");
    expect(row.attempts).toBe(0);
    expect(row.last_error_code).toBe("provider_unconfigured");
    await database.destroy();
  });

  it("backs off a refusal, and gives up after the fifth attempt", async () => {
    const { database, sender } = await createContext();
    await queueSignInCode(database);
    sender.failWith = { code: "validation_error", message: "domain not verified" };

    const backoffMinutes = [1, 5, 25, 120];
    let at = NOW;
    for (const [index, minutes] of backoffMinutes.entries()) {
      const summary = await runMailQueueOnce({ database, sender, now: at });
      expect(summary.failedCount).toBe(1);
      const row = await database
        .selectFrom("outbound_emails")
        .select(["state", "attempts", "next_attempt_at", "last_error_code"])
        .executeTakeFirstOrThrow();
      expect(row.state).toBe("queued");
      expect(row.attempts).toBe(index + 1);
      expect(row.last_error_code).toBe("validation_error");
      expect(row.next_attempt_at).toBe(shiftMinutes(at, minutes));
      at = shiftMinutes(at, minutes);
    }

    await runMailQueueOnce({ database, sender, now: at });

    const row = await database
      .selectFrom("outbound_emails")
      .select(["state", "attempts", "payload_json", "subject"])
      .executeTakeFirstOrThrow();
    expect(row.state).toBe("failed");
    expect(row.attempts).toBe(5);
    expect(row.payload_json).toBe("{}");
    expect(row.subject).toBe("Your code");
    await database.destroy();
  });

  it("fails a kind whose copy has not been written yet", async () => {
    const { database, sender } = await createContext();
    await insertOutboundEmail(database, {
      kind: "comment",
      trigger_kind: "comment",
      idempotency_key: "comment:one:two",
    });

    const summary = await runMailQueueOnce({ database, sender, now: NOW });

    expect(summary.failedCount).toBe(1);
    const row = await database
      .selectFrom("outbound_emails")
      .select(["state", "last_error_code"])
      .executeTakeFirstOrThrow();
    expect(row.state).toBe("failed");
    expect(row.last_error_code).toBe("no_template");
    await database.destroy();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @memory-shoebox/server exec vitest run test/mail/worker.test.ts`
Expected: FAIL, unresolved import.

- [ ] **Step 3: Write the worker**

```ts
// apps/server/src/mail/worker.ts
import type { Kysely, UpdateObject } from "kysely";
import type { Database } from "../db/types.ts";
import { readInstanceSettings } from "../settings/instanceSettings.ts";
import { MailSendError, type MailSender } from "./sender.ts";
import { EMAIL_TEMPLATES, type BuiltEmailKind } from "./templates/registry.ts";

/** What one pass over the queue did. */
export type MailWorkerSummary = {
  sentCount: number;
  failedCount: number;
  suppressedCount: number;
  /** Rows put back because the instance is not configured to send yet. */
  deferredCount: number;
};

/** How many rows one pass claims. */
const BATCH_SIZE = 20;

/**
 * One minute, five, twenty-five, then two hours, and then it is over.
 *
 * Long enough to ride out a provider outage, short enough that a sign-in code
 * is either useful or dead well inside the ten minutes it is good for.
 */
const RETRY_BACKOFF_SECONDS = [60, 300, 1500, 7200];
const MAX_ATTEMPTS = RETRY_BACKOFF_SECONDS.length + 1;

/** How long a row waits when the instance is not configured to send. */
const CONFIGURATION_RETRY_SECONDS = 300;

/** The subject a scrubbed sign-in code row keeps. */
const SCRUBBED_SUBJECT = "Your code";

function _shift(now: string, seconds: number): string {
  return new Date(Date.parse(now) + seconds * 1000).toISOString();
}

/**
 * The scrub `data-models.md` § `outbound_emails` requires on a terminal
 * `sign_in_code` row.
 *
 * **Both columns, not one.** The six digits are deliberately in the subject
 * line so the code reads off a lock screen, which makes `subject` the more
 * exposed of the two: scrubbing `payload_json` alone would leave a permanent
 * log of live-looking codes sitting beside the address each was sent to.
 * Both are rewritten rather than nulled, because both are `NOT NULL`.
 */
function _scrubFor(kind: string): UpdateObject<Database, "outbound_emails"> {
  return kind === "sign_in_code"
    ? { payload_json: "{}", subject: SCRUBBED_SUBJECT }
    : {};
}

/**
 * Runs one pass over `outbound_emails`.
 *
 * **The claim is the whole of the concurrency control**
 * (`apis/notifications.md` § Claiming, retrying and scrubbing): SQLite
 * serialises writers, so of two workers reaching the same row exactly one sees
 * `changes() = 1` and the other moves on. Nothing else is needed and nothing
 * else is used.
 *
 * The order of the checks is load-bearing. Suppression is tested **before**
 * the template lookup, so a message to an address the provider has told us to
 * stop writing to is marked `suppressed` whether or not its copy exists yet.
 * And the suppression check is skipped for `sign_in_code`, and only for
 * `sign_in_code`: a spam complaint must never lock a family member out of
 * their own archive, and the repeated failure is itself the diagnostic.
 *
 * @param options.sender Null when `RESEND_API_KEY` is unset.
 */
export async function runMailQueueOnce(options: {
  database: Kysely<Database>;
  sender: MailSender | null;
  now: string;
  batchSize?: number;
}): Promise<MailWorkerSummary> {
  const { database, sender, now } = options;
  const summary: MailWorkerSummary = {
    sentCount: 0,
    failedCount: 0,
    suppressedCount: 0,
    deferredCount: 0,
  };

  const settings = await readInstanceSettings(database, [
    "mail.from_address",
    "mail.from_name",
  ]);
  const fromAddress = settings["mail.from_address"];
  const fromName = settings["mail.from_name"];

  const eligible = await database
    .selectFrom("outbound_emails")
    .selectAll()
    .where("state", "=", "queued")
    .where("send_after", "<=", now)
    .where((eb) => {
      return eb.or([
        eb("next_attempt_at", "is", null),
        eb("next_attempt_at", "<=", now),
      ]);
    })
    .orderBy("send_after", "asc")
    .limit(options.batchSize ?? BATCH_SIZE)
    .execute();

  const finalize = async (
    id: string,
    values: UpdateObject<Database, "outbound_emails">,
  ): Promise<void> => {
    await database
      .updateTable("outbound_emails")
      .set(values)
      .where("id", "=", id)
      .execute();
  };

  for (const row of eligible) {
    const claimed = await database
      .updateTable("outbound_emails")
      .set({ state: "sending" })
      .where("id", "=", row.id)
      .where("state", "=", "queued")
      .executeTakeFirst();
    if (Number(claimed.numUpdatedRows) !== 1) {
      continue;
    }

    if (row.kind !== "sign_in_code") {
      const suppression = await database
        .selectFrom("email_suppressions")
        .select("id")
        .where("address", "=", row.to_address)
        .where("cleared_at", "is", null)
        .executeTakeFirst();
      if (suppression !== undefined) {
        await finalize(row.id, {
          state: "suppressed",
          last_error_code: "address_suppressed",
          last_error_message: "The provider has asked us to stop writing to this address.",
          ..._scrubFor(row.kind),
        });
        summary.suppressedCount += 1;
        continue;
      }
    }

    // A configuration gap is not a delivery attempt. The row goes back to
    // `queued` with its attempts untouched, so the queue drains by itself the
    // moment an admin fills the setting in, rather than having burned all five
    // attempts in the two and a half hours they spent reading the setup page.
    const configurationProblem =
      fromAddress === null
        ? "from_address_unset"
        : sender === null
          ? "provider_unconfigured"
          : null;
    if (configurationProblem !== null || fromAddress === null || sender === null) {
      await finalize(row.id, {
        state: "queued",
        next_attempt_at: _shift(now, CONFIGURATION_RETRY_SECONDS),
        last_error_code: configurationProblem,
        last_error_message: "Mail is not configured, so nothing was attempted.",
      });
      summary.deferredCount += 1;
      continue;
    }

    const template = EMAIL_TEMPLATES[row.kind as BuiltEmailKind] as
      | (typeof EMAIL_TEMPLATES)[BuiltEmailKind]
      | undefined;
    if (template === undefined) {
      await finalize(row.id, {
        state: "failed",
        last_error_code: "no_template",
        last_error_message: `No copy is written for ${row.kind} yet.`,
      });
      summary.failedCount += 1;
      continue;
    }

    try {
      const payload: unknown = JSON.parse(row.payload_json);
      const result = await sender.send({
        from: fromName === null ? fromAddress : `${fromName} <${fromAddress}>`,
        to: row.to_address,
        subject: row.subject,
        html: template.html(payload as never),
        text: template.text(payload as never),
        idempotencyKey: row.idempotency_key,
      });
      await finalize(row.id, {
        state: "sent",
        sent_at: now,
        from_address: fromAddress,
        provider_message_id: result.providerMessageId,
        last_error_code: null,
        last_error_message: null,
        ..._scrubFor(row.kind),
      });
      summary.sentCount += 1;
    } catch (error: unknown) {
      const attempts = row.attempts + 1;
      const isTerminal = attempts >= MAX_ATTEMPTS;
      const code =
        error instanceof MailSendError ? error.code : "render_failed";
      await finalize(row.id, {
        state: isTerminal ? "failed" : "queued",
        attempts,
        next_attempt_at: isTerminal
          ? null
          : _shift(now, RETRY_BACKOFF_SECONDS[attempts - 1]),
        last_error_code: code,
        last_error_message:
          error instanceof Error ? error.message : String(error),
        ...(isTerminal ? _scrubFor(row.kind) : {}),
      });
      summary.failedCount += 1;
    }
  }

  return summary;
}
```

The `configurationProblem !== null || fromAddress === null || sender === null`
condition is redundant on purpose: the first clause is the check, and the two
that follow are what narrows `fromAddress` and `sender` for TypeScript below.
If TypeScript narrows without them, delete them.

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm --filter @memory-shoebox/server exec vitest run test/mail/worker.test.ts`
Expected: PASS, eleven tests.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/mail/worker.ts apps/server/test/mail/worker.test.ts
git commit -m "feat(server): the mail worker

Claim with a conditional UPDATE and proceed only on changes() = 1, which is
the whole of the concurrency control. Suppression is checked before the
template lookup and skipped for sign_in_code, and only for sign_in_code: a
spam complaint must never lock a family member out of their own archive.

A configuration gap defers without spending an attempt, so a queue drains
itself once an admin fills the setting in. A provider refusal backs off
1m/5m/25m/2h and is terminal after five.

A terminal sign_in_code row has both payload_json and subject scrubbed,
because the digits are deliberately in the subject line.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 21: Queue health, and putting the worker on the runner

**Files:**
- Create: `apps/server/src/mail/health.ts`
- Create: `apps/server/src/mail/queueJob.ts`
- Modify: `apps/server/src/app.ts`
- Test: `apps/server/test/mail/health.test.ts`
- Test: `apps/server/test/mail/queueJob.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// apps/server/test/mail/health.test.ts
import { describe, expect, it } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { readMailQueueHealth } from "../../src/mail/health.ts";
import { NOW, insertOutboundEmail, shiftDays, shiftMinutes } from "../helpers/seed.ts";

async function createEmptyDatabase() {
  const database = createDatabase(":memory:");
  await migrateToLatest(database);
  return database;
}

describe("readMailQueueHealth", () => {
  it("answers on a fresh Shoebox with nothing in the table", async () => {
    const database = await createEmptyDatabase();

    const health = await readMailQueueHealth({ database, now: NOW });

    expect(health).toEqual({
      queuedCount: 0,
      failedCount: 0,
      suppressedCount: 0,
      sentLast24hCount: 0,
      oldestQueuedAt: null,
      lastSentAt: null,
      lastFailedAt: null,
    });
    await database.destroy();
  });

  it("counts each state and finds the oldest queued row", async () => {
    const database = await createEmptyDatabase();
    await insertOutboundEmail(database, {
      idempotency_key: "a",
      state: "queued",
      created_at: shiftMinutes(NOW, -180),
    });
    await insertOutboundEmail(database, {
      idempotency_key: "b",
      state: "queued",
      created_at: shiftMinutes(NOW, -10),
    });
    await insertOutboundEmail(database, {
      idempotency_key: "c",
      state: "failed",
      created_at: shiftMinutes(NOW, -30),
    });
    await insertOutboundEmail(database, {
      idempotency_key: "d",
      state: "suppressed",
    });
    await insertOutboundEmail(database, {
      idempotency_key: "e",
      state: "sent",
      sent_at: shiftMinutes(NOW, -5),
    });
    await insertOutboundEmail(database, {
      idempotency_key: "f",
      state: "sent",
      sent_at: shiftDays(NOW, -3),
    });

    const health = await readMailQueueHealth({ database, now: NOW });

    expect(health).toEqual({
      queuedCount: 2,
      failedCount: 1,
      suppressedCount: 1,
      sentLast24hCount: 1,
      oldestQueuedAt: shiftMinutes(NOW, -180),
      lastSentAt: shiftMinutes(NOW, -5),
      lastFailedAt: shiftMinutes(NOW, -30),
    });
    await database.destroy();
  });
});
```

```ts
// apps/server/test/mail/queueJob.test.ts
import { describe, expect, it } from "vitest";
import { createTestApp } from "../helpers/testApp.ts";
import { createRecordingMailSender } from "../helpers/recordingMailSender.ts";

describe("the mail queue on the runner", () => {
  it("is registered at ten seconds, beside but not among the seven jobs", async () => {
    const context = await createTestApp({
      mailSender: createRecordingMailSender(),
    });

    // It runs, which is the point: `runOnce` throws on an unknown name.
    await context.app.jobRunner.runOnce("mail-queue");

    await context.close();
  });

  it("has no sender when RESEND_API_KEY is unset, and still starts", async () => {
    const context = await createTestApp();

    expect(context.app.mailSender).toBeNull();
    const response = await context.app.inject({
      method: "GET",
      url: "/api/health",
    });
    expect(response.statusCode).toBe(200);

    await context.close();
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm --filter @memory-shoebox/server exec vitest run test/mail/health.test.ts test/mail/queueJob.test.ts`
Expected: FAIL, unresolved imports.

- [ ] **Step 3: Write the health read**

```ts
// apps/server/src/mail/health.ts
import { sql, type Kysely } from "kysely";
import type { MailQueueHealth } from "@memory-shoebox/shared";
import type { Database } from "../db/types.ts";

/**
 * What is sitting in `outbound_emails` right now.
 *
 * **There is no mail-status table** (`data-models.md` § `outbound_emails`):
 * everything the admin banner prints is a query over this one, which is why
 * migration 0007 carries `(state, created_at)`.
 *
 * `GET /api/mail/health`'s **diagnosis ladder** is not here. Two of its five
 * rungs need domain verification, which step 8a owns along with the route.
 * This is the part that falls out of the worker's own indexes.
 *
 * **`lastFailedAt` is the failing row's `created_at`, not the moment it
 * failed**, because no column records the latter: `sent_at` exists and a
 * `failed_at` does not. On a queue that drains in minutes the two are close,
 * and step 8a should decide whether the banner needs better than that before
 * adding a column for it.
 *
 * No formatted or relative string comes out of here. The surface's "has not
 * gone out for three hours" is computed in the browser from `oldestQueuedAt`.
 */
export async function readMailQueueHealth(options: {
  database: Kysely<Database>;
  now: string;
}): Promise<MailQueueHealth> {
  const byState = await options.database
    .selectFrom("outbound_emails")
    .select(({ fn }) => {
      return [
        "state",
        fn.countAll<number>().as("count"),
        fn.min<string | null>("created_at").as("oldestCreatedAt"),
        fn.max<string | null>("created_at").as("newestCreatedAt"),
        fn.max<string | null>("sent_at").as("lastSentAt"),
      ];
    })
    .groupBy("state")
    .execute();

  const forState = (state: string) => {
    return byState.find((row) => row.state === state);
  };

  const dayAgo = new Date(Date.parse(options.now) - 86_400_000).toISOString();
  const sentRecently = await options.database
    .selectFrom("outbound_emails")
    .select(({ fn }) => fn.countAll<number>().as("count"))
    .where("state", "=", "sent")
    .where("sent_at", ">", dayAgo)
    .executeTakeFirstOrThrow();

  return {
    queuedCount: forState("queued")?.count ?? 0,
    failedCount: forState("failed")?.count ?? 0,
    suppressedCount: forState("suppressed")?.count ?? 0,
    sentLast24hCount: Number(sentRecently.count),
    oldestQueuedAt: forState("queued")?.oldestCreatedAt ?? null,
    lastSentAt: forState("sent")?.lastSentAt ?? null,
    lastFailedAt: forState("failed")?.newestCreatedAt ?? null,
  };
}
```

If Kysely's `fn.min` / `fn.max` typing fights the nullable column, fall back to
`sql<string | null>\`min(created_at)\`.as("oldestCreatedAt")` with `sql`
imported from kysely.

- [ ] **Step 4: Write the queue job**

```ts
// apps/server/src/mail/queueJob.ts
import type { Kysely } from "kysely";
import type { Database } from "../db/types.ts";
import type { Job } from "../jobs/runner.ts";
import type { MailSender } from "./sender.ts";
import { runMailQueueOnce } from "./worker.ts";

/** Ten seconds. */
const MAIL_QUEUE_INTERVAL_MS = 10_000;

/**
 * The mail queue, driven on the same runner as the seven jobs.
 *
 * **It is not one of the seven.** `conventions.md` § The job runner names a
 * closed set, and this is not in it: its cadence is seconds where theirs are
 * minutes, and a slice citing "the seven jobs" should find seven. It shares
 * the runner only because the runner already owns the things a loop like this
 * needs: an overlap guard, a failure that is logged rather than fatal, and a
 * stop that waits.
 *
 * Ten seconds, and no immediate kick after an enqueue. That keeps
 * `enqueueEmail` a plain write inside somebody else's transaction, with
 * nothing to fire after a commit that may yet roll back, and the worst case
 * for a sign-in code is ten seconds on top of the provider's own latency.
 */
export function createMailQueueJob(deps: {
  database: Kysely<Database>;
  sender: MailSender | null;
  clock?: () => Date;
}): Job {
  const clock = deps.clock ?? (() => new Date());

  return {
    name: "mail-queue",
    intervalMs: MAIL_QUEUE_INTERVAL_MS,
    run: async () => {
      await runMailQueueOnce({
        database: deps.database,
        sender: deps.sender,
        now: clock().toISOString(),
      });
    },
  };
}
```

- [ ] **Step 5: Wire both into `createApp`**

```ts
// apps/server/src/app.ts, in the module declaration
    mailSender: MailSender | null;
```

```ts
// apps/server/src/app.ts, in AppDeps
  /**
   * Overridable so a test substitutes a recording double. Null means the
   * instance has no `RESEND_API_KEY`, which is a state it runs in perfectly
   * well: mail waits.
   */
  mailSender?: MailSender | null;
```

```ts
// apps/server/src/app.ts, replacing the jobRunner construction
  const mailSender =
    deps.mailSender !== undefined
      ? deps.mailSender
      : deps.config.resendApiKey === undefined
        ? null
        : createResendMailSender({ apiKey: deps.config.resendApiKey });
  app.decorate("mailSender", mailSender);

  const jobRunner = createJobRunner({
    jobs: [
      ...createJobRegistry({ database: deps.database, b2, clock: deps.clock }),
      createMailQueueJob({
        database: deps.database,
        sender: mailSender,
        clock: deps.clock,
      }),
    ],
    logger: app.log,
  });
```

- [ ] **Step 6: Run and watch them pass**

Run: `pnpm --filter @memory-shoebox/server exec vitest run test/mail/`
Expected: PASS, every mail suite.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/mail/health.ts apps/server/src/mail/queueJob.ts apps/server/src/app.ts apps/server/test/mail/health.test.ts apps/server/test/mail/queueJob.test.ts
git commit -m "feat(server): mail queue health, and the worker on the runner

readMailQueueHealth is the part of GET /api/mail/health that falls out of the
worker's own indexes; the diagnosis ladder stays with step 8a and the route,
because two of its rungs need domain verification.

The queue runs on the job runner at ten seconds and is deliberately not one of
the seven: it shares the plumbing, not the list.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 22: The forbidden-payload guard

The step's verification list asks for "a test that no payload contains
anything from `conventions.md` § Forbidden in any payload: no raw storage key,
no IP, no formatted date except the one sanctioned place".

**This is a test helper and not a runtime check**, for a specific reason. A
scanner strict enough to catch "14 September 2026" also catches it inside a
comment body, which `CommentEmailPayload` carries verbatim by design
(Decision 8), so a runtime version would throw on a legitimate message. It runs
over payloads the templates build, and skips the fields the contract documents
as somebody's own words.

**Files:**
- Create: `apps/server/test/helpers/forbiddenPayloadValues.ts`
- Test: `apps/server/test/mail/forbiddenPayload.test.ts`

- [ ] **Step 1: Write the guard**

```ts
// apps/server/test/helpers/forbiddenPayloadValues.ts

/**
 * Fields the contract documents as a person's own words, reproduced verbatim.
 *
 * A comment body may legitimately say "see you on 14 September", and a removal
 * reason may name a date. Scanning them would be scanning the message rather
 * than the metadata.
 */
const VERBATIM_FIELDS = ["body", "reason", "declineReason"];

/** A storage key: a path with a media extension on the end. */
const STORAGE_KEY = /[\w.-]+\/[\w./-]+\.(?:jpe?g|png|heic|heif|webp|gif|mp4|mov|webm|m4v)$/i;

/** An IPv4 address, or something with enough colon-separated hex to be IPv6. */
const IP_ADDRESS = /(?:\b\d{1,3}(?:\.\d{1,3}){3}\b)|(?:\b(?:[0-9a-f]{1,4}:){3,7}[0-9a-f]{1,4}\b)/i;

/** A month name, a weekday, or a relative phrase: a formatted date. */
const FORMATTED_DATE =
  /\b(?:January|February|March|April|May|June|July|August|September|October|November|December|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b|\b\d+\s+(?:second|minute|hour|day|week|month|year)s?\s+ago\b|\b(?:Today|Yesterday|Tomorrow)\b/i;

/** One value that should not be in a payload, and why. */
export type ForbiddenPayloadValue = {
  path: string;
  value: string;
  reason: "storage_key" | "ip_address" | "formatted_date";
};

/**
 * Walks a payload and reports anything `conventions.md` § Forbidden in any
 * payload rules out.
 *
 * Three of the six rules in that section are checkable mechanically: a raw
 * storage key, an IP address, and a formatted or relative date string. The
 * other three (a count served from a stored column, a `memberId` in the people
 * directory, a field distinguishing an empty archive from an invisible one)
 * are about where a number came from rather than what it looks like, and no
 * scanner can see that.
 *
 * A URL is exempt from the storage-key rule: every payload carries one by
 * design, and it is a signed or absolute URL rather than a key.
 */
export function findForbiddenPayloadValues(
  payload: unknown,
  path = "",
): readonly ForbiddenPayloadValue[] {
  if (typeof payload === "string") {
    const field = path.split(".").pop() ?? "";
    if (VERBATIM_FIELDS.includes(field)) {
      return [];
    }
    const found: ForbiddenPayloadValue[] = [];
    const isUrl = /^https?:\/\//i.test(payload);
    if (!isUrl && STORAGE_KEY.test(payload)) {
      found.push({ path, value: payload, reason: "storage_key" });
    }
    if (!isUrl && IP_ADDRESS.test(payload)) {
      found.push({ path, value: payload, reason: "ip_address" });
    }
    if (FORMATTED_DATE.test(payload)) {
      found.push({ path, value: payload, reason: "formatted_date" });
    }
    return found;
  }

  if (Array.isArray(payload)) {
    return payload.flatMap((entry, index) => {
      return findForbiddenPayloadValues(entry, `${path}[${index}]`);
    });
  }

  if (typeof payload === "object" && payload !== null) {
    return Object.entries(payload).flatMap(([key, value]) => {
      return findForbiddenPayloadValues(
        value,
        path === "" ? key : `${path}.${key}`,
      );
    });
  }

  return [];
}
```

- [ ] **Step 2: Write the test**

```ts
// apps/server/test/mail/forbiddenPayload.test.ts
import { describe, expect, it } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import { createId } from "../../src/db/ids.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { enqueueEmail } from "../../src/mail/enqueue.ts";
import { findForbiddenPayloadValues } from "../helpers/forbiddenPayloadValues.ts";
import { NOW, insertInstanceSetting, shiftMinutes } from "../helpers/seed.ts";

describe("findForbiddenPayloadValues", () => {
  it("catches a raw storage key, an address and a formatted date", () => {
    const found = findForbiddenPayloadValues({
      storageKey: "media/2026/09/IMG_0001.jpg",
      signedInFrom: "203.0.113.7",
      whenItHappened: "14 September 2026",
      lastSeen: "3 days ago",
    });

    expect(found.map((entry) => entry.reason).sort()).toEqual([
      "formatted_date",
      "formatted_date",
      "ip_address",
      "storage_key",
    ]);
  });

  it("leaves a signed URL and an ISO instant alone", () => {
    expect(
      findForbiddenPayloadValues({
        itemUrl: "https://shoebox.example/item/abc",
        capturedOn: "2026-09-14",
        createdAt: "2026-09-27T10:00:00.000Z",
      }),
    ).toEqual([]);
  });

  it("leaves a person's own words alone, because they are the message", () => {
    expect(
      findForbiddenPayloadValues({ body: "See you on 14 September!" }),
    ).toEqual([]);
  });
});

describe("what enqueueEmail actually writes", () => {
  it("writes no storage key, no address and no formatted date", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    await insertInstanceSetting(database, {
      key: "public.base_url",
      value: "https://shoebox.example",
    });
    const codeId = createId();
    await enqueueEmail({
      executor: database,
      now: NOW,
      input: {
        kind: "sign_in_code",
        toAddress: "rosa@example.com",
        toMemberId: null,
        toDisplayName: "Abuela Rosa",
        idempotencyKey: `signin:${codeId}`,
        payload: {
          code: "410233",
          expiresAt: shiftMinutes(NOW, 10),
          expiresInMinutes: 10,
        },
        triggerKind: "sign_in_code",
        triggerId: codeId,
      },
    });

    const row = await database
      .selectFrom("outbound_emails")
      .select("payload_json")
      .executeTakeFirstOrThrow();

    expect(
      findForbiddenPayloadValues(JSON.parse(row.payload_json)),
    ).toEqual([]);
    await database.destroy();
  });
});
```

**The sanctioned exception is the subject, not the payload.** `subject` holds
already-rendered English because that column is the message rather than a
payload (`apis/notifications.md` § Rules that hold for all nine), which is why
this test reads `payload_json` and not the row.

- [ ] **Step 3: Run it and watch it pass**

Run: `pnpm --filter @memory-shoebox/server exec vitest run test/mail/forbiddenPayload.test.ts`
Expected: PASS, four tests.

- [ ] **Step 4: Commit**

```bash
git add apps/server/test/helpers/forbiddenPayloadValues.ts apps/server/test/mail/forbiddenPayload.test.ts
git commit -m "test(server): nothing forbidden reaches a payload

A storage key, an IP address and a formatted date are the three rules in
conventions.md's forbidden list that a scanner can check. It is a test helper
rather than a runtime guard, because a scanner strict enough to catch
'14 September 2026' also catches it inside a comment body, which the contract
carries verbatim on purpose.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 23: Documentation

`AGENTS.md` makes this part of the definition of done, not an afterthought:
"Whenever you add, change, or remove a feature, module, route, data model, or
architectural boundary, create or update the relevant file(s) in `docs/` as
part of the same change."

**Files:**
- Create: `docs/mail.md`
- Modify: `docs/server.md`
- Modify: `docs/configuration.md`
- Modify: `docs/deployment.md`
- Modify: `docs/architecture.md`

- [ ] **Step 1: Write `docs/mail.md`**

A new topic doc. Cover, at the level of what the pieces are and why, never
restating a column list:

- **The queue is the log.** One `outbound_emails` table, both. Point at
  `data-models.md § outbound_emails` for the columns.
- **`enqueueEmail` never throws**, and what that buys: a batch settles while
  mail is down, and a sign-in code that could not be mailed still exists for
  the resend path. Name the `base_url_unset` row and say plainly that those
  messages are lost rather than retried.
- **It composes `EmailCommon` and derives the subject**, with the two-sentence
  reason, and a pointer to the step design for the full argument.
- **The template registry gates what may be enqueued**, and the table of which
  step brings which kind's copy.
- **Rendering takes the payload and nothing else**, with the mechanical test:
  if rendering would need a query, the payload is wrong.
- **Claim, retry, scrub**: the conditional `UPDATE`, the 1m/5m/25m/2h schedule
  with five attempts, the configuration-gap deferral that spends no attempt,
  and the scrub of **both** `payload_json` and `subject` on a terminal
  `sign_in_code` row, with the lock-screen reason.
- **Suppression bypasses `sign_in_code` and nothing else**, with the reason: a
  spam complaint must never lock a family member out of their own archive.
- **The sending identity is `mail.from_address` and `mail.from_name`**, not an
  environment variable, and why: one place for the health banner to point at.
- **No test ever sends.** `MailSender` is an interface; the repository holds no
  key.
- A short table of what each later step adds: the caller for `sign_in_code`
  (3a), `comment` (5a), `upload_session` (6a), the five removal messages (7a),
  `invitation` (8a), and the mail health route and its diagnosis ladder (8a).

- [ ] **Step 2: Extend `docs/server.md`**

Add four sections after "Configuration", and update the `Layout` tree at the
top of the file to include `http/`, `jobs/`, `mail/`, `settings/`, `time/` and
`visibility/`.

- **The request context.** `Viewer`, the `onRequest` hook, `requireViewer`, and
  that the authenticator is injected and arrives in step 3a.
- **Errors.** One envelope, the status table's source of truth is
  `conventions.md`, the 403/404 line in one sentence, and the rule that an
  unexpected error's own message never reaches the client.
- **Rate limits.** Applied in `preHandler`, never in a handler; a route names
  its rules in its route config; the default is 600 a minute per session;
  counters are in memory and the per-IP bucket is the only place an address is
  touched.
- **Background jobs.** The seven and their cadences, the mail queue beside but
  not among them, the overlap guard, and that the runner stops with the app on
  `SIGTERM`. Note the two seams later steps fill: the settle latch in
  `upload-abandon-sweep` (6a) and the enqueue in `removal-reminder` (7a).

Also update the "**One piece of debt worth naming**" paragraph under
§ Migrations: the `EVERYONE_VISIBILITY_RULE_ID` debt is paid, so it becomes a
sentence saying where the constant lives now and that migration 0002 imports
it.

- [ ] **Step 3: Update `docs/configuration.md`**

- Move `RESEND_API_KEY` from "Email, once authentication exists" into
  **Optional**, with the description: "Resend API key. Without it the server
  starts and serves normally and queued mail waits: nobody new can sign in
  until it is set, although everybody already signed in is unaffected."
- **Delete `MAIL_FROM` and the paragraph saying neither is read yet.** Replace
  the section with two sentences saying the sending identity is the
  `mail.from_address` and `mail.from_name` settings rather than an environment
  variable, and pointing at `docs/mail.md`.
- Add `upload.abandonGraceMinutes` to the § Product configuration table:
  default `30`, "How long a file may sit mid-transfer before
  `upload-abandon-sweep` marks it abandoned."

- [ ] **Step 4: Update `docs/deployment.md`**

Line 56 reads "Keep the key and the sending address for `RESEND_API_KEY` and
`MAIL_FROM`." Replace it with the key only, and a sentence saying the sending
address is set in the Shoebox's own settings after the first sign-in.

- [ ] **Step 5: Update `docs/architecture.md`**

§ What is not built yet says "no tables in the database" and
"`GET /api/health` is the only endpoint", and the second is still true while
the first is not. Rewrite the section to say: the schema is built (step 1) and
the server spine is built (step 2), `GET /api/health` remains the only route,
and there are no product features on top of it yet.

- [ ] **Step 6: Check for em dashes and commit**

```bash
grep -rn "—" docs/mail.md docs/server.md docs/configuration.md docs/deployment.md docs/architecture.md || echo "none"
git add docs/
git commit -m "docs: the server spine, and mail as its own topic

docs/mail.md is new. docs/server.md gains the request context, errors, rate
limits and background jobs, and its EVERYONE_VISIBILITY_RULE_ID debt note
becomes a statement of where the constant lives.

configuration.md drops MAIL_FROM: the sending identity is a setting, so the
mail health banner has one place to point at.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 24: Verification

- [ ] **Step 1: Run the whole check**

Run: `pnpm check`

That is `pnpm skills:check && pnpm format:check && pnpm lint && pnpm type-check && pnpm build && pnpm test`.

Expected: green throughout. Two things that commonly are not, and what to do:

- **`pnpm format:check` fails.** Run `pnpm format` and commit the result.
  oxfmt is the arbiter; do not hand-adjust to match it.
- **`pnpm skills:check` fails.** It passes on `main`, so a failure here is
  yours. Note that `pnpm install` in a fresh worktree prints an unrelated
  `impeccable install` HTTP 404 from the `postinstall` hook; that is a
  different command and does not affect `pnpm check`.

- [ ] **Step 2: Confirm each line of the step's verification list**

| The step asks for | Where it is |
| --- | --- |
| `pnpm check` green | Step 1 above |
| A test per job, run twice, second run changes nothing | `test/jobs/sweeps.test.ts`, `objectDeletionDrain.test.ts`, `uploadAbandonSweep.test.ts`, `removalReminder.test.ts`, and `registry.test.ts` for all seven against an empty database |
| `removal-reminder`'s arithmetic, `week_index >= 1` | `test/jobs/removalReminder.test.ts` |
| Two rows, one `idempotency_key`, rejected by the constraint | `test/mail/enqueue.test.ts` |
| A terminal `sign_in_code` row with both columns scrubbed | `test/mail/worker.test.ts` |
| A rendered email against the prototype, both forms | Task 17, step 7, by eye |
| No payload carries a storage key, an IP or a formatted date | `test/mail/forbiddenPayload.test.ts` |
| A `429` with `details.retryAfterSeconds` | `test/http/rateLimit/plugin.test.ts` |

- [ ] **Step 3: Confirm the server starts without a mail key**

```bash
cp apps/server/.env.example apps/server/.env.local
# Fill SESSION_SECRET and the B2_* values with anything non-empty; leave
# RESEND_API_KEY empty. Nothing here reaches Backblaze at boot.
pnpm dev:server
```

Expected: it listens on 8080, `curl localhost:8080/api/health` answers, and the
log carries no `remoteAddress`. Stop it with Ctrl-C and confirm the shutdown
line appears rather than the process hanging, which is the job runner stopping
cleanly.

- [ ] **Step 4: Request a review**

Use `superpowers:requesting-code-review` against the branch diff, then
`avandar-code-review` for the repository's own TypeScript, naming and
documentation conventions.

- [ ] **Step 5: Update the step file's status**

```bash
# docs/prds/2026-09-27-memory-shoebox/plan/step-2.md, line 3
# **Status:** not started   ->   **Status:** done
```

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore: step 2 is done

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## What this plan deliberately leaves to a later step

Named here so that a reviewer can tell an omission from a decision:

| Left out | Owned by | Why |
| --- | --- | --- |
| The session lookup behind `Authenticator` | 3a | `conventions.md` says "assume it exists; do not design it" |
| `sign_in_code`'s caller | 3a | The route that mints a code owns the enqueue call |
| The settle latch inside `upload-abandon-sweep` | 6a | `data-models.md` calls it the most important piece of upload plumbing the mockup does not show |
| `removal-reminder`'s enqueue call | 7a | It needs copy and a payload type that would be a guess today |
| Six of the seven kinds' copy and payload types | 5a, 6a, 7a, 8a | Each kind's copy belongs with the step that triggers it |
| `GET /api/mail/health`'s route and diagnosis ladder | 8a | Two rungs need domain verification |
| The `base_url_unset` requeue | 8a | It is triggered by **setting** `public.base_url`, which is a settings write, and settings writes are 8a's |
