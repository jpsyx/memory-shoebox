import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import {
  createMemberNameRolloutFixture,
  runMemberNamesCli,
  runMemberNamesTerminalSession,
} from "./memberNameRolloutTestHelpers.ts";

it("shows complete root/subcommand help before any file access, with clean stdout", () => {
  for (const action of [[], ["audit"], ["stage"]]) {
    const result = runMemberNamesCli([
      ...action,
      "--database",
      "/does/not/exist",
      "--help",
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("--database");
    expect(result.stdout).toContain("Examples");
    expect(result.stderr).toBe("");
  }
});

it("fails missing unattended arguments promptly with usage and recovery advice", () => {
  const result = runMemberNamesCli(["stage"]);
  expect(result.status).toBe(1);
  expect(result.stdout).toBe("");
  expect(result.stderr).toContain("Usage:");
  expect(result.stderr).toContain("\n  ⚠️");
});

it("offers the bare-command action wizard with j/k and arrow navigation and clean cancellation", () => {
  const result = runMemberNamesTerminalSession(
    ["j", "k", "\u001b[B", "\u001b[A", "\u0003"],
    [
      "Member name rollout",
      "> Stage assignments",
      "> Audit names",
      "> Stage assignments",
      "> Audit names",
    ],
  );
  expect(result.status).toBe(130);
  expect(result.stdout).toBe("");
  expect(result.stderr).toBe("⚠️ Cancelled. No assignments staged.\n");
  expect(result.terminal).toContain("> Audit names");
  expect(result.terminal).toContain("Stage assignments");
});

it("asks all stage wizard values and cancels before any catalog access", () => {
  const result = runMemberNamesTerminalSession(
    ["j\r", "/does/not/exist\r", "/no/choices.json\r", "\r"],
    [
      "Member name rollout",
      "Existing catalog path",
      "Assignments JSON file",
      "Are all application processes stopped?",
    ],
  );
  expect(result.status).toBe(130);
  expect(result.stdout).toBe("");
  expect(result.stderr).not.toContain("Validating");
});

it("cancels promptly on Ctrl-C and EOF without side effects", () => {
  for (const key of ["\u0003", "\u0004"]) {
    const result = runMemberNamesTerminalSession(
      [key],
      ["Member name rollout"],
    );
    expect(result.status).toBe(130);
    expect(result.stdout).toBe("");
  }
});

it("keeps the full wizard plain with NO_COLOR while completing an offline stage", async () => {
  const { directory, path, first, second } =
    await createMemberNameRolloutFixture();
  try {
    const report = JSON.parse(
      runMemberNamesCli(["audit", "--database", path]).stdout,
    );
    const assignmentsPath = join(directory, "operator choices.json");
    writeFileSync(
      assignmentsPath,
      JSON.stringify({
        catalogFingerprint: report.catalogFingerprint,
        assignments: [
          { memberId: first, displayName: "John M" },
          { memberId: second, displayName: "John R" },
        ],
      }),
    );
    const result = runMemberNamesTerminalSession(
      ["j\r", `${path}\r`, `${assignmentsPath}\r`, "j\r"],
      [
        "Member name rollout",
        "Existing catalog path",
        "Assignments JSON file",
        "Are all application processes stopped?",
      ],
    );
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).staged).toBe(2);
    expect(result.terminal).not.toContain("\u001b[");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
