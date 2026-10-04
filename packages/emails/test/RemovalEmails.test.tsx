import { describe, expect, it } from "vitest";
import * as emails from "../src/index.ts";
import type { EmailTemplate } from "../src/emailTemplate.types.ts";
import type {
  RemovalRequestEmailPayload,
  RemovalReminderEmailPayload,
  RemovalResolvedEmailPayload,
} from "@memory-shoebox/shared";

const common = {
  shoeboxName: "Casa Mateo",
  baseUrl: "https://example.com",
  timezone: "Europe/Madrid",
  toDisplayName: "Andrés",
  preferencesUrl: "https://example.com/account",
};
const reason =
  "I am mid-sentence and it is not a good one.\nSorry to be a bother.";
const request: RemovalRequestEmailPayload = {
  ...common,
  requesterDisplayName: "Inés",
  isRequesterTagged: true,
  reason,
  itemCapturedOn: "2026-09-14",
  itemUploadedOn: "2026-09-14",
  uploaderDisplayName: "Papá",
  requestsUrl: "https://example.com/requests",
  relation: "uploader",
};
const reminder: RemovalReminderEmailPayload = {
  ...common,
  requesterDisplayName: "Inés",
  reason,
  requestedOn: "2026-09-14",
  weekIndex: 1,
  requestsUrl: "https://example.com/requests",
  relation: "uploader",
};
const deleted: RemovalResolvedEmailPayload = {
  ...common,
  outcome: "deleted",
  resolvedByDisplayName: "Papá",
  resolvedAt: "2026-09-16T12:00:00Z",
  itemCapturedOn: "2026-09-14",
  relation: "requester",
};
const declined: RemovalResolvedEmailPayload = {
  ...common,
  outcome: "declined",
  declinerDisplayName: "Papá",
  declineReason:
    "It is the only one with all four of you in it, so I have made it so only the six of us can see it rather than everybody.\nIf you still want it gone, say so and it goes.",
  resolvedAt: "2026-09-16T12:00:00Z",
  itemUrl: "https://example.com/item/4691",
};
const withdrawn: RemovalResolvedEmailPayload = {
  ...common,
  outcome: "withdrawn",
  withdrawnByDisplayName: "Inés",
  resolvedAt: "2026-09-17T12:00:00Z",
  itemCapturedOn: "2026-09-14",
  itemUrl: "https://example.com/item/4691",
};
function template<Payload>(name: string): EmailTemplate<Payload> {
  expect(emails).toHaveProperty(name);
  return Reflect.get(emails, name) as EmailTemplate<Payload>;
}
function words(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

describe("removal prototype copy", () => {
  it("renders the ask, unchanged-photo reassurance and named relation", async () => {
    const mail = template<RemovalRequestEmailPayload>("removalRequestEmail");
    expect(mail.subject(request)).toBe(
      "Inés has asked for a photo to come down",
    );
    const rendered = await mail.render(request);
    expect(words(rendered.text)).toContain(
      "Inés is tagged in it. You put it up on 14 September 2026.",
    );
    expect(words(rendered.text)).toContain(
      "Nothing has happened to the photo. It is still there and everybody who could see it still can, until you or an admin does something.",
    );
    expect(words(rendered.text)).toContain(
      "You can delete it, or keep it and tell Inés why. Either is fine; leaving it is not, because Inés is waiting.",
    );
    expect(words(rendered.text)).toContain(words(reason));
    expect(rendered.html).toContain("white-space:pre-wrap");
    expect(rendered.text).toContain("Turn these emails off");
    const admin = await mail.render({
      ...request,
      relation: "admin",
      reason: null,
      isRequesterTagged: false,
    });
    expect(words(admin.text)).toContain("Papá put it up on 14 September 2026.");
    expect(admin.text).not.toContain("tagged in it");
    expect(admin.text).not.toContain("mid-sentence");
  });
  it.each(["Pacific/Kiritimati", "Etc/GMT+12"])(
    "keeps calendar dates unchanged in %s",
    async (timezone) => {
      const rendered = await template<RemovalRequestEmailPayload>(
        "removalRequestEmail",
      ).render({ ...request, timezone });
      expect(words(rendered.text)).toContain("14 September 2026");
    },
  );
  it("escapes names and verbatim multiline reasons in HTML", async () => {
    const rendered = await template<RemovalRequestEmailPayload>(
      "removalRequestEmail",
    ).render({
      ...request,
      requesterDisplayName: '<script> & "Inés"',
      reason: "<b>my words</b>\nsecond line & more",
    });
    expect(rendered.html).not.toContain("<script>");
    expect(rendered.html).toContain(
      "&lt;b&gt;my words&lt;/b&gt;\nsecond line &amp; more",
    );
    expect(words(rendered.text)).toContain(
      "<b>my words</b> second line & more",
    );
  });
  it("renders weekly age and stops promising one week forever", async () => {
    const mail = template<RemovalReminderEmailPayload>("removalReminderEmail");
    expect(mail.subject(reminder)).toBe("Inés is still waiting on that photo");
    const first = await mail.render(reminder);
    expect(words(first.text)).toContain(
      "Inés asked a week ago, on 14 September 2026, and nothing has happened yet.",
    );
    expect(words(first.text)).toContain(
      "Delete it, or keep it and tell Inés why. Either is an answer. This will keep arriving once a week until one of you does one or the other, because Inés has no way of knowing whether anybody saw it.",
    );
    expect(words(first.text)).toContain(words(reason));
    const later = await mail.render({
      ...reminder,
      weekIndex: 4,
      relation: "admin",
      reason: null,
    });
    expect(words(later.text)).toContain("Inés asked 4 weeks ago");
    expect(later.text).not.toContain("mid-sentence");
    expect(later.text).toContain("Turn these emails off");
  });
  it("renders deleted requester and uploader answers with truthful footers and no dead links", async () => {
    const mail = template<RemovalResolvedEmailPayload>("removalResolvedEmail");
    expect(mail.subject(deleted)).toBe("That photo has come down");
    const answer = await mail.render(deleted);
    expect(words(answer.text)).toContain(
      "Papá took it down on 16 September 2026. It is gone: the picture and the file behind it. Nobody in Casa Mateo can open it any more.",
    );
    expect(words(answer.text)).toContain(
      "You do not have to do anything, and you do not have to thank anybody. Asking was the right thing to do.",
    );
    expect(answer.text).not.toContain("Turn these emails off");
    expect(answer.text).not.toContain("/item/");
    expect(answer.html).not.toContain("/item/");
    const uploader = await mail.render({ ...deleted, relation: "uploader" });
    expect(uploader.text).toContain("Turn these emails off");
    expect(uploader.text).not.toContain("Asking was the right thing");
    expect(uploader.text).not.toContain("/item/");
  });
  it("puts the decline quote before reassurance in both forms", async () => {
    const mail = template<RemovalResolvedEmailPayload>("removalResolvedEmail");
    expect(mail.subject(declined)).toBe(
      "Papá has kept that photo up, and said why",
    );
    const answer = await mail.render(declined);
    expect(words(answer.text)).toContain(words(declined.declineReason));
    expect(answer.text.indexOf("It is the only one")).toBeLessThan(
      answer.text.indexOf("The photo is still there."),
    );
    expect(answer.html.indexOf("It is the only one")).toBeLessThan(
      answer.html.indexOf("The photo is still there."),
    );
    expect(answer.html).toContain(declined.declineReason);
    expect(words(answer.text)).toContain(
      "The photo is still there. Who can see it may have changed.",
    );
    expect(words(answer.text)).toContain(
      "If you are not happy with that, ask again, or tell an admin. Nobody will think less of you for it.",
    );
    expect(answer.text).not.toContain("Turn these emails off");
    expect(answer.text).toContain(declined.itemUrl);
  });
  it("renders withdrawal as no work and an untouched photo", async () => {
    const mail = template<RemovalResolvedEmailPayload>("removalResolvedEmail");
    expect(mail.subject(withdrawn)).toBe("Never mind about that photo");
    const answer = await mail.render(withdrawn);
    expect(words(answer.text)).toContain(
      "Inés asked about a photo from 14 September 2026, and on 17 September Inés took the request back. There is nothing for you to do.",
    );
    expect(words(answer.text)).toContain(
      "The photo has not been touched. It is still there and the same people can still see it.",
    );
    expect(answer.text).toContain("Turn these emails off");
    expect(answer.text).toContain(withdrawn.itemUrl);
  });
  it("formats resolution instants in the Shoebox zone", async () => {
    const mail = template<RemovalResolvedEmailPayload>("removalResolvedEmail");
    const answer = await mail.render({
      ...deleted,
      resolvedAt: "2026-09-16T23:00:00Z",
      timezone: "Pacific/Kiritimati",
    });
    expect(words(answer.text)).toContain("17 September 2026");
  });
});
