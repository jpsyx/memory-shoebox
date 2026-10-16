import { fileURLToPath as fileUrlToPath } from "node:url";
import { build } from "vite";
import {
  InfiniteQueryObserver,
  QueryClient,
  type InfiniteData,
  type InfiniteQueryObserverOptions,
} from "@tanstack/react-query";
import type {
  TimelineResponse,
  TimelineSelection,
} from "@memory-shoebox/shared";

/** The production page fields inspected across the server/query boundary. */
export type TimelineIntegrationPage = TimelineResponse & {
  metadataUpdatedAt: number;
  selectionResultCount: number | undefined;
  requestCursor?: string;
  requestCursorKnown?: true;
};

/**
 * The actual query-options producer, without importing web aliases into Node
 * tsc.
 */
type TimelineAdapter = {
  makeTimelineQueryOptionsFromView: (options: {
    memberId: string;
    view: { selection: TimelineSelection; at: string | undefined };
  }) => InfiniteQueryObserverOptions<
    TimelineIntegrationPage,
    Error,
    InfiniteData<TimelineIntegrationPage, string | undefined>,
    string[],
    string | undefined
  >;
};

/**
 * Bundles only the real adapter in memory, with no app config or emitted files.
 */
export async function readTimelineAdapterFromBundle(): Promise<TimelineAdapter> {
  const root = fileUrlToPath(new URL("../../../../../", import.meta.url));
  const result = await build({
    root,
    configFile: false,
    logLevel: "error",
    resolve: { alias: { "@": `${root}apps/web/src` } },
    ssr: { noExternal: true },
    build: {
      write: false,
      ssr: `${root}apps/web/src/api/timelineHelpers/timelineHelpers.ts`,
      rollupOptions: { output: { format: "es", codeSplitting: false } },
    },
  });
  const output = Array.isArray(result) ? result[0] : result;
  if (output === undefined || !("output" in output)) {
    throw new Error(
      "The timeline adapter did not produce an in-memory bundle.",
    );
  }
  const chunk = output.output.find((entry) => {
    return entry.type === "chunk";
  });
  if (chunk === undefined) {
    throw new Error("The timeline adapter bundle has no module chunk.");
  }
  const module: { makeTimelineQueryOptionsFromView?: unknown } = await import(
    `data:text/javascript;base64,${Buffer.from(chunk.code).toString("base64")}`
  );
  if (typeof module.makeTimelineQueryOptionsFromView !== "function") {
    throw new Error(
      "The timeline bundle did not export its query-options producer.",
    );
  }
  return module as TimelineAdapter;
}

/**
 * A real query client with deterministic failure handling for this integration.
 */
export function makeTimelineIntegrationClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

/** The installed real observer, typed from its owning web package. */
export function makeTimelineObserverFromOptions(
  options: Readonly<{
    client: QueryClient;
    queryOptions: ReturnType<
      TimelineAdapter["makeTimelineQueryOptionsFromView"]
    >;
  }>,
): InfiniteQueryObserver<
  TimelineIntegrationPage,
  Error,
  InfiniteData<TimelineIntegrationPage, string | undefined>,
  string[],
  string | undefined
> {
  return new InfiniteQueryObserver(options.client, options.queryOptions);
}
