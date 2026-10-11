import { readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import SQLite from "better-sqlite3";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  createBackfillFixture,
  insertBackfillItem,
  runBackfillCli,
  type BackfillFixture,
} from "./checksumBackfillTestHelpers.ts";

let fixture: BackfillFixture;
beforeEach(async () => {
  fixture = await createBackfillFixture();
});
afterEach(async () => {
  await fixture.close();
});

it("hashes original bytes, retains duplicate items, and resumes without downloading saved hashes", async () => {
  await insertBackfillItem(fixture, "a");
  await insertBackfillItem(fixture, "b");
  await insertBackfillItem(fixture, "c");
  await fixture.database
    .updateTable("items")
    .set({ checksum: "existing-hash" })
    .where("id", "=", "c")
    .execute();
  const backupsBefore = readdirSync(join(fixture.directory, "backups"));
  const result = await runBackfillCli(fixture);
  expect(result.status, result.stderr).toBe(0);
  expect(
    await fixture.database
      .selectFrom("items")
      .select(["id", "checksum"])
      .orderBy("id")
      .execute(),
  ).toEqual([
    {
      id: "a",
      checksum:
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    },
    {
      id: "b",
      checksum:
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    },
    { id: "c", checksum: "existing-hash" },
  ]);
  expect(fixture.requests).toEqual([
    "/bucket/isolated/family/a.jpg",
    "/bucket/isolated/family/b.jpg",
  ]);
  const backupsAfter = readdirSync(join(fixture.directory, "backups"));
  const backupName = backupsAfter.find((name) => {
    return !backupsBefore.includes(name);
  });
  expect(backupName).toBeDefined();
  const backup = new SQLite(join(fixture.directory, "backups", backupName!));
  try {
    expect(
      backup.prepare("select checksum from items order by id").all(),
    ).toEqual([
      { checksum: null },
      { checksum: null },
      { checksum: "existing-hash" },
    ]);
    expect(backup.pragma("integrity_check")).toEqual([
      { integrity_check: "ok" },
    ]);
  } finally {
    backup.close();
  }
  expect((await runBackfillCli(fixture)).status).toBe(0);
  expect(fixture.requests).toHaveLength(2);
  expect(readdirSync(join(fixture.directory, "backups"))).toEqual(backupsAfter);
});

it("keeps failed and incomplete originals unset and retries only those on rerun", async () => {
  const ids = [
    "a",
    "missing",
    "short",
    "long",
    "interrupted",
    "no-original",
    "sizes",
  ];
  for (const id of ids) {
    await insertBackfillItem(fixture, id);
  }
  fixture.responses.delete("/bucket/isolated/family/missing.jpg");
  fixture.responses.set("/bucket/isolated/family/short.jpg", (response) => {
    response.end("ab");
  });
  fixture.responses.set("/bucket/isolated/family/long.jpg", (response) => {
    response.end("abcd");
  });
  fixture.responses.set(
    "/bucket/isolated/family/interrupted.jpg",
    (response) => {
      response.writeHead(200, { "content-length": "3" });
      response.write("a");
      setImmediate(() => {
        response.destroy();
      });
    },
  );
  await fixture.database
    .deleteFrom("item_renditions")
    .where("item_id", "=", "no-original")
    .execute();
  await fixture.database
    .updateTable("item_renditions")
    .set({ byte_size: 4 })
    .where("item_id", "=", "sizes")
    .execute();
  const result = await runBackfillCli(fixture);
  expect(result.status, result.stderr).toBe(1);
  expect(result.stdout).toContain("updated=1 failed=6");
  expect(result.stdout + result.stderr).not.toContain(
    "fake-application-secret",
  );
  expect(result.stdout + result.stderr).not.toContain("X-Amz");
  expect(
    await fixture.database
      .selectFrom("items")
      .select("id")
      .where("checksum", "is", null)
      .orderBy("id")
      .execute(),
  ).toEqual([
    { id: "interrupted" },
    { id: "long" },
    { id: "missing" },
    { id: "no-original" },
    { id: "short" },
    { id: "sizes" },
  ]);
  await fixture.database
    .insertInto("item_renditions")
    .values({
      id: "recovered-original",
      item_id: "no-original",
      purpose: "original",
      storage_key: "no-original.jpg",
      content_type: "image/jpeg",
      byte_size: 3,
      width: 1,
      height: 1,
    })
    .execute();
  await fixture.database
    .updateTable("item_renditions")
    .set({ byte_size: 3 })
    .where("item_id", "=", "sizes")
    .execute();
  ids
    .filter((id) => {
      return id !== "a";
    })
    .forEach((id) => {
      fixture.responses.set(`/bucket/isolated/family/${id}.jpg`, (response) => {
        response.end("abc");
      });
    });
  const retry = await runBackfillCli(fixture);
  expect(retry.status, retry.stderr).toBe(0);
  expect(retry.stdout).toContain("updated=6 failed=0");
  expect(
    fixture.requests.filter((path) => {
      return path.endsWith("/a.jpg");
    }),
  ).toHaveLength(1);
  expect(
    await fixture.database
      .selectFrom("items")
      .select("id")
      .where("checksum", "is", null)
      .execute(),
  ).toEqual([]);
});

it.each([
  "replace-original",
  "delete-original",
  "delete-item",
  "change-size",
  "checksum-written",
])(
  "rejects a stale checksum when %s happens during the download without holding a write lock",
  async (mutation) => {
    await insertBackfillItem(fixture, "a");
    fixture.responses.set("/bucket/isolated/family/a.jpg", (response) => {
      void (async () => {
        if (mutation === "replace-original") {
          await fixture.database
            .updateTable("item_renditions")
            .set({ storage_key: "replacement.jpg" })
            .where("item_id", "=", "a")
            .execute();
        } else if (mutation === "delete-original") {
          await fixture.database
            .deleteFrom("item_renditions")
            .where("item_id", "=", "a")
            .execute();
        } else if (mutation === "delete-item") {
          await fixture.database
            .deleteFrom("items")
            .where("id", "=", "a")
            .execute();
        } else if (mutation === "change-size") {
          await fixture.database
            .updateTable("items")
            .set({ byte_size: 4 })
            .where("id", "=", "a")
            .execute();
        } else {
          await fixture.database
            .updateTable("items")
            .set({ checksum: "concurrent-hash" })
            .where("id", "=", "a")
            .execute();
        }
        response.end("abc");
      })().catch(() => {
        response.destroy();
      });
    });
    const result = await runBackfillCli(fixture);
    expect(result.status, result.stderr).toBe(1);
    expect(result.stdout).toContain("updated=0 failed=1");
    expect(result.stderr).toContain("source_changed");
    const item = await fixture.database
      .selectFrom("items")
      .select("checksum")
      .where("id", "=", "a")
      .executeTakeFirst();
    expect(item).toEqual(
      mutation === "delete-item"
        ? undefined
        : {
            checksum:
              mutation === "checksum-written" ? "concurrent-hash" : null,
          },
    );
  },
);

it("refuses every checksum write when a verified backup cannot be created", async () => {
  await insertBackfillItem(fixture, "a");
  rmSync(join(fixture.directory, "backups"), { recursive: true });
  writeFileSync(
    join(fixture.directory, "backups"),
    "blocks the backup directory",
  );
  const result = await runBackfillCli(fixture);
  expect(result.status, result.stderr).toBe(1);
  expect(fixture.requests).toEqual([]);
  expect(
    await fixture.database
      .selectFrom("items")
      .select("checksum")
      .executeTakeFirstOrThrow(),
  ).toEqual({ checksum: null });
});
