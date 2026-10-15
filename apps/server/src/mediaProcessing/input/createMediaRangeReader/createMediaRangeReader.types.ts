import { EventEmitter } from "node:events";

import { type ServerResponse } from "node:http";

import type { B2Client } from "../../../b2/createB2Client/createB2Client.types.ts";

import { FAILURE_CODES } from "./createMediaRangeReader.constants.ts";

/** Sanitized transfer diagnostics; retry policy belongs to the worker. */
export type MediaRangeReaderFailure = (typeof FAILURE_CODES)[number];

/** Internal module responsibility shared by the entry point. */
export type ReaderOptions = {
  b2: B2Client;
  key: string;
  sourceBytes: number;
  signal: AbortSignal;
  phaseByteLimit?: number;
};

/** A credential-free child URL backed by one persistent per-job meter. */
export type MediaRangeReader = {
  url: string;
  getBytesRead: () => number;
  /** Terminal failures take precedence over later transient failures. */
  getFailure: () => MediaRangeReaderFailure | undefined;
  /** Requires idle readers; a new phase cannot reset aggregate accounting. */
  setPhaseByteLimit: (limit: number | undefined) => void;
  /** Waits for actual upstream settlement; cancellation does not reset meters. */
  awaitIdle: (signal: AbortSignal) => Promise<void>;
  close: () => Promise<void>;
};

/** Internal module responsibility shared by the entry point. */
export type ReaderState = {
  sourceBytes: number;
  upstreamUrl: string;
  bytesRead: number;
  reservedBytes: number;
  requests: number;
  byteLimit: number;
  phaseByteLimit: number | undefined;
  active: Set<AbortController>;
  capacityChanges: EventEmitter;
  etag: string | undefined;
  failure: MediaRangeReaderFailure | undefined;
};

/** Internal module responsibility shared by the entry point. */
export type Transfer = {
  state: ReaderState;
  response: ServerResponse;
  controller: AbortController;
  start: number;
  end: number;
};
