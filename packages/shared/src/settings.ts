import { z } from "zod";
import { timestampSchema } from "./dtos.ts";

/**
 * Every key the settings registry defines today.
 *
 * From `conventions.md` § `SETTING_DEFINITIONS`. `mail.domain_verified_at`
 * and `mail.domain_last_check_error` are written by the mail checker, never
 * by an admin, and `visibility.generation` is internal plumbing that never
 * appears in a payload, but all nine share one registry so both halves of the
 * app resolve a key the same way.
 */
export type SettingKey =
  | "shoebox.name"
  | "pile.arrangement"
  | "shoebox.timezone"
  | "mail.from_address"
  | "mail.from_name"
  | "mail.domain_verified_at"
  | "mail.domain_last_check_error"
  | "public.base_url"
  | "visibility.generation";

/**
 * One entry in the settings registry: a key's Zod schema, its default, the
 * scopes it permits, and whether it is served without a session.
 *
 * A fresh instance holds zero `settings` rows, and every key here still
 * resolves to something sensible, which is what lets the app render before
 * an admin has configured anything (`data-models.md` § `settings`).
 */
export type SettingDefinition<T> = {
  key: SettingKey;
  schema: z.ZodType<T>;
  default: T;
  /**
   * `"instance"` or `"member"`. Load-bearing: this is what stops
   * `pile.arrangement` quietly becoming a personal preference later
   * (`conventions.md` § `SETTING_DEFINITIONS`).
   */
  scopes: ReadonlyArray<"instance" | "member">;
  /**
   * Served by the anonymous `GET /api/public-settings`. True only for
   * `shoebox.name` and `public.base_url`, because surface 1 renders the
   * Shoebox name before anybody has signed in. A key is readable
   * anonymously because it carries this flag, never because a route forgot
   * to check.
   */
  isPubliclyReadable: boolean;
};

/**
 * True when `Intl` can resolve `value` as an IANA zone. There is no zone
 * database to check against directly, so asking `Intl.DateTimeFormat` to
 * construct with it is the check: it throws on anything it cannot resolve.
 */
function _isResolvableIanaZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * An IANA zone (`"Europe/Madrid"`). Rejects anything `Intl` cannot resolve,
 * which is what backs the `400 invalid_request` on
 * `PATCH /api/settings` (`administration.md`).
 *
 * Exported because the email contract shares it: `EmailCommon.timezone`
 * freezes this setting's value into a queued payload, and a zone that
 * survived the enqueue would throw in the mail worker's `Intl.DateTimeFormat`
 * at send time, on a row that is already queued.
 *
 * **One definition, and at runtime nothing parses against it on either end.**
 * `enqueueEmail` writes the payload as JSON and the worker renders what it
 * reads back, neither one validating. What keeps a bad zone out is upstream:
 * the value comes from `getSettingValueFromStoredValue`, which returns this
 * key's default rather than a stored value this schema rejects. The schema is
 * the shared definition of the contract, and a later step that wants it
 * enforced should weigh that against `enqueueEmail`'s promise not to throw
 * inside somebody else's transaction.
 */
export const ianaTimezoneSchema = z.string().refine(_isResolvableIanaZone, {
  message: "not a resolvable IANA timezone",
});

/** `shoebox.name`. Rendered on surface 1 before anybody has signed in. */
const shoeboxNameDefinition: SettingDefinition<string> = {
  key: "shoebox.name",
  schema: z.string().min(1),
  default: "My Shoebox",
  scopes: ["instance"],
  isPubliclyReadable: true,
};

/**
 * `pile.arrangement`. Deployment-wide by design: the registry's scope
 * restriction is what stops this quietly becoming a personal preference.
 */
const pileArrangementDefinition: SettingDefinition<"tidy" | "messy"> = {
  key: "pile.arrangement",
  schema: z.enum(["tidy", "messy"]),
  default: "messy",
  scopes: ["instance"],
  isPubliclyReadable: false,
};

/**
 * `shoebox.timezone`. The zone every offset-less capture date, activity-log
 * day boundary and removal-reminder clock resolves in (`data-models.md`
 * § `settings`).
 */
const shoeboxTimezoneDefinition: SettingDefinition<string> = {
  key: "shoebox.timezone",
  schema: ianaTimezoneSchema,
  default: "UTC",
  scopes: ["instance"],
  isPubliclyReadable: false,
};

/** `mail.from_address`. Unset until first-run mail setup. */
const mailFromAddressDefinition: SettingDefinition<string | null> = {
  key: "mail.from_address",
  schema: z.email().nullable(),
  default: null,
  scopes: ["instance"],
  isPubliclyReadable: false,
};

