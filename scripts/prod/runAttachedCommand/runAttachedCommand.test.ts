import { expect, it } from "vitest";
import { runAttachedCommand } from "./runAttachedCommand";

it("preserves child failure status", async () => {
  expect(
    await runAttachedCommand({
      executable: process.execPath,
      args: ["-e", "process.exit(23)"],
      env: process.env,
    }),
  ).toBe(23);
});

it("supplies the exact environment without reintroducing inherited credentials", async () => {
  expect(
    await runAttachedCommand({
      executable: process.execPath,
      args: [
        "-e",
        "process.exit(process.env.PROD_TEST === 'literal-$HOME' && !process.env.HOME ? 0 : 1)",
      ],
      env: { PROD_TEST: "literal-$HOME" },
    }),
  ).toBe(0);
});

it("explains a missing external CLI without echoing arguments or secrets", async () => {
  await expect(
    runAttachedCommand({
      executable: "missing-production-cli-fixture",
      args: ["private-value"],
      env: process.env,
    }),
  ).rejects.toThrow("missing-production-cli-fixture is unavailable");
});
