import { expect, it } from "vitest";
import { uploadSizeLabel } from "./uploadSizeLabel";
it.each([
  [0, "0 B"],
  [1023, "1,023 B"],
  [1024, "1 KB"],
  [1536, "1.5 KB"],
  [1024 ** 2, "1 MB"],
  [Math.round(4.2 * 1024 ** 2), "4.2 MB"],
  [1024 ** 3, "1 GB"],
  [1.5 * 1024 ** 3, "1.5 GB"],
  [1024 ** 2 - 1, "1 MB"],
  [1024 ** 3 - 1, "1 GB"],
])("formats %s as %s", (bytes, label) => {
  return expect(uploadSizeLabel(Number(bytes))).toBe(label);
});
