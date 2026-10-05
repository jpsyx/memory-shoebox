import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import {
  createTestApp,
  type TestApp,
} from "../../../apps/server/test/helpers/createTestApp";
import { createSetupProxyServer } from "../../../apps/web/test/setupProxyFixture";

async function _createSetupProxyContext(): Promise<{
  context: TestApp;
  proxyOrigin: string;
  close: () => Promise<void>;
}> {
  const directory = await mkdtemp(join(tmpdir(), "shoebox-setup-proxy-"));
  let context: TestApp | undefined;
  let proxy: Awaited<ReturnType<typeof createSetupProxyServer>> | undefined;
  const close = async () => {
    try {
      await proxy?.close();
    } finally {
      try {
        await context?.close();
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    }
  };
  try {
    context = await createTestApp({
      emailService: "none",
      mailDomainReader: "none",
    });
    const apiOrigin = await context.app.listen({ host: "127.0.0.1", port: 0 });
    proxy = await createSetupProxyServer({
      apiOrigin,
      rootDirectory: directory,
    });
    await proxy.listen();
    const address = proxy.httpServer?.address();
    if (
      address === undefined ||
      address === null ||
      typeof address === "string"
    ) {
      throw new Error("The development proxy did not open its test socket.");
    }
    return { context, proxyOrigin: `http://127.0.0.1:${address.port}`, close };
  } catch (error) {
    await close();
    throw error;
  }
}

it("accepts same-origin setup through the real development proxy while rejecting malicious origin authority", async () => {
  const fixture = await _createSetupProxyContext();
  const body = {
    admin: { displayName: "Rosa", email: "rosa@example.com" },
    shoebox: { name: "My Shoebox", timezone: "UTC" },
    public: { baseUrl: "https://editable-public.example.com" },
  };
  const send = (
    origin: string,
    forwardedHeaders: Record<string, string> = {},
  ) => {
    return fetch(`${fixture.proxyOrigin}/api/setup`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
        ...forwardedHeaders,
      },
      body: JSON.stringify(body),
    });
  };
  try {
    const malicious = await send("https://editable-public.example.com");
    expect(malicious.status).toBe(400);
    expect(await malicious.json()).toMatchObject({
      error: "invalid_request",
      details: {
        fieldErrors: { origin: ["Origin must match the serving origin."] },
      },
    });
    const spoofed = await send("https://evil.example.com", {
      "x-forwarded-host": "evil.example.com",
      "x-forwarded-proto": "https",
    });
    expect(spoofed.status).toBe(400);
    expect(await spoofed.json()).toMatchObject({ error: "invalid_request" });
    expect(
      await fixture.context.database
        .selectFrom("members")
        .selectAll()
        .execute(),
    ).toEqual([]);
    const created = await send(fixture.proxyOrigin);
    expect(created.status).toBe(201);
    expect(created.headers.get("set-cookie")).toContain(
      "HttpOnly; Secure; SameSite=Lax",
    );
    expect(await created.json()).toMatchObject({
      me: { role: "admin" },
      isFirstSignIn: true,
    });
    const cookie = created.headers.get("set-cookie")!.split(";")[0]!;
    expect(
      (await fetch(`${fixture.proxyOrigin}/api/me`, { headers: { cookie } }))
        .status,
    ).toBe(200);
    expect(
      await fixture.context.database
        .selectFrom("members")
        .selectAll()
        .execute(),
    ).toHaveLength(1);
  } finally {
    await fixture.close();
  }
}, 20_000);
