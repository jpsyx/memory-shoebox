import type {
  EmailCommon,
  RemovalRequestEmailPayload,
  RemovalReminderEmailPayload,
  RemovalResolvedEmailPayload,
} from "@memory-shoebox/shared";
import { describe, expect, it } from "vitest";
import * as emails from "../src/index.ts";
import type { EmailTemplate } from "../src/emailTemplate.types.ts";

const COMMON = {
  shoeboxName: "Casa Mateo",
  baseUrl: "https://example.com",
  timezone: "Europe/Madrid",
  toDisplayName: "Andrés",
  preferencesUrl: "https://example.com/account",
} as const satisfies EmailCommon;
const REASON =
  "I am mid-sentence and it is not a good one.\nSorry to be a bother.";
const REQUEST = {
  ...COMMON,
  requesterDisplayName: "Inés",
  isRequesterTagged: true,
  reason: REASON,
  itemCapturedOn: "2026-09-14",
  itemUploadedOn: "2026-09-14",
  uploaderDisplayName: "Papá",
  requestsUrl: "https://example.com/requests",
  relation: "uploader",
} as const satisfies RemovalRequestEmailPayload;
const REMINDER = {
  ...COMMON,
  requesterDisplayName: "Inés",
  reason: REASON,
  requestedOn: "2026-09-14",
  weekIndex: 1,
  requestsUrl: "https://example.com/requests",
  relation: "uploader",
} as const satisfies RemovalReminderEmailPayload;
const DELETED = {
  ...COMMON,
  outcome: "deleted",
  resolvedByDisplayName: "Papá",
  resolvedAt: "2026-09-16T12:00:00Z",
  itemCapturedOn: "2026-09-14",
  relation: "requester",
} as const satisfies RemovalResolvedEmailPayload;
const DECLINED = {
  ...COMMON,
  outcome: "declined",
  declinerDisplayName: "Papá",
  declineReason:
    "It is the only one with all four of you in it, so I have made it so only the six of us can see it rather than everybody.\nIf you still want it gone, say so and it goes.",
  resolvedAt: "2026-09-16T12:00:00Z",
  itemUrl: "https://example.com/item/4691",
} as const satisfies RemovalResolvedEmailPayload;
const WITHDRAWN = {
  ...COMMON,
  outcome: "withdrawn",
  withdrawnByDisplayName: "Inés",
  resolvedAt: "2026-09-17T12:00:00Z",
  itemCapturedOn: "2026-09-14",
  itemUrl: "https://example.com/item/4691",
} as const satisfies RemovalResolvedEmailPayload;

function _template<Payload>(name: string): EmailTemplate<Payload> {
  expect(emails).toHaveProperty(name);
  return Reflect.get(emails, name) as EmailTemplate<Payload>;
}

