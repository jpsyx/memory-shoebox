import { describe, expect, it } from "vitest";
import {
  createResendEmailService,
  type ResendEmailsApi,
} from "../../src/mail/EmailService/createResendEmailService.ts";
import { MailSendError } from "../../src/mail/MailSendError.ts";

const REQUEST = {
  from: "My Shoebox <shoebox@example.com>",
  to: "rosa@example.com",
  subject: "Your code is 410233",
  html: "<p>410233</p>",
  text: "410233",
  idempotencyKey: "signin:one",
};

describe("createResendEmailService", () => {
  it("returns the provider's message id", async () => {
    const calls: unknown[] = [];
    const emails: ResendEmailsApi = {
      send: (payload, options) => {
        calls.push({ payload, options });
        return Promise.resolve({ data: { id: "resend-1" }, error: null });
      },
    };

    const result = await createResendEmailService({ apiKey: "k", emails }).send(
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

    await createResendEmailService({ apiKey: "k", emails }).send(REQUEST);

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
      createResendEmailService({ apiKey: "k", emails }).send(REQUEST),
    ).rejects.toThrow(MailSendError);
    await expect(
      createResendEmailService({ apiKey: "k", emails }).send(REQUEST),
    ).rejects.toMatchObject({
      code: "validation_error",
      message: "domain not verified",
    });
  });

  it("reports no message id when the provider accepts without one", async () => {
    const emails: ResendEmailsApi = {
      send: () => {
        return Promise.resolve({ data: {} as { id: string }, error: null });
      },
    };

    const result = await createResendEmailService({ apiKey: "k", emails }).send(
      REQUEST,
    );

    expect(result.providerMessageId).toBeUndefined();
  });

  it("does not crash when the provider returns neither data nor error", async () => {
    const emails: ResendEmailsApi = {
      send: () => {
        return Promise.resolve({});
      },
    };

    const result = await createResendEmailService({ apiKey: "k", emails }).send(
      REQUEST,
    );

    expect(result.providerMessageId).toBeUndefined();
  });

  it("turns a thrown network error into a MailSendError too", async () => {
    const emails: ResendEmailsApi = {
      send: () => {
        return Promise.reject(new Error("socket hang up"));
      },
    };

    await expect(
      createResendEmailService({ apiKey: "k", emails }).send(REQUEST),
    ).rejects.toMatchObject({ code: "provider_unreachable" });
  });
});
