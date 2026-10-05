import { Resend } from "resend";
import type { Config } from "../configHelpers.ts";
import { getEmailServiceKind } from "./EmailService/createEmailService.ts";
import type { MailDomainReader } from "./mailDomainReader.types.ts";

const CACHE_MS = 60_000 satisfies number;
const READ_ERROR =
  "Unable to read provider domains. Check the provider API key and service availability." satisfies string;

type DomainPageOptions = {
  resend: Resend;
  domain: string;
  cursors: ReadonlySet<string>;
  after?: string;
};

async function _readDomainPage(
  options: Readonly<DomainPageOptions>,
): ReturnType<MailDomainReader> {
  const response = await options.resend.domains.list({
    limit: 100,
    after: options.after,
  });
  if (response.error !== null) {
    return { isVerified: false, error: READ_ERROR };
  }
  const domain = response.data.data.find((entry) => {
    return entry.name === options.domain;
  });
  if (domain !== undefined) {
    return {
      isVerified:
        domain.status === "verified" &&
        domain.capabilities.sending === "enabled",
      error: undefined,
    };
  }
  if (!response.data.has_more) {
    return { isVerified: false, error: undefined };
  }
  const cursor = response.data.data.at(-1)?.id;
  if (cursor === undefined || options.cursors.has(cursor)) {
    return { isVerified: false, error: READ_ERROR };
  }
  return _readDomainPage({
    ...options,
    after: cursor,
    cursors: new Set([...options.cursors, cursor]),
  });
}

/** Constructs a read-only, per-domain cached adapter for real Resend mail. */
export function createMailDomainReader(
  config: Readonly<Config>,
): MailDomainReader | undefined {
  if (getEmailServiceKind(config) !== "resend") {
    return undefined;
  }
  const resend = new Resend(config.resendApiKey);
  const cache = new Map<
    string,
    { expiresAt: number; result: ReturnType<MailDomainReader> }
  >();
  return (domain) => {
    const cached = cache.get(domain);
    if (cached !== undefined && cached.expiresAt > Date.now()) {
      return cached.result;
    }
    const result = _readDomainPage({
      resend,
      domain,
      cursors: new Set(),
    }).catch(() => {
      return { isVerified: false, error: READ_ERROR };
    });
    cache.set(domain, { expiresAt: Date.now() + CACHE_MS, result });
    return result;
  };
}
