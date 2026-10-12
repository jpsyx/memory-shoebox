import { expect, it, vi } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { getArchivePhotosFromEntries } from "../../src/upload/reconcileManifest/manifestVisualHelpers.ts";

it("uses band searches for the actual multi-band archive lookup instead of scanning the photo catalog", async () => {
  const database = createDatabase(":memory:");
  try {
    await migrateToLatest(database);
    const queries = vi.spyOn(database.getExecutor(), "executeQuery");
    await getArchivePhotosFromEntries({
      transaction: database,
      entries: [
        {
          clientRef: "photo",
          originalFilename: "photo.jpg",
          declaredBytes: 100,
          declaredContentType: "image/jpeg",
          visualFingerprint: `v1:0123456789abcdef:${"a".repeat(60)}:${"bc".repeat(192)}`,
        },
      ],
    });
    const statements = queries.mock.calls.map(([statement]) => {
      return statement;
    });
    queries.mockRestore();
    const details = (
      await Promise.all(
        statements.map(async (statement) => {
          const plan = await database.executeQuery<{ detail: string }>({
            ...statement,
            sql: `EXPLAIN QUERY PLAN ${statement.sql}`,
          });
          return plan.rows.map((row) => {
            return row.detail;
          });
        }),
      )
    )
      .flat()
      .join("\n");
    expect(details).not.toMatch(/SCAN items/);
    [0, 1, 2, 3].forEach((band) => {
      expect(details).toContain(
        `SEARCH items USING INDEX items_visual_fingerprint_band_${band}`,
      );
    });
  } finally {
    await database.destroy();
  }
});
