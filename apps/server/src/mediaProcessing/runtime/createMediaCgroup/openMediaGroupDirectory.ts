import { constants } from "node:fs";
import { open, stat, rmdir, type FileHandle } from "node:fs/promises";

/** Pins control-file operations to the exact opened cgroup directory. */
export type MediaGroupDirectory = {
  path: string;
  descriptor: FileHandle;
  remove: () => Promise<void>;
};

/** Opens only the identified child and refuses to remove a replacement name. */
export async function openMediaGroupDirectory(
  path: string,
): Promise<MediaGroupDirectory> {
  const descriptor = await open(
    path,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  const identity = await descriptor.stat().catch(async (error: unknown) => {
    await descriptor.close();
    throw error;
  });
  return {
    path: `/proc/${process.pid}/fd/${descriptor.fd}`,
    descriptor,
    remove: async () => {
      const current = await stat(path);
      if (current.dev !== identity.dev || current.ino !== identity.ino) {
        throw new Error("processing_group_identity_changed");
      }
      await rmdir(path);
    },
  };
}
