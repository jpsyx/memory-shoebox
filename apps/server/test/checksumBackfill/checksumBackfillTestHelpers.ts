import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { insertItem } from "../helpers/seedHelpers/itemSeedHelpers.ts";
import { insertMember } from "../helpers/seedHelpers/memberSeedHelpers.ts";

/** The shared test fixture's owned resources. */
export type BackfillFixture = {
  database: ReturnType<typeof createDatabase>;
  directory: string;
  path: string;
  memberId: string;
  requests: string[];
  responses: Map<string, (response: ServerResponse) => void>;
  endpoint: string;
  close: () => Promise<void>;
};

/** Local HTTP storage and a temporary, migrated catalog for the real CLI. */
export async function createBackfillFixture(): Promise<BackfillFixture> {
  const directory = mkdtempSync(join(tmpdir(), "checksum-backfill-"));
  const path = join(directory, "catalog.db");
  const database = createDatabase(path);
  await migrateToLatest(database);
  const memberId = await insertMember(database);
  const requests: string[] = [];
  const responses = new Map<string, (response: ServerResponse) => void>();
  const server = createServer((request, response) => {
    const pathname = new URL(request.url!, "http://localhost").pathname;
    requests.push(pathname);
    const respond = responses.get(pathname);
    if (respond) {
      respond(response);
    } else {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected local HTTP port");
  }
  return {
    database,
    directory,
    path,
    memberId,
    requests,
    responses,
    endpoint: `http://127.0.0.1:${address.port}`,
    close: async (): Promise<void> => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => {
        server.close(() => {
          return resolve();
        });
      });
      await database.destroy();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

/** Inserts an original whose known bytes are the SHA-256 test vector abc. */
export async function insertBackfillItem(
  fixture: Readonly<BackfillFixture>,
  id: string,
): Promise<void> {
  const maximum = await fixture.database
    .selectFrom("items")
    .select((expression) => {
      return expression.fn.max<number>("seq").as("seq");
    })
    .executeTakeFirstOrThrow();
  await insertItem(fixture.database, {
    id,
    uploadedBy: fixture.memberId,
    byte_size: 3,
    seq: (maximum.seq ?? 0) + 1,
  });
  await fixture.database
    .insertInto("item_renditions")
    .values({
      id: `original-${id}`,
      item_id: id,
      purpose: "original",
      storage_key: `${id}.jpg`,
      byte_size: 3,
      width: 1,
      height: 1,
      content_type: "image/jpeg",
    })
    .execute();
  fixture.responses.set(`/bucket/isolated/family/${id}.jpg`, (response) => {
    response.writeHead(200, { "content-length": "3", etag: '"not-sha256"' });
    response.end("abc");
  });
}

/** Runs the production command in plain Node with only fake credentials. */
export function runBackfillCli(fixture: Readonly<BackfillFixture>): Promise<{
  status: number | null;
  stdout: string;
  stderr: string;
}> {
  const script = fileURLToPath(
    new URL("../../scripts/backfillChecksums.ts", import.meta.url),
  );
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      env: {
        NODE_ENV: "test",
        DATABASE_PATH: fixture.path,
        SESSION_SECRET: "checksum-test-session-secret-not-real",
        B2_ENDPOINT: fixture.endpoint,
        B2_KEY_ID: "fake-key-id",
        B2_APPLICATION_KEY: "fake-application-secret",
        B2_BUCKET: "bucket",
        B2_REGION: "us-west-004",
        B2_KEY_PREFIX: "isolated/family",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (status) => {
      resolve({ status, stdout, stderr });
    });
  });
}
