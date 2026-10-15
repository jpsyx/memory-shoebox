import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const PREFIX = "memory-shoebox-job-v1-";
const OWNED_NAME =
  /^memory-shoebox-job-v1-([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})-([1-9]\d*)-(\d+)$/;

async function _getStartTimeFromPid(pid: string): Promise<string | undefined> {
  try {
    const status = await readFile(`/proc/${pid}/stat`, "utf8");
    const startTime = status.slice(status.lastIndexOf(")") + 2).split(" ")[19];
    if (startTime === undefined || !/^\d+$/.test(startTime)) {
      throw new Error("processing_group_unrecognized");
    }
    return startTime;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

async function _getBootId(): Promise<string> {
  const boot = (
    await readFile("/proc/sys/kernel/random/boot_id", "utf8")
  ).trim();
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(boot)) {
    throw new Error("processing_group_unrecognized");
  }
  return boot;
}

async function _getStalePathFromName(
  options: Readonly<{ root: string; boot: string; name: string }>,
): Promise<string> {
  const { root, boot, name } = options;
  if (name === "memory-shoebox-job") {
    throw new Error("processing_group_legacy_unowned");
  }
  const match = OWNED_NAME.exec(name);
  if (match === null) {
    throw new Error("processing_group_unrecognized");
  }
  if (
    match[1] === boot &&
    (await _getStartTimeFromPid(match[2]!)) === match[3]
  ) {
    throw new Error("processing_group_owned");
  }
  return join(root, name);
}

/** Atomic directory names preserve owner identity even before control writes. */
export async function getMediaGroupOwnershipFromRoot(root: string): Promise<{
  currentPath: string;
  stalePaths: string[];
}> {
  const boot = await _getBootId();
  const startTime = await _getStartTimeFromPid(String(process.pid));
  if (startTime === undefined) {
    throw new Error("processing_group_unrecognized");
  }
  const names = (await readdir(root)).filter((name) => {
    return name.startsWith("memory-shoebox-job");
  });
  if (names.length > 8) {
    throw new Error("processing_group_unrecognized");
  }
  const stalePaths = await Promise.all(
    names.map((name) => {
      return _getStalePathFromName({ root, boot, name });
    }),
  );
  return {
    currentPath: join(root, `${PREFIX}${boot}-${process.pid}-${startTime}`),
    stalePaths,
  };
}
