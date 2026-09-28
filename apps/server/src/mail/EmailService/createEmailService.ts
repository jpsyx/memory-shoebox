import { homedir } from "node:os";
import { join } from "node:path";
import { createFakeEmailService } from "./createFakeEmailService.ts";
import { createResendEmailService } from "./createResendEmailService.ts";
import {
  createSendRateLimiter,
  type UpstashCredentials,
} from "./createSendRateLimiter.ts";
import type { Config } from "../../config.ts";
import type { EmailService } from "./EmailService.types.ts";

/** Where a developer finds the messages this instance did not send. */
const FAKE_EMAIL_DIRECTORY = join(
  homedir(),
  "Downloads",
  "memory-shoebox-emails",
);

/** Which of the three ways to treat a message this instance is using. */
export type EmailServiceKind = "fake" | "resend" | "none";

/**
 * Decides how this instance treats a message.
 *
 * **Faking needs two conditions, and one of them cannot be set by mistake.**
 * `ENABLE_FAKE_EMAIL` says what the developer wants; `NODE_ENV` says whether
 * they may have it. The asymmetry is deliberate: a production instance quietly
 * writing PDFs instead of sending would look exactly like a working instance
 * to everybody except the person waiting for a code, so the guard holds even
 * when the flag is set on a server by accident. Two more things hold it up,
 * both in `createFakeEmailService.ts`: Playwright is a dev dependency, so a
 * production image installed with `--prod` does not carry it, and its import
 * is inside the send rather than at the top of the file, so a wrong variable
 * fails at a send rather than taking the boot with it.
 *
 * `none` is a state this product runs in perfectly well: mail waits. A fresh
 * instance has no key, because an admin has to reach the settings surface to
 * configure mail at all.
 */
export function getEmailServiceKind(config: Config): EmailServiceKind {
  if (config.enableFakeEmail && config.isKnownNonProduction) {
    return "fake";
  }
  return config.resendApiKey === undefined ? "none" : "resend";
}

/**
 * The shared send budget's credentials, when this instance has both halves.
 *
 * Half a pair is no pair: a URL with no token cannot reach Upstash, so it
 * reads as not configured and the window is held in this process instead.
 */
function _readUpstashCredentials(
  config: Config,
): UpstashCredentials | undefined {
  const { upstashRedisRestUrl, upstashRedisRestToken } = config;
  if (
    upstashRedisRestUrl === undefined ||
    upstashRedisRestToken === undefined
  ) {
    return undefined;
  }
  return { restUrl: upstashRedisRestUrl, restToken: upstashRedisRestToken };
}

/**
 * Builds the service this instance sends through, or nothing.
 *
 * @param options.config The parsed environment.
 * @param options.fakeOutputDirectory Overridable so a test writes to a
 *   temporary directory rather than to somebody's Downloads folder.
 * @returns The service, or undefined when this instance sends nothing.
 */
export function createEmailService(options: {
  config: Config;
  fakeOutputDirectory?: string;
}): EmailService | undefined {
  const { config } = options;

  switch (getEmailServiceKind(config)) {
    case "fake":
      return createFakeEmailService({
        outputDirectory: options.fakeOutputDirectory ?? FAKE_EMAIL_DIRECTORY,
      });

    case "resend":
      return createResendEmailService({
        // Narrowed by `getEmailServiceKind`, which returns `resend` only when
        // the key is set.
        apiKey: config.resendApiKey ?? "",
        limiter: createSendRateLimiter({
          upstash: _readUpstashCredentials(config),
        }),
      });

    case "none":
      return undefined;
  }
}
