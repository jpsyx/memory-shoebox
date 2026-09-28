import { describe, expect, it } from "vitest";
import {
  createResendEmailService,
  type ResendEmailsApi,
} from "../../../src/mail/EmailService/createResendEmailService.ts";
import { MailSendError } from "../../../src/mail/MailSendError.ts";
import type { EmailSendRequest } from "../../../src/mail/EmailService/EmailService.types.ts";
import type { SendRateLimiter } from "../../../src/mail/EmailService/createSendRateLimiter.ts";

const REQUEST: EmailSendRequest = {
  from: "My Shoebox <shoebox@example.com>",
  to: "rosa@example.com",
  subject: "Your code is 410233",
  html: "<p>410233</p>",
  text: "410233",
  idempotencyKey: "signin:0192f2a0-7d3c-7000-8000-000000000001",
};

/** A limiter that counts how often a slot was asked for. */
function _createCountingLimiter(): SendRateLimiter & { acquired: number } {
  const limiter: SendRateLimiter & { acquired: number } = {
    kind: "memory",
    acquired: 0,
    acquire: () => {
      limiter.acquired += 1;
      return Promise.resolve();
    },
  };
  return limiter;
}

describe("createResendEmailService", () => {
  it("waits for a slot before it calls the provider", async () => {
    const limiter = _createCountingLimiter();
    const calls: unknown[] = [];
    const service = createResendEmailService({
      apiKey: "not-a-key",
      limiter,
      emails: {
        send: (payload) => {
          calls.push(payload);
          expect(limiter.acquired).toBe(1);
          return Promise.resolve({ data: { id: "provider-1" } });
        },
      },
    });

    const result = await service.send(REQUEST);

    expect(result.providerMessageId).toBe("provider-1");
    expect(calls).toHaveLength(1);
  });

  it("passes the row's idempotency key to the provider", async () => {
    let seenKey: string | undefined;
    const service = createResendEmailService({
      apiKey: "not-a-key",
      limiter: _createCountingLimiter(),
      emails: {
        send: (_payload, options) => {
          seenKey = options.idempotencyKey;
          return Promise.resolve({ data: { id: "provider-1" } });
        },
      },
    });

    await service.send(REQUEST);

    expect(seenKey).toBe(REQUEST.idempotencyKey);
  });

  it("sends both the HTML and the plain-text alternative", async () => {
    let sent: Record<string, unknown> | undefined;
    const emails: ResendEmailsApi = {
      send: (payload) => {
        sent = payload as unknown as Record<string, unknown>;
        return Promise.resolve({ data: { id: "provider-1" }, error: null });
      },
    };

    await createResendEmailService({
      apiKey: "not-a-key",
      limiter: _createCountingLimiter(),
      emails,
    }).send(REQUEST);

    expect(sent?.html).toBe("<p>410233</p>");
    expect(sent?.text).toBe("410233");
  });

  it("waits and retries when the provider says we are going too fast", async () => {
    const limiter = _createCountingLimiter();
    let attempts = 0;
    const service = createResendEmailService({
      apiKey: "not-a-key",
      limiter,
      emails: {
        send: () => {
          attempts += 1;
          return attempts === 1
            ? Promise.resolve({
                error: { name: "rate_limit_exceeded", message: "too fast" },
              })
            : Promise.resolve({ data: { id: "provider-2" } });
        },
      },
    });

    const result = await service.send(REQUEST);

    expect(result.providerMessageId).toBe("provider-2");
    expect(attempts).toBe(2);
    // A fresh slot for the retry, rather than going straight back.
    expect(limiter.acquired).toBe(2);
  });

  it("reads a 429 as going too fast even when the error has no name", async () => {
    let attempts = 0;
    const service = createResendEmailService({
      apiKey: "not-a-key",
      limiter: _createCountingLimiter(),
      emails: {
        send: () => {
          attempts += 1;
          return attempts === 1
            ? Promise.resolve({
                error: { message: "too many requests", statusCode: 429 },
              })
            : Promise.resolve({ data: { id: "provider-3" } });
        },
      },
    });

    const result = await service.send(REQUEST);

    expect(result.providerMessageId).toBe("provider-3");
    expect(attempts).toBe(2);
  });

  it("gives up on a rate limit that will not clear", async () => {
    const service = createResendEmailService({
      apiKey: "not-a-key",
      limiter: _createCountingLimiter(),
      emails: {
        send: () => {
          return Promise.resolve({
            error: { name: "rate_limit_exceeded", message: "too fast" },
          });
        },
      },
    });

    await expect(service.send(REQUEST)).rejects.toBeInstanceOf(MailSendError);
  });

  it("does not retry an error that is not a rate limit", async () => {
    let attempts = 0;
    const service = createResendEmailService({
      apiKey: "not-a-key",
      limiter: _createCountingLimiter(),
      emails: {
        send: () => {
          attempts += 1;
          return Promise.resolve({
            error: { name: "validation_error", message: "bad address" },
          });
        },
      },
    });

    await expect(service.send(REQUEST)).rejects.toBeInstanceOf(MailSendError);
    expect(attempts).toBe(1);
  });

  it("carries the provider's own words through the refusal", async () => {
    const service = createResendEmailService({
      apiKey: "not-a-key",
      limiter: _createCountingLimiter(),
      emails: {
        send: () => {
          return Promise.resolve({
            data: null,
            error: {
              name: "validation_error",
              message: "domain not verified",
            },
          });
        },
      },
    });

    await expect(service.send(REQUEST)).rejects.toMatchObject({
      code: "validation_error",
      message: "domain not verified",
    });
  });

  it("reports no message id when the provider accepts without one", async () => {
    const service = createResendEmailService({
      apiKey: "not-a-key",
      limiter: _createCountingLimiter(),
      emails: {
        send: () => {
          return Promise.resolve({ data: {} as { id: string }, error: null });
        },
      },
    });

    const result = await service.send(REQUEST);

    expect(result.providerMessageId).toBeUndefined();
  });

  it("does not crash when the provider returns neither data nor error", async () => {
    const service = createResendEmailService({
      apiKey: "not-a-key",
      limiter: _createCountingLimiter(),
      emails: {
        send: () => {
          return Promise.resolve({});
        },
      },
    });

    const result = await service.send(REQUEST);

    expect(result.providerMessageId).toBeUndefined();
  });

  it("turns a thrown network error into a MailSendError too", async () => {
    const service = createResendEmailService({
      apiKey: "not-a-key",
      limiter: _createCountingLimiter(),
      emails: {
        send: () => {
          return Promise.reject(new Error("socket hang up"));
        },
      },
    });

    await expect(service.send(REQUEST)).rejects.toMatchObject({
      code: "provider_unreachable",
    });
  });
});
