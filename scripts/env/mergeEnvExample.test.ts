import { describe, expect, it } from "vitest";
import {
  getKeyBlocksFromEnv,
  makeMergedEnvFromExample,
} from "./mergeEnvExample";

const EXAMPLE = `# The file header, which explains the whole thing.
# It is not attached to any one key.

# --- Sessions ---
# The one secret this instance needs.
# Generate one with: openssl rand -hex 32
SESSION_SECRET=

# --- Storage ---
# Where the bytes go.
B2_BUCKET=
B2_REGION=
`;

describe("getKeyBlocksFromEnv", () => {
  it("finds every key in the order the file declares them", () => {
    expect(
      getKeyBlocksFromEnv(EXAMPLE).map((block) => {
        return block.name;
      }),
    ).toEqual(["SESSION_SECRET", "B2_BUCKET", "B2_REGION"]);
  });

  it("keeps the comment lines directly above a key as part of it", () => {
    const sessionSecret = getKeyBlocksFromEnv(EXAMPLE)[0];

    expect(sessionSecret?.lines).toEqual([
      "# --- Sessions ---",
      "# The one secret this instance needs.",
      "# Generate one with: openssl rand -hex 32",
      "SESSION_SECRET=",
    ]);
  });

  it("does not attach a note that a blank line separates from the key", () => {
    // The file header sits above `SESSION_SECRET` with a blank line between,
    // so it belongs to the file rather than to that key. Dragging it along
    // would repeat the whole preamble every time one key is added.
    expect(getKeyBlocksFromEnv(EXAMPLE)[0]?.lines).not.toContain(
      "# The file header, which explains the whole thing.",
    );
  });

  it("gives a key with no comment above it just its own line", () => {
    expect(getKeyBlocksFromEnv(EXAMPLE)[2]?.lines).toEqual(["B2_REGION="]);
  });

  it("reads a key that already has a value", () => {
    expect(
      getKeyBlocksFromEnv("FOO=a-real-value\n").map((block) => {
        return block.name;
      }),
    ).toEqual(["FOO"]);
  });

  it("does not mistake a commented-out key for a key that is set", () => {
    expect(getKeyBlocksFromEnv("# FOO=not-set\n")).toEqual([]);
  });
});

describe("makeMergedEnvFromExample", () => {
  it("leaves a file alone when it already has every key", () => {
    const local = "SESSION_SECRET=kept\nB2_BUCKET=kept\nB2_REGION=kept\n";

    const merged = makeMergedEnvFromExample({
      example: EXAMPLE,
      local,
      exampleLabel: "apps/server/.env.example",
    });

    expect(merged.addedKeys).toEqual([]);
    expect(merged.contents).toBe(local);
  });

  it("never touches a value somebody has already filled in", () => {
    const merged = makeMergedEnvFromExample({
      example: EXAMPLE,
      local: "SESSION_SECRET=a-real-secret\n",
      exampleLabel: "apps/server/.env.example",
    });

    expect(merged.contents).toContain("SESSION_SECRET=a-real-secret");
    expect(merged.contents).not.toContain("SESSION_SECRET=\n");
  });

  it("brings a new key across with the comments that explain it", () => {
    const merged = makeMergedEnvFromExample({
      example: EXAMPLE,
      local: "SESSION_SECRET=a-real-secret\nB2_BUCKET=a-bucket\n",
      exampleLabel: "apps/server/.env.example",
    });

    expect(merged.addedKeys).toEqual(["B2_REGION"]);
    expect(merged.contents).toContain("B2_REGION=");
  });

  it("brings the whole comment block, not only the last line of it", () => {
    const merged = makeMergedEnvFromExample({
      example: EXAMPLE,
      local: "B2_BUCKET=a-bucket\nB2_REGION=a-region\n",
      exampleLabel: "apps/server/.env.example",
    });

    expect(merged.contents).toContain("# The one secret this instance needs.");
    expect(merged.contents).toContain(
      "# Generate one with: openssl rand -hex 32",
    );
    expect(merged.contents).toContain("# --- Sessions ---");
  });

  it("adds several keys in the order the example declares them", () => {
    const merged = makeMergedEnvFromExample({
      example: EXAMPLE,
      local: "B2_BUCKET=a-bucket\n",
      exampleLabel: "apps/server/.env.example",
    });

    expect(merged.addedKeys).toEqual(["SESSION_SECRET", "B2_REGION"]);
    expect(merged.contents.indexOf("SESSION_SECRET")).toBeLessThan(
      merged.contents.indexOf("B2_REGION"),
    );
  });

  it("says where the new keys came from, so the addition is not a mystery", () => {
    const merged = makeMergedEnvFromExample({
      example: EXAMPLE,
      local: "SESSION_SECRET=a-real-secret\nB2_BUCKET=b\n",
      exampleLabel: "apps/server/.env.example",
    });

    expect(merged.contents).toContain("apps/server/.env.example");
    expect(merged.contents).toContain("reset-env");
  });

  it("is idempotent: merging twice adds nothing the second time", () => {
    const once = makeMergedEnvFromExample({
      example: EXAMPLE,
      local: "SESSION_SECRET=a-real-secret\n",
      exampleLabel: "apps/server/.env.example",
    });
    const twice = makeMergedEnvFromExample({
      example: EXAMPLE,
      local: once.contents,
      exampleLabel: "apps/server/.env.example",
    });

    expect(twice.addedKeys).toEqual([]);
    expect(twice.contents).toBe(once.contents);
  });

  it("does not run the new block into the last line of the old file", () => {
    const merged = makeMergedEnvFromExample({
      example: "FOO=\nBAR=\n",
      local: "FOO=kept",
      exampleLabel: "an.example",
    });

    expect(merged.contents.startsWith("FOO=kept\n")).toBe(true);
    expect(merged.contents.endsWith("\n")).toBe(true);
  });

  it("fills an empty file from the example, keys and comments alike", () => {
    const merged = makeMergedEnvFromExample({
      example: EXAMPLE,
      local: "",
      exampleLabel: "apps/server/.env.example",
    });

    expect(merged.addedKeys).toEqual([
      "SESSION_SECRET",
      "B2_BUCKET",
      "B2_REGION",
    ]);
  });
});
