import { getOffsetsFromStrings } from "./uploadPhotoFixtureHelpers.ts";

/** A one-page PDF with a correct cross-reference table, and nothing on it. */
export function makeMinimalPdf(): Buffer {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>",
  ].map((body, index) => {
    return `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const header = "%PDF-1.4\n";
  const offsets = getOffsetsFromStrings({
    strings: objects.map((object) => {
      return Buffer.from(object, "latin1");
    }),
    firstOffset: header.length,
  });
  const xrefOffset = header.length + objects.join("").length;
  const xref = [
    `xref\n0 ${objects.length + 1}\n`,
    "0000000000 65535 f \n",
    ...offsets.map((offset) => {
      return `${String(offset).padStart(10, "0")} 00000 n \n`;
    }),
  ].join("");
  const trailer =
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n` +
    `startxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(`${header}${objects.join("")}${xref}${trailer}`, "latin1");
}
