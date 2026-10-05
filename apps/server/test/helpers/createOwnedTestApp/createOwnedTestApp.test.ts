import { beforeEach, expect, it, vi } from "vitest";
import { sql } from "kysely";
import { createOwnedTestApp } from "./createOwnedTestApp.ts";

const teardown = vi.hoisted(() => {
  return { finishers: [] as Array<() => Promise<void>> };
}) satisfies { finishers: Array<() => Promise<void>> };

vi.mock("vitest", async () => {
  const actual = await vi.importActual<typeof import("vitest")>("vitest");
  return {
    ...actual,
    onTestFinished: (callback: () => Promise<void>): void => {
      teardown.finishers.push(callback);
    },
  };
});

beforeEach(() => {
  teardown.finishers.length = 0;
});

it("closes the real application and database after fixture seeding rejects", async () => {
  const context = await createOwnedTestApp();
  try {
    await expect(
      sql`select * from missing_fixture_table`.execute(context.database),
    ).rejects.toThrow();
    await Promise.all(
      teardown.finishers.map((finish) => {
        return finish();
      }),
    );
    await expect(
      context.database.selectFrom("members").selectAll().execute(),
    ).rejects.toThrow();
    await expect(context.app.inject("/api/health")).rejects.toThrow();
  } finally {
    await context.close();
  }
});

it("finishes cleanup safely after the caller closes the application early", async () => {
  const context = await createOwnedTestApp();
  try {
    await context.close();
    await expect(
      Promise.all(
        teardown.finishers.map((finish) => {
          return finish();
        }),
      ),
    ).resolves.toEqual([undefined]);
  } finally {
    await context.close();
  }
});
