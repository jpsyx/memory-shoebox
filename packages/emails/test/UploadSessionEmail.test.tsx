import { describe, expect, it } from "vitest";
import type { UploadSessionEmailPayload } from "@memory-shoebox/shared";
import { uploadSessionEmail } from "../src/templates/UploadSessionEmail/uploadSessionEmail.constants.tsx";

/** Surface 16's `upload` state: Abuela Rosa's copy of Papá's batch. */
const ONE_DAY: UploadSessionEmailPayload = {
  shoeboxName: "The Shoebox",
  baseUrl: "https://shoebox.example.com",
  timezone: "Europe/Madrid",
  toDisplayName: "Abuela Rosa",
  preferencesUrl: "https://shoebox.example.com/account",
  uploaderDisplayName: "Papá",
  visibleItemCount: 210,
  capturedOn: "2026-09-14",
  visibleDayCount: 1,
  firstCapturedOn: "2026-09-14",
  lastCapturedOn: "2026-09-14",
  dayUrl: "https://shoebox.example.com/?at=2026-09-14",
  milestoneName: "Mateo is born",
};

/** Surface 16's `upload-multi-day` state. */
const MANY_DAYS: UploadSessionEmailPayload = {
  ...ONE_DAY,
  visibleDayCount: 11,
  firstCapturedOn: "2026-09-01",
};

describe("uploadSessionEmail, one day", () => {
  it("puts the uploader, the count and the day in the subject", () => {
    expect(uploadSessionEmail.subject(ONE_DAY)).toBe(
      "Papá put up 210 photos from 14 September",
    );
  });

  it("names the weekday, the milestone and the day link", async () => {
    const { html, text } = await uploadSessionEmail.render(ONE_DAY);

    expect(html).toContain("Monday 14 September 2026.");
    expect(html).toContain(
      "That day is now a milestone: <b>Mateo is born</b>.",
    );
    expect(html).toContain('href="https://shoebox.example.com/?at=2026-09-14"');
    expect(text).toContain("See the day");
  });

  it("keeps the recipient reason without delivery commentary", async () => {
    const { html } = await uploadSessionEmail.render(ONE_DAY);

    expect(html).not.toContain("one email for the whole lot");
    expect(html).toContain(
      "You are getting it because you can see at least one of them.",
    );
  });

  it("drops the milestone sentence on a day that has none", async () => {
    const { html } = await uploadSessionEmail.render({
      ...ONE_DAY,
      milestoneName: null,
    });

    expect(html).toContain("Monday 14 September 2026.");
    expect(html).not.toContain("milestone");
  });
});

describe("uploadSessionEmail, narrowed", () => {
  it("is the same message with this reader's own smaller count", async () => {
    const narrowed = { ...ONE_DAY, visibleItemCount: 3 };

    const { text } = await uploadSessionEmail.render(narrowed);

    expect(uploadSessionEmail.subject(narrowed)).toBe(
      "Papá put up 3 photos from 14 September",
    );
    expect(text).not.toContain("210");
  });

  it("says one photo, not one photos", () => {
    expect(
      uploadSessionEmail.subject({ ...ONE_DAY, visibleItemCount: 1 }),
    ).toBe("Papá put up 1 photo from 14 September");
  });
});

describe("uploadSessionEmail, many days", () => {
  it("leads with the count and the number of days", () => {
    expect(uploadSessionEmail.subject(MANY_DAYS)).toBe(
      "Papá put up 210 photos, from 11 days",
    );
  });

  it("names the span, and the milestone on its last day", async () => {
    const { html } = await uploadSessionEmail.render(MANY_DAYS);

    expect(html).toContain(
      "Eleven days between <b>1 September</b> and <b>14 September 2026</b>.",
    );
    expect(html).toContain(
      "The last of them is now a milestone: <b>Mateo is born</b>.",
    );
  });

  it("links to the photos without delivery commentary", async () => {
    const { html, text } = await uploadSessionEmail.render(MANY_DAYS);

    expect(html).not.toContain("one email for the whole lot");
    expect(text).toContain("See them");
    expect(html).toContain(
      "You are getting this because you can see at least one of them.",
    );
  });

  it("calls the milestone the last day's wherever the link's busiest day is", async () => {
    const { html } = await uploadSessionEmail.render({
      ...MANY_DAYS,
      capturedOn: "2026-09-05",
    });

    expect(html).toContain(
      "The last of them is now a milestone: <b>Mateo is born</b>.",
    );
  });

  it("says nothing of a milestone when the last day has none", async () => {
    const { html } = await uploadSessionEmail.render({
      ...MANY_DAYS,
      milestoneName: null,
    });

    expect(html).not.toContain("milestone");
  });

  it("gives the first day its year when the span crosses a new year", async () => {
    const { html } = await uploadSessionEmail.render({
      ...MANY_DAYS,
      visibleDayCount: 7,
      capturedOn: "2027-01-03",
      firstCapturedOn: "2026-12-28",
      lastCapturedOn: "2027-01-03",
      milestoneName: null,
    });

    expect(html).toContain(
      "Seven days between <b>28 December 2026</b> and <b>3 January 2027</b>.",
    );
  });
});

describe("uploadSessionEmail, whoever reads it and whoever wrote it", () => {
  it("prints the calendar day it was given, in a zone far east of UTC", async () => {
    const kiritimati = { ...ONE_DAY, timezone: "Pacific/Kiritimati" };

    const { html } = await uploadSessionEmail.render(kiritimati);

    expect(uploadSessionEmail.subject(kiritimati)).toBe(
      "Papá put up 210 photos from 14 September",
    );
    expect(html).toContain("Monday 14 September 2026.");
  });

  it("escapes an uploader name that is markup", async () => {
    const { html } = await uploadSessionEmail.render({
      ...ONE_DAY,
      uploaderDisplayName: "<b>x</b>",
    });

    expect(html).not.toContain("<b>x</b>");
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
  });
});
