import { sql } from "kysely";
import { describe, expect, it, vi } from "vitest";
import type { UploadSessionDetail } from "@memory-shoebox/shared";
import { insertInstanceSetting } from "../../../helpers/seedHelpers/seedHelpers.ts";
import {
  CAPTURE_INSTANT,
  createTimezoneUploadFixture,
  makeTimezoneManifestEntry,
} from "./timezoneUploadTestHelpers.ts";

describe("timezone changes during uploads", () => {
  it("moves pending DTOs and mixed day groups together, then lands the new day without changing evidence", async () => {
    const fixture = await createTimezoneUploadFixture();
    expect(
      (
        await fixture.manifest([
          makeTimezoneManifestEntry("landed"),
          makeTimezoneManifestEntry("pending"),
        ])
      ).statusCode,
    ).toBe(200);
    const before = await fixture.readFiles();
    await fixture.commit();
    expect((await fixture.complete(before[0]!.id)).statusCode).toBe(200);
    const beforeSave = await fixture.readFiles();
    const preview = await fixture.app.inject({
      method: "PATCH",
      url: "/api/settings?preview=true",
      payload: { shoebox: { timezone: "America/New_York" } },
    });
    expect(preview.statusCode).toBe(200);
    expect(await fixture.readFiles()).toEqual(beforeSave);
    expect((await fixture.saveTimezone()).statusCode).toBe(200);
    const afterSave = await fixture.readFiles();
    expect(afterSave).toEqual(
      beforeSave.map((file) => {
        return { ...file, capture_date: "2026-09-13" };
      }),
    );
    const detailResponse = await fixture.app.inject(
      `/api/upload-sessions/${fixture.sessionId}`,
    );
    expect(detailResponse.statusCode).toBe(200);
    const detail = detailResponse.json<UploadSessionDetail>();
    expect(
      detail.files.map((file) => {
        return file.capturedOn;
      }),
    ).toEqual(["2026-09-13", "2026-09-13"]);
    expect(detail.days).toEqual([
      { capturedOn: "2026-09-13", fileCount: 2, milestones: [] },
    ]);
    expect(
      detail.pendingFiles.map((file) => {
        return file.fileId;
      }),
    ).toEqual([before[1]!.id]);
    expect((await fixture.complete(before[1]!.id)).statusCode).toBe(200);
    const items = await fixture.database
      .selectFrom("items")
      .selectAll()
      .orderBy("seq")
      .execute();
    expect(
      items.map((item) => {
        return {
          day: item.captured_on,
          instant: item.captured_at,
          original: item.original_captured_at,
          offset: item.captured_at_offset_minutes,
          source: item.capture_source,
        };
      }),
    ).toEqual([
      {
        day: "2026-09-13",
        instant: CAPTURE_INSTANT,
        original: CAPTURE_INSTANT,
        offset: null,
        source: "exif",
      },
      {
        day: "2026-09-13",
        instant: CAPTURE_INSTANT,
        original: CAPTURE_INSTANT,
        offset: null,
        source: "exif",
      },
    ]);
  });

  it("uses the transaction's timezone when an older pending row still has its UTC day", async () => {
    const fixture = await createTimezoneUploadFixture();
    expect(
      (await fixture.manifest([makeTimezoneManifestEntry("pending")]))
        .statusCode,
    ).toBe(200);
    const [file] = await fixture.readFiles();
    await fixture.commit();
    await insertInstanceSetting(fixture.database, {
      key: "shoebox.timezone",
      value: "America/New_York",
    });
    const response = await fixture.complete(file!.id);
    expect(response.statusCode).toBe(200);
    const item = await fixture.database
      .selectFrom("items")
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(item.captured_on).toBe("2026-09-13");
    expect(response.json().file.capturedOn).toBe("2026-09-13");
    expect(item.captured_at).toBe(CAPTURE_INSTANT);
    expect(item.original_captured_at).toBe(CAPTURE_INSTANT);
  });
  it("keeps explicit zero-offset capture dates fixed through saving and completion", async () => {
    const fixture = await createTimezoneUploadFixture();
    const entry = makeTimezoneManifestEntry("fixed");
    expect(
      (
        await fixture.manifest([
          { ...entry, capture: { ...entry.capture, exifOffsetMinutes: 0 } },
        ])
      ).statusCode,
    ).toBe(200);
    const [file] = await fixture.readFiles();
    await fixture.commit();
    expect((await fixture.saveTimezone()).statusCode).toBe(200);
    expect(await fixture.readFiles()).toEqual([file]);
    const response = await fixture.complete(file!.id);
    expect(response.statusCode).toBe(200);
    const item = await fixture.database
      .selectFrom("items")
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(item).toMatchObject({
      captured_on: "2026-09-14",
      captured_at: CAPTURE_INSTANT,
      original_captured_at: CAPTURE_INSTANT,
      captured_at_offset_minutes: 0,
      capture_source: "exif",
    });
  });

  it("keeps uploader-chosen clock and evidence with identical pending and ingested timezone behavior", async () => {
    const fixture = await createTimezoneUploadFixture();
    expect(
      (
        await fixture.manifest([
          makeTimezoneManifestEntry("chosen-landed"),
          makeTimezoneManifestEntry("chosen-pending"),
        ])
      ).statusCode,
    ).toBe(200);
    const originalFiles = await fixture.readFiles();
    expect(
      (
        await fixture.manifest(
          originalFiles.map((file) => {
            return {
              ...makeTimezoneManifestEntry(file.original_filename),
              fileId: file.id,
              capturedAt: "2026-09-16T00:00:00.000Z",
            };
          }),
        )
      ).statusCode,
    ).toBe(200);
    const chosenFiles = await fixture.readFiles();
    expect(
      chosenFiles.map((file) => {
        return file.captured_at;
      }),
    ).toEqual(["2026-09-16T00:30:00.000Z", "2026-09-16T00:30:00.000Z"]);
    await fixture.commit();
    expect((await fixture.complete(chosenFiles[0]!.id)).statusCode).toBe(200);
    expect((await fixture.saveTimezone()).statusCode).toBe(200);
    expect(
      (await fixture.readFiles()).map((file) => {
        return file.capture_date;
      }),
    ).toEqual(["2026-09-15", "2026-09-15"]);
    expect((await fixture.complete(chosenFiles[1]!.id)).statusCode).toBe(200);
    const items = await fixture.database
      .selectFrom("items")
      .selectAll()
      .orderBy("seq")
      .execute();
    expect(
      items.map((item) => {
        return {
          day: item.captured_on,
          instant: item.captured_at,
          original: item.original_captured_at,
          source: item.capture_source,
        };
      }),
    ).toEqual([
      {
        day: "2026-09-15",
        instant: "2026-09-16T00:30:00.000Z",
        original: CAPTURE_INSTANT,
        source: "uploader_set",
      },
      {
        day: "2026-09-15",
        instant: "2026-09-16T00:30:00.000Z",
        original: CAPTURE_INSTANT,
        source: "uploader_set",
      },
    ]);
  });

  it("lands the current day when settings save overlaps object verification", async () => {
    const fixture = await createTimezoneUploadFixture();
    expect(
      (await fixture.manifest([makeTimezoneManifestEntry("overlap")]))
        .statusCode,
    ).toBe(200);
    const [file] = await fixture.readFiles();
    await fixture.commit();
    const headObject = fixture.b2.headObject;
    fixture.b2.headObject = async (options) => {
      expect((await fixture.saveTimezone()).statusCode).toBe(200);
      return headObject(options);
    };
    const response = await fixture.complete(file!.id);
    expect(response.statusCode).toBe(200);
    expect(response.json().file.capturedOn).toBe("2026-09-13");
    const item = await fixture.database
      .selectFrom("items")
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(item.captured_on).toBe("2026-09-13");
    expect(item.captured_at).toBe(CAPTURE_INSTANT);
  });

  it("declares against the saved timezone when settings save precedes the manifest write transaction", async () => {
    const fixture = await createTimezoneUploadFixture();
    const connection = fixture.database.connection.bind(fixture.database);
    // Schedule a real settings save at the transaction boundary. The database,
    // transaction, settings reader and manifest writes still execute normally.
    vi.spyOn(fixture.database, "connection").mockImplementationOnce(() => {
      const builder = connection();
      const execute = builder.execute.bind(builder);
      vi.spyOn(builder, "execute").mockImplementation(async (callback) => {
        expect((await fixture.saveTimezone()).statusCode).toBe(200);
        return execute(callback);
      });
      return builder;
    });
    expect(
      (await fixture.manifest([makeTimezoneManifestEntry("overlap")]))
        .statusCode,
    ).toBe(200);
    const [file] = await fixture.readFiles();
    expect(file).toMatchObject({
      captured_at: "2026-09-14T04:30:00.000Z",
      capture_date: "2026-09-14",
      original_captured_at: "2026-09-14T04:30:00.000Z",
      capture_offset_minutes: null,
    });
  });

  it("updates more than one bounded batch without changing transfer state", async () => {
    const fixture = await createTimezoneUploadFixture();
    expect(
      (
        await fixture.manifest(
          Array.from({ length: 205 }, (_, position) => {
            return makeTimezoneManifestEntry(`batch-${position}`);
          }),
        )
      ).statusCode,
    ).toBe(200);
    const before = await fixture.readFiles();
    expect((await fixture.saveTimezone()).statusCode).toBe(200);
    expect(await fixture.readFiles()).toEqual(
      before.map((file) => {
        return { ...file, capture_date: "2026-09-13" };
      }),
    );
  });

  it("rolls back timezone and earlier upload batches when a later date write fails", async () => {
    const fixture = await createTimezoneUploadFixture();
    expect(
      (
        await fixture.manifest(
          Array.from({ length: 101 }, (_, position) => {
            return makeTimezoneManifestEntry(`batch-${position}`);
          }),
        )
      ).statusCode,
    ).toBe(200);
    const before = await fixture.readFiles();
    const lastFileId = [...before]
      .sort((first, second) => {
        return first.id.localeCompare(second.id);
      })
      .at(-1)!.id;
    await sql`create trigger reject_upload_day before update of capture_date on upload_files when new.id = ${sql.lit(lastFileId)} begin select raise(abort, 'test refusal'); end`.execute(
      fixture.database,
    );
    expect((await fixture.saveTimezone()).statusCode).toBe(500);
    expect(await fixture.readFiles()).toEqual(before);
    expect(
      (await fixture.app.inject("/api/settings")).json().shoebox.timezone,
    ).toBe("UTC");
    expect(
      await fixture.database
        .selectFrom("activity_events")
        .selectAll()
        .execute(),
    ).toEqual([]);
  });
});
