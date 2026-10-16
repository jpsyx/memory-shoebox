import { randomUUID as randomUuid } from "node:crypto";

import type {
  FakeS3Exchange,
  OpenUpload,
  CompletedPart,
} from "./createFakeS3Server.types.ts";

import {
  sendFakeS3Xml,
  makeXmlTextFromPlainText,
  sendFakeS3Error,
  makeEtagFromBytes,
  getCompletedPartsFromXml,
  makeEtagFromParts,
} from "./fakeS3ProtocolHelpers.ts";

import {
  S3_NAMESPACE,
  MINIMUM_PART_BYTES,
} from "./createFakeS3Server.constants.ts";

/** `POST ?uploads`: opens an upload and names it. */
export function answerFakeS3CreateMultipartUpload(
  exchange: FakeS3Exchange,
): void {
  const { request, response, state, key } = exchange;
  const uploadId = randomUuid();
  state.uploads.set(uploadId, {
    key,
    contentType: request.headers["content-type"] ?? "binary/octet-stream",
    parts: new Map(),
  });
  sendFakeS3Xml({
    response,
    status: 200,
    xml: `<InitiateMultipartUploadResult xmlns="${S3_NAMESPACE}"><Bucket>${makeXmlTextFromPlainText(state.bucketName)}</Bucket><Key>${makeXmlTextFromPlainText(key)}</Key><UploadId>${uploadId}</UploadId></InitiateMultipartUploadResult>`,
  });
}

/** The open upload this request names, or undefined once it has said 404. */
function _getOpenUploadOr404(exchange: FakeS3Exchange): OpenUpload | undefined {
  const uploadId = exchange.query.get("uploadId") ?? "";
  const upload = exchange.state.uploads.get(uploadId);
  if (upload === undefined || upload.key !== exchange.key) {
    sendFakeS3Error({
      response: exchange.response,
      status: 404,
      code: "NoSuchUpload",
      message: "The specified multipart upload does not exist.",
    });
    return undefined;
  }
  return upload;
}

/** `PUT ?partNumber&uploadId`: stores one part and returns its ETag. */
export function answerFakeS3UploadPart(exchange: FakeS3Exchange): void {
  const upload = _getOpenUploadOr404(exchange);
  if (upload === undefined) {
    return;
  }
  const partNumber = Number(exchange.query.get("partNumber"));
  if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10000) {
    sendFakeS3Error({
      response: exchange.response,
      status: 400,
      code: "InvalidArgument",
      message: "Part number must be an integer between 1 and 10000.",
    });
    return;
  }
  const etag = makeEtagFromBytes(exchange.body);
  upload.parts.set(partNumber, { body: exchange.body, etag });
  exchange.response.writeHead(200, { ETag: etag }).end();
}

/** What S3 would refuse about a completion, or undefined when nothing. */
function _getCompletionRefusal(options: {
  upload: OpenUpload;
  completed: readonly CompletedPart[];
}): { code: string; message: string } | undefined {
  const { upload, completed } = options;
  if (completed.length === 0) {
    return { code: "MalformedXML", message: "No parts were listed." };
  }
  const isAscending = completed.every((part, index) => {
    const previous = completed[index - 1];
    return previous === undefined || part.partNumber > previous.partNumber;
  });
  if (!isAscending) {
    return { code: "InvalidPartOrder", message: "Parts are not ascending." };
  }
  const unknownPart = completed.find((part) => {
    const stored = upload.parts.get(part.partNumber);
    return (
      stored === undefined ||
      !((first: string, second: string): boolean => {
        return first.replace(/^"|"$/g, "") === second.replace(/^"|"$/g, "");
      })(stored.etag, part.etag)
    );
  });
  if (unknownPart !== undefined) {
    return {
      code: "InvalidPart",
      message: `Part ${unknownPart.partNumber} has no upload with ETag ${unknownPart.etag}.`,
    };
  }
  const smallPart = completed.slice(0, -1).find((part) => {
    const size = upload.parts.get(part.partNumber)?.body.length ?? 0;
    return size < MINIMUM_PART_BYTES;
  });
  return smallPart === undefined
    ? undefined
    : {
        code: "EntityTooSmall",
        message: `Part ${smallPart.partNumber} is under 5 MiB and is not the last.`,
      };
}

