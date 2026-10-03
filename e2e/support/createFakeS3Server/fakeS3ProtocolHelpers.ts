import { createHash } from "node:crypto";

import { type ServerResponse } from "node:http";

import type {
  StoredPart,
  CompletedPart,
  SendS3ErrorOptions,
} from "./createFakeS3Server.types.ts";

/** Text safe inside an XML element. */
export function makeXmlTextFromPlainText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/** The five named entities and numeric references, decoded. */
function makePlainTextFromXmlText(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
  };
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, name) => {
    const reference = String(name);
    if (reference.startsWith("#x") || reference.startsWith("#X")) {
      return String.fromCodePoint(Number.parseInt(reference.slice(2), 16));
    }
    return reference.startsWith("#")
      ? String.fromCodePoint(Number.parseInt(reference.slice(1), 10))
      : (named[reference] ?? entity);
  });
}

/** An S3-style ETag: the MD5 of the bytes, quoted. */
export function makeEtagFromBytes(bytes: Buffer): string {
  return `"${createHash("md5").update(bytes).digest("hex")}"`;
}

/** A multipart ETag: the MD5 of the parts' binary MD5s, then `-<count>`. */
export function makeEtagFromParts(parts: readonly StoredPart[]): string {
  const digests = parts.map((part) => {
    return createHash("md5").update(part.body).digest();
  });
  const combined = createHash("md5").update(Buffer.concat(digests));
  return `"${combined.digest("hex")}-${parts.length}"`;
}

/** Every `<Part>` in the order the body lists them. */
export function getCompletedPartsFromXml(xml: string): CompletedPart[] {
  return Array.from(xml.matchAll(/<Part>([\s\S]*?)<\/Part>/g)).map((match) => {
    const partXml = match[1] ?? "";
    const partNumber = /<PartNumber>\s*(\d+)\s*<\/PartNumber>/.exec(partXml);
    const etag = /<ETag>([\s\S]*?)<\/ETag>/.exec(partXml);
    return {
      partNumber: Number(partNumber?.[1] ?? Number.NaN),
      etag: makePlainTextFromXmlText(etag?.[1] ?? ""),
    };
  });
}

/** Writes an XML document, declaration first, as S3 does. */
export function sendFakeS3Xml(
  options: Readonly<{
    response: ServerResponse;
    status: number;
    xml: string;
  }>,
): void {
  options.response
    .writeHead(options.status, { "Content-Type": "application/xml" })
    .end(`<?xml version="1.0" encoding="UTF-8"?>${options.xml}`);
}

/** Writes S3's error document. */
export function sendFakeS3Error(options: SendS3ErrorOptions): void {
  sendFakeS3Xml({
    response: options.response,
    status: options.status,
    xml:
      `<Error><Code>${options.code}</Code>` +
      `<Message>${makeXmlTextFromPlainText(options.message)}</Message></Error>`,
  });
}
