/**
 * The API contract shared by the server and the web app.
 *
 * Each endpoint contributes a Zod schema plus the type inferred from it, so
 * there is a single source of truth for every payload crossing the wire. The
 * web app parses responses with the schema; the server annotates its handlers
 * with the type.
 *
 * This file is a barrel and holds no definitions: the contract is large enough
 * that one file would be unreadable, and the import path stays
 * `@memory-shoebox/shared` either way. It is the one barrel
 * `docs/rules/typescript.md` permits, being a shared library package's
 * `index.ts`.
 *
 * **Every name is listed, and `export *` is not used.** The rule against
 * namespace exports has no barrel exception, and it earns its keep here: the
 * list below is the only place that says which module a symbol comes from, and
 * without it a name added to any of the seven files would join this package's
 * public contract without anybody deciding that it should.
 *
 * Both halves may import at runtime. The server runs TypeScript directly
 * through Node's type stripping, and a runtime import from this package has
 * been verified to load under it (`docs/shared.md`).
 */
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
  signInCodeSchema,
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
export {
  collectionSchema,
  cursorSchema,
  type CollectionShape,
} from "./collectionSchema.ts";
export {
  burstSummarySchema,
  calendarDateSchema,
  commentDtoSchema,
  idSchema,
  itemSummarySchema,
  mediaRefSchema,
  mediaSourceSchema,
  memberRefSchema,
  milestoneRefSchema,
  personRefSchema,
  reactionKindSchema,
  reactionSummarySchema,
  signedUrlSchema,
  tagRefSchema,
  timestampSchema,
  visibilitySummarySchema,
  type BurstSummary,
  type CommentDto,
  type ItemSummary,
  type MediaRef,
  type MediaSource,
  type MemberRef,
  type MilestoneRef,
  type PersonRef,
  type ReactionKind,
  type ReactionSummary,
  type TagRef,
  type VisibilitySummary,
} from "./dtos.ts";
export {
  emailCommonSchema,
  mailQueueHealthSchema,
  outboundEmailKindSchema,
  outboundEmailTriggerKindSchema,
  OUTBOUND_EMAIL_KINDS,
  OUTBOUND_EMAIL_STATES,
  signInCodeEmailPayloadSchema,
  type EmailCommon,
  type EnqueueEmailInput,
  type MailQueueHealth,
  type OutboundEmailKind,
  type OutboundEmailState,
  type OutboundEmailTriggerKind,
  type SignInCodeEmailPayload,
} from "./email.ts";
export {
  apiErrorDetailsSchema,
  apiErrorSchema,
  type ApiError,
  type ApiErrorDetails,
} from "./errors.ts";
export { healthResponseSchema, type HealthResponse } from "./health.ts";
export { LIMITS } from "./limits.ts";
export {
  getSettingValueFromStoredValue,
  ianaTimezoneSchema,
  isValidSettingKey,
  publicSettingsResponseSchema,
  PUBLIC_SETTING_KEYS,
  SETTING_DEFINITIONS,
  SETTING_KEYS,
  shellSettingsSchema,
  type PublicSettingsResponse,
  type SettingDefinition,
  type SettingKey,
  type SettingValue,
  type ShellSettings,
} from "./settings.ts";
