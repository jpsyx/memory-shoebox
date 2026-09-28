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