/** `POST ?uploadId`: joins the listed parts, in the body's order. */
export function answerFakeS3CompleteMultipartUpload(
  exchange: FakeS3Exchange,
): void {
  const { response, state, key, body } = exchange;
  const upload = _getOpenUploadOr404(exchange);
  if (upload === undefined) {
    return;
  }
  const completed = getCompletedPartsFromXml(body.toString("utf8"));
  const refusal = _getCompletionRefusal({ upload, completed });
  if (refusal !== undefined) {
    sendFakeS3Error({ response, status: 400, ...refusal });
    return;
  }
  const parts = completed.flatMap((part) => {
    const stored = upload.parts.get(part.partNumber);
    return stored === undefined ? [] : [stored];
  });
  const etag = makeEtagFromParts(parts);
  const joined = Buffer.concat(
    parts.map((part) => {
      return part.body;
    }),
  );
  state.objects.set(key, {
    body: joined,
    contentType: upload.contentType,
    etag,
    lastModified: state.clock().toUTCString(),
  });
  state.uploads.delete(exchange.query.get("uploadId") ?? "");
  sendFakeS3Xml({
    response,
    status: 200,
    xml: `<CompleteMultipartUploadResult xmlns="${S3_NAMESPACE}"><Bucket>${makeXmlTextFromPlainText(state.bucketName)}</Bucket><Key>${makeXmlTextFromPlainText(key)}</Key><ETag>${makeXmlTextFromPlainText(etag)}</ETag></CompleteMultipartUploadResult>`,
  });
}

/** `DELETE ?uploadId`: drops the parts. An unknown upload is S3's 404. */
export function answerFakeS3AbortMultipartUpload(
  exchange: FakeS3Exchange,
): void {
  const upload = _getOpenUploadOr404(exchange);
  if (upload === undefined) {
    return;
  }
  exchange.state.uploads.delete(exchange.query.get("uploadId") ?? "");
  exchange.response.writeHead(204).end();
}

/** GET ?uploadId: list only the parts of the matching key and upload. */
export function answerFakeS3ListParts(exchange: FakeS3Exchange): void {
  const upload = _getOpenUploadOr404(exchange);
  if (upload === undefined) {
    return;
  }
  const parts = [...upload.parts.entries()].sort(([first], [second]) => {
    return first - second;
  });
  const xmlParts = parts
    .map(([partNumber, part]) => {
      return `<Part><PartNumber>${partNumber}</PartNumber><ETag>${makeXmlTextFromPlainText(part.etag)}</ETag><Size>${part.body.length}</Size></Part>`;
    })
    .join("");
  sendFakeS3Xml({
    response: exchange.response,
    status: 200,
    xml: `<ListPartsResult xmlns="${S3_NAMESPACE}"><Bucket>${makeXmlTextFromPlainText(exchange.state.bucketName)}</Bucket><Key>${makeXmlTextFromPlainText(exchange.key)}</Key><UploadId>${makeXmlTextFromPlainText(exchange.query.get("uploadId") ?? "")}</UploadId><IsTruncated>false</IsTruncated>${xmlParts}</ListPartsResult>`,
  });
}

/** GET ?uploads: S3's prefix listing, paginated by the key/upload ID pair. */
export function answerFakeS3ListMultipartUploads(
  exchange: FakeS3Exchange,
): void {
  const { query, state, response } = exchange;
  const prefix = query.get("prefix") ?? "";
  const keyMarker = query.get("key-marker") ?? "";
  const uploadIdMarker = query.get("upload-id-marker") ?? "";
  const maximum = Math.min(
    1000,
    Math.max(1, Number(query.get("max-uploads") ?? 1000)),
  );
  const uploads = [...state.uploads.entries()]
    .map(([uploadId, upload]) => {
      return { key: upload.key, uploadId };
    })
    .filter((upload) => {
      return (
        upload.key.startsWith(prefix) &&
        (upload.key > keyMarker ||
          (upload.key === keyMarker && upload.uploadId > uploadIdMarker))
      );
    })
    .sort((first, second) => {
      return first.key !== second.key
        ? first.key < second.key
          ? -1
          : 1
        : first.uploadId < second.uploadId
          ? -1
          : 1;
    });
  const page = uploads.slice(0, maximum);
  const isTruncated = uploads.length > page.length;
  const last = page.at(-1);
  const markers =
    isTruncated && last !== undefined
      ? `<NextKeyMarker>${makeXmlTextFromPlainText(last.key)}</NextKeyMarker><NextUploadIdMarker>${makeXmlTextFromPlainText(last.uploadId)}</NextUploadIdMarker>`
      : "";
  const entries = page
    .map((upload) => {
      return `<Upload><Key>${makeXmlTextFromPlainText(upload.key)}</Key><UploadId>${makeXmlTextFromPlainText(upload.uploadId)}</UploadId></Upload>`;
    })
    .join("");
  sendFakeS3Xml({
    response,
    status: 200,
    xml: `<ListMultipartUploadsResult xmlns="${S3_NAMESPACE}"><Bucket>${makeXmlTextFromPlainText(state.bucketName)}</Bucket><IsTruncated>${isTruncated}</IsTruncated>${markers}${entries}</ListMultipartUploadsResult>`,
  });
}
