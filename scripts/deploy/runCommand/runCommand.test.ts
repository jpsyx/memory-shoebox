import { expect, it } from "vitest";
import { runCommand } from "./runCommand";

it("passes stdin and argv as data and buffers split output before redaction", async () => {
  const output: string[] = [];
  const result = await runCommand({
    executable: process.execPath,
    args: [
      "-e",
      `process.stdin.resume(); let input=''; process.stdin.on('data', chunk => input += chunk); process.stdin.on('end', () => { process.stdout.write(JSON.stringify({input, argument:process.argv[1], token:process.env.FLY_API_TOKEN})+'\\n'); process.stdout.write('pri'); setTimeout(() => process.stdout.write('vate-key\\ntail'), 10); });`,
      "$(touch unwanted)",
    ],
    cwd: process.cwd(),
    stdin: "private-key",
    env: { FLY_API_TOKEN: undefined },
    onOutput: (text) => {
      output.push(text);
    },
  });
  expect(JSON.parse(result.split("\n")[0]!)).toEqual({
    input: "private-key",
    argument: "$(touch unwanted)",
  });
  expect(output).toContain("private-key\n");
  expect(output).not.toContain("pri");
  expect(output.at(-1)).toBe("tail");
});

it("propagates nonzero exit status without echoing CLI secrets", async () => {
  await expect(
    runCommand({
      executable: process.execPath,
      args: ["-e", "process.stderr.write('private-key'); process.exitCode=7;"],
      cwd: process.cwd(),
      stdin: "private-key",
    }),
  ).rejects.toThrow("status 7");
});
