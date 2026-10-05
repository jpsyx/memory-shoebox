import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { request } from "node:http";
import { createServer, type Server } from "node:https";
import { join } from "node:path";

async function _makeCertificateFromDirectory(
  directory: string,
): Promise<{ key: Buffer; cert: Buffer }> {
  const keyPath = join(directory, "localhost.key");
  const certificatePath = join(directory, "localhost.crt");
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      keyPath,
      "-out",
      certificatePath,
      "-days",
      "1",
      "-subj",
      "/CN=localhost",
    ],
    { stdio: "ignore" },
  );
  return {
    key: await readFile(keyPath),
    cert: await readFile(certificatePath),
  };
}

function _closeProxy(proxy: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    proxy.close((error) => {
      if (error === undefined) {
        resolve();
      } else {
        reject(error);
      }
    });
    proxy.closeAllConnections();
  });
}

/** Test TLS termination preserves the real Secure session cookie in WebKit. */
export async function createSetupHttpsProxy(
  directory: string,
  upstream: string,
): Promise<{ origin: string; close: () => Promise<void> }> {
  const proxy = createServer(
    await _makeCertificateFromDirectory(directory),
    (incoming, outgoing) => {
      const forwarded = request(
        new URL(incoming.url ?? "/", upstream),
        {
          method: incoming.method,
          headers: { ...incoming.headers, "x-forwarded-proto": "https" },
        },
        (response) => {
          outgoing.writeHead(response.statusCode ?? 502, response.headers);
          response.pipe(outgoing);
        },
      );
      forwarded.on("error", () => {
        outgoing.writeHead(502);
        outgoing.end();
      });
      incoming.pipe(forwarded);
    },
  );
  await new Promise<void>((resolve, reject) => {
    proxy.once("error", reject);
    proxy.listen(0, "127.0.0.1", resolve);
  });
  const address = proxy.address();
  if (address === null || typeof address === "string") {
    throw new Error("Missing TLS loopback address");
  }
  return {
    origin: `https://127.0.0.1:${address.port}`,
    close: (): Promise<void> => {
      return _closeProxy(proxy);
    },
  };
}
