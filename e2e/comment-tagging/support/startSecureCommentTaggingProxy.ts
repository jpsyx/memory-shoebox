import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { request } from "node:http";
import { createServer, type Server as SecureServer } from "node:https";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createB2Client } from "../../../apps/server/src/b2/createB2Client/createB2Client.ts";
import { E2E_SERVER_ENVIRONMENT } from "../../support/e2eEnvironment.constants.ts";
import type { CommentTaggingCatalog } from "./runCommentTaggingServer.ts";

function _makeTemporaryCertificate(directory: string) {
  chmodSync(directory, 0o700);
  const key = join(directory, "key.pem");
  const certificate = join(directory, "certificate.pem");
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      key,
      "-out",
      certificate,
      "-days",
      "1",
      "-subj",
      "/CN=127.0.0.1",
      "-addext",
      "subjectAltName=IP:127.0.0.1",
    ],
    { stdio: "ignore" },
  );
  chmodSync(key, 0o600);
  return { key, certificate };
}

function _makeSecureProxy(
  catalog: CommentTaggingCatalog,
  key: string,
  certificate: string,
): SecureServer {
  return createServer(
    { key: readFileSync(key), cert: readFileSync(certificate) },
    (incoming, outgoing) => {
      const upstream = incoming.url?.startsWith(
        `/${E2E_SERVER_ENVIRONMENT.B2_BUCKET}/`,
      )
        ? catalog.endpoint
        : catalog.origin;
      const url = new URL(incoming.url ?? "/", upstream);
      if (url.origin !== upstream) {
        outgoing.writeHead(400).end();
        return;
      }
      const target = request(
        url,
        { method: incoming.method, headers: incoming.headers },
        (response) => {
          outgoing.writeHead(response.statusCode ?? 502, response.headers);
          response.pipe(outgoing);
        },
      );
      target.on("error", () => {
        outgoing.writeHead(502).end();
      });
      incoming.pipe(target);
    },
  );
}

/**
 * HTTPS only for owned-browser Secure-cookie acceptance, with no trust
 * changes.
 */
export async function startSecureCommentTaggingProxy(
  catalog: CommentTaggingCatalog,
): Promise<{ origin: string; close: () => Promise<void> }> {
  [catalog.origin, catalog.endpoint].forEach((value) => {
    if (new URL(value).hostname !== "127.0.0.1") {
      throw new Error("Refusing non-loopback proxy upstream");
    }
  });
  const directory = mkdtempSync(join(tmpdir(), "comment-tagging-tls-"));
  let server: SecureServer | undefined;
  const close = async () => {
    try {
      if (server) {
        server.closeAllConnections();
        await new Promise<void>((fulfill) => {
          server!.close(() => {
            fulfill();
          });
        });
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  };
  try {
    const { key, certificate } = _makeTemporaryCertificate(directory);
    server = _makeSecureProxy(catalog, key, certificate);
    const listening = server;
    await new Promise<void>((fulfill, reject) => {
      listening.once("error", reject);
      listening.listen(0, "127.0.0.1", () => {
        listening.removeListener("error", reject);
        fulfill();
      });
    });
    const origin = `https://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const signing = createB2Client({ ...catalog.config.b2, endpoint: origin });
    catalog.b2.presignGet = signing.presignGet;
    catalog.b2.getMediaLease = signing.getMediaLease;
    await catalog.database
      .updateTable("settings")
      .set({ value: JSON.stringify(origin) })
      .where("key", "=", "public.base_url")
      .execute();
    return { origin, close };
  } catch (failure) {
    await close();
    throw failure;
  }
}
