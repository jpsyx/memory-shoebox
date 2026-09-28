import { describe, expect, it } from "vitest";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertInstanceSetting } from "../helpers/seedHelpers/seedHelpers.ts";

describe("GET /api/public-settings", () => {
  it("answers a fresh Shoebox holding zero settings rows", async () => {
    const { app, close } = await createTestApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/public-settings",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      shoeboxName: "My Shoebox",
      baseUrl: null,
    });
    await close();
  });

  it("answers without a session, because there is no 401 by definition", async () => {
    const { app, database, close } = await createTestApp();
    await insertInstanceSetting(database, {
      key: "shoebox.name",
      value: "The Sarmiento Shoebox",
    });
    await insertInstanceSetting(database, {
      key: "public.base_url",
      value: "https://shoebox.example.com",
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/public-settings",
    });

    expect(response.json()).toEqual({
      shoeboxName: "The Sarmiento Shoebox",
      baseUrl: "https://shoebox.example.com",
    });
    await close();
  });

  it("serves the two publicly readable keys and nothing else", async () => {
    // The allow-list is the guard, not the handler: a key is readable
    // anonymously because it carries `isPubliclyReadable`, never because a
    // route forgot to check.
    const { app, database, close } = await createTestApp();
    await insertInstanceSetting(database, {
      key: "pile.arrangement",
      value: "tidy",
    });
    await insertInstanceSetting(database, {
      key: "mail.from_address",
      value: "shoebox@example.com",
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/public-settings",
    });

    expect(Object.keys(response.json()).sort()).toEqual([
      "baseUrl",
      "shoeboxName",
    ]);
    expect(response.payload).not.toContain("tidy");
    expect(response.payload).not.toContain("shoebox@example.com");
    await close();
  });

  it("survives a page being reloaded far more than twenty times", async () => {
    // The only per-IP rule in `conventions.md` is twenty an hour, aimed at
    // sign-in codes. This route renders the sign-in page's top bar.
    const { app, close } = await createTestApp();

    const statuses = [];
    for (let index = 0; index < 30; index += 1) {
      const response = await app.inject({
        method: "GET",
        url: "/api/public-settings",
      });
      statuses.push(response.statusCode);
    }

    expect(new Set(statuses)).toEqual(new Set([200]));
    await close();
  });

  it("still has a cap, at a hundred and twenty a minute", async () => {
    const { app, close } = await createTestApp();

    const statuses = [];
    for (let index = 0; index < 121; index += 1) {
      const response = await app.inject({
        method: "GET",
        url: "/api/public-settings",
      });
      statuses.push(response.statusCode);
    }

    expect(statuses[119]).toBe(200);
    expect(statuses[120]).toBe(429);
    await close();
  });
});