/** `mail.from_name`. Unset until first-run mail setup. */
const mailFromNameDefinition: SettingDefinition<string | null> = {
  key: "mail.from_name",
  schema: z.string().min(1).nullable(),
  default: null,
  scopes: ["instance"],
  isPubliclyReadable: false,
};

/**
 * `mail.domain_verified_at`. Written by the mail checker, never by an admin.
 * Null means never verified.
 */
const mailDomainVerifiedAtDefinition: SettingDefinition<string | null> = {
  key: "mail.domain_verified_at",
  // The timestamp form comes from `dtos.ts` rather than being derived again
  // here: a second `z.iso.datetime()` inside the package that exists to stop
  // the contract forking is that fork (`conventions.md` § Field naming).
  schema: timestampSchema.nullable(),
  default: null,
  scopes: ["instance"],
  isPubliclyReadable: false,
};

/**
 * `mail.domain_last_check_error`. Verbatim from the provider's last check,
 * written by the mail checker, never by an admin.
 */
const mailDomainLastCheckErrorDefinition: SettingDefinition<string | null> = {
  key: "mail.domain_last_check_error",
  schema: z.string().nullable(),
  default: null,
  scopes: ["instance"],
  isPubliclyReadable: false,
};

/**
 * `public.base_url`. Easy to forget and every email is broken without it,
 * because an absolute link is the only kind an email can carry.
 */
const publicBaseUrlDefinition: SettingDefinition<string | null> = {
  key: "public.base_url",
  schema: z.url({ protocol: /^https?$/ }).nullable(),
  default: null,
  scopes: ["instance"],
  isPubliclyReadable: true,
};

/**
 * `visibility.generation`. Internal plumbing, never served in a payload:
 * bumped by any change to group membership, a visibility rule's subjects, or
 * a member's role, so `visibleRuleIds` caches invalidate together
 * (`conventions.md` § The auth middleware). Written by the visibility
 * writers, never by an admin.
 */
const visibilityGenerationDefinition: SettingDefinition<number> = {
  key: "visibility.generation",
  schema: z.number().int().nonnegative(),
  default: 0,
  scopes: ["instance"],
  isPubliclyReadable: false,
};

/**
 * The settings registry: one entry per key, giving its Zod schema, its
 * default, the scopes it permits, and whether it is publicly readable.
 *
 * Both the server and the web app read this same object, which is what lets
 * a fresh instance hold zero `settings` rows and still render correctly
 * (`conventions.md` § `SETTING_DEFINITIONS`).
 */
export const SETTING_DEFINITIONS = {
  "mail.domain_last_check_error": mailDomainLastCheckErrorDefinition,
  "mail.domain_verified_at": mailDomainVerifiedAtDefinition,
  "mail.from_address": mailFromAddressDefinition,
  "mail.from_name": mailFromNameDefinition,
  "pile.arrangement": pileArrangementDefinition,
  "public.base_url": publicBaseUrlDefinition,
  "shoebox.name": shoeboxNameDefinition,
  "shoebox.timezone": shoeboxTimezoneDefinition,
  "visibility.generation": visibilityGenerationDefinition,
} satisfies Record<SettingKey, SettingDefinition<unknown>>;

/** The type a given registry key resolves to. */
export type SettingValue<K extends SettingKey> =
  (typeof SETTING_DEFINITIONS)[K]["default"];

/**
 * One setting's value, decoded from the raw text the database holds.
 *
 * `storedValue` is the `settings.value` column's text, or `undefined` when no
 * row exists. The column holds a JSON-encoded scalar, decoded through the
 * key's Zod schema (migration `0007_operations_and_audit.ts`, `data-models.md`
 * § `settings`), so `storedValue` is `JSON.parse`d before it reaches the
 * schema. Absence returns the key's default. A value that fails to parse as
 * JSON, or parses but fails the key's schema, **also** returns the default
 * rather than throwing: a corrupted settings row must leave a degraded
 * instance, not a dead one.
 */
export function getSettingValueFromStoredValue<K extends SettingKey>(
  key: K,
  storedValue: string | undefined,
): SettingValue<K> {
  const definition = SETTING_DEFINITIONS[key];
  if (storedValue === undefined) {
    return definition.default as SettingValue<K>;
  }
  const decoded = ((): unknown => {
    try {
      return JSON.parse(storedValue);
    } catch {
      // `JSON.parse` never returns `undefined`, so `undefined` can stand for
      // "the row is not JSON at all" without colliding with a value it could
      // have yielded.
      return undefined;
    }
  })();
  const parsed =
    decoded === undefined ? undefined : definition.schema.safeParse(decoded);
  // One fall back rather than three, because the two ways a row can fail to be
  // usable, unparseable JSON and JSON the key's schema rejects, have the same
  // answer.
  return (
    parsed?.success === true ? parsed.data : definition.default
  ) as SettingValue<K>;
}
