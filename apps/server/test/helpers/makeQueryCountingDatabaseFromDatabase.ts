import type {
  Kysely,
  KyselyPlugin,
  PluginTransformQueryArgs,
  PluginTransformResultArgs,
  QueryResult,
  RootOperationNode,
  UnknownRow,
} from "kysely";
import type { Database } from "../../src/db/types/db.types.ts";

/** A handle that counts what it ran, and the counter beside it. */
export type QueryCountingDatabase = {
  /** Pass this to `createTestApp`, so the app runs what is counted. */
  database: Kysely<Database>;
  getQueryCount: () => number;
  /** Call after seeding, so the count covers the request and not the setup. */
  reset: () => void;
};

/**
 * Wraps a database handle so a test can assert what one request costs.
 *
 * The contract this exists for is that **no query in the read slice is per
 * item, per day or per burst** (`timeline.md` § Performance). That is a
 * property of the plan rather than of any one number, so the test it serves
 * asserts the same count for a small page and a large one.
 *
 * A Kysely plugin rather than the dialect's logger: `transformQuery` runs once
 * per execution, before compilation, which is exactly one tick per query and
 * needs no parsing of log lines.
 *
 * @param database The handle to wrap. It is not modified; a new one is
 *   returned that shares its driver.
 */
export function makeQueryCountingDatabaseFromDatabase(
  database: Kysely<Database>,
): QueryCountingDatabase {
  let queryCount = 0;
  const plugin: KyselyPlugin = {
    transformQuery: (args: PluginTransformQueryArgs): RootOperationNode => {
      queryCount += 1;
      return args.node;
    },
    transformResult: (
      args: PluginTransformResultArgs,
    ): Promise<QueryResult<UnknownRow>> => {
      return Promise.resolve(args.result);
    },
  };

  return {
    database: database.withPlugin(plugin),
    getQueryCount: () => {
      return queryCount;
    },
    reset: () => {
      queryCount = 0;
    },
  };
}
