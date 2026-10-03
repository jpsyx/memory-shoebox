import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getProofFilePathsFromDirectory } from "./getProofFilePathsFromDirectory";

describe("getProofFilePathsFromDirectory", () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "upload-proof-files-"));
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it("lists the directory's own files, sorted, and nothing else", () => {
    writeFileSync(join(directory, "b.jpg"), "b");
    writeFileSync(join(directory, "a.heic"), "a");
    writeFileSync(join(directory, ".hidden.jpg"), "h");
    mkdirSync(join(directory, "nested"));
    writeFileSync(join(directory, "nested", "deep.jpg"), "d");
    symlinkSync(
      join(directory, "a.heic"),
      join(directory, "link-to-file.heic"),
    );
    symlinkSync(
      join(directory, "nested"),
      join(directory, "link-to-directory"),
    );

    expect(getProofFilePathsFromDirectory(directory)).toEqual({
      paths: [join(directory, "a.heic"), join(directory, "b.jpg")],
    });
  });

  it("refuses a directory with nothing to pick, rather than waiting on an empty pick", () => {
    writeFileSync(join(directory, ".hidden.jpg"), "h");
    mkdirSync(join(directory, "nested"));

    expect(getProofFilePathsFromDirectory(directory)).toEqual({
      problem: `${directory} has no files to pick. Dotfiles, subdirectories and symlinks are skipped.`,
    });
  });

  it("refuses a path that is not there, and one that is not a directory", () => {
    writeFileSync(join(directory, "a.jpg"), "a");

    expect(getProofFilePathsFromDirectory(join(directory, "missing"))).toEqual({
      problem: `${join(directory, "missing")} is not a directory.`,
    });
    expect(getProofFilePathsFromDirectory(join(directory, "a.jpg"))).toEqual({
      problem: `${join(directory, "a.jpg")} is not a directory.`,
    });
  });
});