function _words(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

async function _assertRendersTheAskUnchangedPhotoReassuranceAndNamed1(): Promise<void> {
  const mail = _template<RemovalRequestEmailPayload>(
    "RemovalRequestEmailTemplate",
  );
  expect(mail.subject(REQUEST)).toBe("Inés has asked for a photo to come down");
  const rendered = await mail.render(REQUEST);
  expect(_words(rendered.text)).toContain(
    "Inés is tagged in it. You put it up on 14 September 2026.",
  );
  expect(_words(rendered.text)).toContain(
    "Nothing has happened to the photo. It is still there and everybody who could see it still can, until you or an admin does something.",
  );
  expect(_words(rendered.text)).toContain(
    "You can delete it, or keep it and tell Inés why. Either is fine; leaving it is not, because Inés is waiting.",
  );
  expect(_words(rendered.text)).toContain(_words(REASON));
  expect(rendered.html).toContain("white-space:pre-wrap");
  expect(rendered.text).toContain("Turn these emails off");
  const admin = await mail.render({
    ...REQUEST,
    relation: "admin",
    reason: null,
    isRequesterTagged: false,
  });
  expect(_words(admin.text)).toContain("Papá put it up on 14 September 2026.");
  expect(admin.text).not.toContain("tagged in it");
  expect(admin.text).not.toContain("mid-sentence");
}

async function _assertKeepsCalendarDatesUnchangedInS2(
  timezone: string,
): Promise<void> {
  const rendered = await _template<RemovalRequestEmailPayload>(
    "RemovalRequestEmailTemplate",
  ).render({ ...REQUEST, timezone });
  expect(_words(rendered.text)).toContain("14 September 2026");
}

async function _assertEscapesNamesAndVerbatimMultilineReasonsInHTML3(): Promise<void> {
  const rendered = await _template<RemovalRequestEmailPayload>(
    "RemovalRequestEmailTemplate",
  ).render({
    ...REQUEST,
    requesterDisplayName: '<script> & "Inés"',
    reason: "<b>my words</b>\nsecond line & more",
  });
  expect(rendered.html).not.toContain("<script>");
  expect(rendered.html).toContain("&lt;script&gt; &amp; &quot;Inés&quot;");
  expect(rendered.text).toContain('<script> & "Inés"');
  expect(rendered.html).toContain(
    "&lt;b&gt;my words&lt;/b&gt;\nsecond line &amp; more",
  );
  expect(_words(rendered.text)).toContain("<b>my words</b> second line & more");
}

async function _assertRendersWeeklyAgeAndStopsPromisingOneWeek4(): Promise<void> {
  const mail = _template<RemovalReminderEmailPayload>(
    "RemovalReminderEmailTemplate",
  );
  expect(mail.subject(REMINDER)).toBe("Inés is still waiting on that photo");
  const first = await mail.render(REMINDER);
  expect(_words(first.text)).toContain(
    "Inés asked a week ago, on 14 September 2026, and nothing has happened yet.",
  );
  expect(_words(first.text)).toContain(
    "Delete it, or keep it and tell Inés why. Either is an answer. This will keep arriving once a week until one of you does one or the other, because Inés has no way of knowing whether anybody saw it.",
  );
  expect(_words(first.text)).toContain(_words(REASON));
  const later = await mail.render({
    ...REMINDER,
    weekIndex: 4,
    relation: "admin",
    reason: null,
  });
  expect(_words(later.text)).toContain("Inés asked 4 weeks ago");
  expect(later.text).not.toContain("mid-sentence");
  expect(later.text).toContain("Turn these emails off");
}

async function _assertRendersDeletedRequesterAndUploaderAnswersWithTruthful5(): Promise<void> {
  const mail = _template<RemovalResolvedEmailPayload>(
    "RemovalResolvedEmailTemplate",
  );
  expect(mail.subject(DELETED)).toBe("That photo has come down");
  const answer = await mail.render(DELETED);
  expect(_words(answer.text)).toContain(
    "Papá took it down on 16 September 2026. It is gone: the picture and the file behind it. Nobody in Casa Mateo can open it any more.",
  );
  expect(_words(answer.text)).toContain(
    "You do not have to do anything, and you do not have to thank anybody. Asking was the right thing to do.",
  );
  expect(answer.text).not.toContain("Turn these emails off");
  expect(answer.text).not.toContain("/item/");
  expect(answer.html).not.toContain("/item/");
  const uploader = await mail.render({ ...DELETED, relation: "uploader" });
  expect(uploader.text).toContain("Turn these emails off");
  expect(uploader.text).not.toContain("Asking was the right thing");
  expect(uploader.text).not.toContain("/item/");
}

async function _assertPutsTheDeclineQuoteBeforeReassuranceInBoth6(): Promise<void> {
  const mail = _template<RemovalResolvedEmailPayload>(
    "RemovalResolvedEmailTemplate",
  );
  expect(mail.subject(DECLINED)).toBe(
    "Papá has kept that photo up, and said why",
  );
  const answer = await mail.render(DECLINED);
  expect(_words(answer.text)).toContain(_words(DECLINED.declineReason));
  expect(answer.text.indexOf("It is the only one")).toBeLessThan(
    answer.text.indexOf("The photo is still there."),
  );
  expect(answer.html.indexOf("It is the only one")).toBeLessThan(
    answer.html.indexOf("The photo is still there."),
  );
  expect(answer.html).toContain(DECLINED.declineReason);
  expect(_words(answer.text)).toContain(
    "The photo is still there. Who can see it may have changed.",
  );
  expect(_words(answer.text)).toContain(
    "If you are not happy with that, ask again, or tell an admin. Nobody will think less of you for it.",
  );
  expect(answer.text).not.toContain("Turn these emails off");
  expect(answer.text).toContain(DECLINED.itemUrl);
}

async function _assertRendersWithdrawalAsNoWorkAndAnUntouched7(): Promise<void> {
  const mail = _template<RemovalResolvedEmailPayload>(
    "RemovalResolvedEmailTemplate",
  );
  expect(mail.subject(WITHDRAWN)).toBe("Never mind about that photo");
  const answer = await mail.render(WITHDRAWN);
  expect(_words(answer.text)).toContain(
    "Inés asked about a photo from 14 September 2026, and on 17 September Inés took the request back. There is nothing for you to do.",
  );
  expect(_words(answer.text)).toContain(
    "The photo has not been touched. It is still there and the same people can still see it.",
  );
  expect(answer.text).toContain("Turn these emails off");
  expect(answer.text).toContain(WITHDRAWN.itemUrl);
}

async function _assertFormatsResolutionInstantsInTheShoeboxZone8(): Promise<void> {
  const mail = _template<RemovalResolvedEmailPayload>(
    "RemovalResolvedEmailTemplate",
  );
  const answer = await mail.render({
    ...DELETED,
    resolvedAt: "2026-09-16T23:00:00Z",
    timezone: "Pacific/Kiritimati",
  });
  expect(_words(answer.text)).toContain("17 September 2026");
}
describe("removal prototype copy", () => {
  it(
    "renders the ask, unchanged-photo reassurance and named relation",
    _assertRendersTheAskUnchangedPhotoReassuranceAndNamed1,
  );
  it.each(["Pacific/Kiritimati", "Etc/GMT+12"])(
    "keeps calendar dates unchanged in %s",
    _assertKeepsCalendarDatesUnchangedInS2,
  );
  it(
    "escapes names and verbatim multiline reasons in HTML",
    _assertEscapesNamesAndVerbatimMultilineReasonsInHTML3,
  );
  it(
    "renders weekly age and stops promising one week forever",
    _assertRendersWeeklyAgeAndStopsPromisingOneWeek4,
  );
  it(
    "renders deleted requester and uploader answers with truthful footers and no dead links",
    _assertRendersDeletedRequesterAndUploaderAnswersWithTruthful5,
  );
  it(
    "puts the decline quote before reassurance in both forms",
    _assertPutsTheDeclineQuoteBeforeReassuranceInBoth6,
  );
  it(
    "renders withdrawal as no work and an untouched photo",
    _assertRendersWithdrawalAsNoWorkAndAnUntouched7,
  );
  it(
    "formats resolution instants in the Shoebox zone",
    _assertFormatsResolutionInstantsInTheShoeboxZone8,
  );
});
