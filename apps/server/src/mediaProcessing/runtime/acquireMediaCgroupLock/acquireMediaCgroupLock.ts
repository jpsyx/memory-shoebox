import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { open, realpath, stat, type FileHandle } from "node:fs/promises";

function _acquireDescriptorLock(descriptor: FileHandle): Promise<void> {
  return new Promise<void>((settle, fail) => {
    const helper = spawn("flock", ["--exclusive", "--nonblock", "3"], {
      stdio: ["ignore", "ignore", "ignore", descriptor.fd],
    });
    const timer = setTimeout(() => {
      helper.kill("SIGKILL");
      fail(new Error("processing_isolation_unavailable"));
    }, 2000);
    helper.once("error", () => {
      clearTimeout(timer);
      fail(new Error("processing_isolation_unavailable"));
    });
    helper.once("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        settle();
      } else {
        fail(
          new Error(
            code === 1
              ? "processing_group_owned"
              : "processing_isolation_unavailable",
          ),
        );
      }
    });
  });
}

/**
 * Retains the flock's shared open-file description in the API process itself.
 * Parent death releases ownership even when codec descendants survive.
 */
export async function acquireMediaCgroupLock(
  root: string,
): Promise<FileHandle> {
  const descriptor = await open(
    root,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  try {
    await _acquireDescriptorLock(descriptor);
    const [opened, current, canonical] = await Promise.all([
      descriptor.stat(),
      stat(root),
      realpath(root),
    ]);
    if (
      opened.dev !== current.dev ||
      opened.ino !== current.ino ||
      canonical !== root
    ) {
      throw new Error("processing_isolation_unavailable");
    }
    return descriptor;
  } catch (error) {
    await descriptor.close();
    throw error;
  }
}
