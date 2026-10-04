import type { ErrorResponse } from "resend";
import type { MailDeliveryFailure } from "@memory-shoebox/shared";
import type { Database } from "../db/types/db.types.ts";

type StoredMailFailure = Pick<
  Database["outbound_emails"],
  "last_error_code" | "last_error_message" | "created_at" | "kind"
>;

const INTERNAL_FAILURE_MESSAGES = {
  base_url_unset: "Mail requires a configured public URL.",
  from_address_unset: "Mail requires a configured sender address.",
  provider_unconfigured: "The mail provider is not configured.",
  no_template: "This message has no available email template.",
  render_failed: "The queued message could not be rendered.",
  address_suppressed: "The provider has suppressed this delivery address.",
};

const PROVIDER_FAILURE_MESSAGES: Record<
  ErrorResponse["name"] | "provider_unreachable" | "provider_rejected",
  string
> = {
  invalid_idempotency_key:
    "The provider rejected the delivery idempotency key.",
  validation_error: "The provider rejected the message configuration.",
  missing_api_key: "The mail provider requires an API key.",
  restricted_api_key: "The mail provider API key lacks sending permission.",
  invalid_api_key: "The mail provider API key is invalid.",
  not_found: "The provider could not find the requested resource.",
  method_not_allowed: "The provider rejected the request method.",
  invalid_idempotent_request: "The provider rejected a changed delivery retry.",
  concurrent_idempotent_requests:
    "The provider is processing another delivery retry.",
  invalid_attachment: "The provider rejected an attachment.",
  invalid_from_address: "The provider rejected the sender address.",
  invalid_access: "The provider refused access to send mail.",
  invalid_parameter: "The provider rejected a message parameter.",
  invalid_region: "The provider rejected the sending region.",
  missing_required_field: "The provider requires another message field.",
  monthly_quota_exceeded:
    "The mail provider monthly sending quota was exceeded.",
  daily_quota_exceeded: "The mail provider daily sending quota was exceeded.",
  rate_limit_exceeded: "The mail provider rate limit was exceeded.",
  security_error: "The provider refused the request for a security reason.",
  application_error: "The mail provider reported an application error.",
  internal_server_error: "The mail provider reported a service error.",
  provider_unreachable: "The mail provider could not be reached.",
  provider_rejected: "The mail provider refused this delivery.",
};

const FAILURE_MESSAGES: Record<string, string> = {
  ...INTERNAL_FAILURE_MESSAGES,
  ...PROVIDER_FAILURE_MESSAGES,
};

function _getSafeCodeFromStoredCode(code: string | null): string | null {
  if (
    code === null ||
    Object.hasOwn(FAILURE_MESSAGES, code) ||
    /^[45]\d{2}$/.test(code)
  ) {
    return code;
  }
  return "provider_rejected";
}

function _getSafeMessageFromStoredError(
  row: Readonly<StoredMailFailure>,
): string | null {
  if (row.last_error_message === null) {
    return null;
  }
  const code = _getSafeCodeFromStoredCode(row.last_error_code);
  if (code !== null && Object.hasOwn(INTERNAL_FAILURE_MESSAGES, code)) {
    return FAILURE_MESSAGES[code] ?? null;
  }
  // Inspect only to classify; arbitrary provider text never crosses the API.
  if (
    /domain.*verif|verif.*domain/i.test(
      `${row.last_error_code ?? ""} ${row.last_error_message}`,
    )
  ) {
    return "The provider has not verified the sending domain.";
  }
  return code === null
    ? "Mail delivery failed."
    : (FAILURE_MESSAGES[code] ?? "The mail provider refused this delivery.");
}

/** Makes a safe admin failure DTO from untrusted persisted error fields. */
export function makeMailDeliveryFailureFromStoredError(
  row: Readonly<StoredMailFailure>,
): MailDeliveryFailure {
  return {
    code: _getSafeCodeFromStoredCode(row.last_error_code),
    message: _getSafeMessageFromStoredError(row),
    occurredAt: row.created_at,
    kind: row.kind,
  };
}
