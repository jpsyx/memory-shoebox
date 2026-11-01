import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { getMigrationSourcesFromFiles } from "../../src/db/migrationSources.ts";
import { insertMember } from "../helpers/seedHelpers/memberSeedHelpers.ts";

const script = fileURLToPath(
  new URL("../../scripts/memberNames.ts", import.meta.url),
);

/** Shared run member names cli for focused local regression scenarios. */
export function runMemberNamesCli(
  args: readonly string[],
): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
  });
}

/**
 * Shared create member name rollout fixture for focused local regression
 * scenarios.
 */
export async function createMemberNameRolloutFixture(): Promise<{
  directory: string;
  path: string;
  first: string;
  second: string;
}> {
  const directory = mkdtempSync(join(tmpdir(), "name-rollout-"));
  const path = join(directory, "catalog.db");
  const database = createDatabase(path);
  const sources = await getMigrationSourcesFromFiles();
  await migrateToLatest(database, {
    sources: Object.fromEntries(
      Object.entries(sources).filter(([name]) => {
        return name < "0019";
      }),
    ),
  });
  const first = await insertMember(database, { display_name: "John" });
  const second = await insertMember(database, { display_name: " JOHN " });
  await database.destroy();
  return { directory, path, first, second };
}

/**
 * Shared run member names terminal session for focused local regression
 * scenarios.
 */
export function runMemberNamesTerminalSession(
  keys: readonly string[],
  prompts: readonly string[],
): { status: number; stdout: string; stderr: string; terminal: string } {
  const python = `import os, pty, select, subprocess, sys, time, json
master, slave = pty.openpty()
os.set_blocking(master,False)
def session():
 os.setsid()
 import fcntl, termios
 fcntl.ioctl(slave,termios.TIOCSCTTY,0)
process = subprocess.Popen([sys.argv[1],sys.argv[2]],stdin=slave,stdout=subprocess.PIPE,stderr=subprocess.PIPE,preexec_fn=session)
os.close(slave)
transcript=b""
try:
 for prompt, keys in zip(json.loads(sys.argv[3]),json.loads(sys.argv[4])):
  segment=b""
  deadline=time.monotonic()+5
  while prompt.encode() not in segment and time.monotonic()<deadline:
   if select.select([master],[],[],0.05)[0]:
    try:
     data=os.read(master,65536)
     transcript+=data
     segment+=data
    except OSError: break
  if prompt.encode() not in segment: raise RuntimeError('Missing prompt '+prompt+' '+repr(transcript))
  os.write(master,keys.encode())
 deadline=time.monotonic()+5
 while process.poll() is None and time.monotonic()<deadline:
  if select.select([master],[],[],0.05)[0]:
   try: transcript+=os.read(master,65536)
   except OSError: break
 try:
  out,err=process.communicate(timeout=1)
 except subprocess.TimeoutExpired:
  process.kill()
  process.wait(timeout=1)
  raise RuntimeError(repr(transcript))
 print(json.dumps({'status':process.returncode,'stdout':out.decode(),'stderr':err.decode(),'terminal':transcript.decode()}))
finally:
 if process.poll() is None: process.kill()
 os.close(master)
`;
  const result = spawnSync(
    "python3",
    [
      "-c",
      python,
      process.execPath,
      script,
      JSON.stringify(prompts),
      JSON.stringify(keys),
    ],
    {
      encoding: "utf8",
      env: { ...process.env, NO_COLOR: "1" },
      timeout: 15000,
    },
  );
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout);
}
