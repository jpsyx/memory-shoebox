import type {
  Kysely,
  KyselyPlugin,
  PluginTransformQueryArgs,
  PluginTransformResultArgs,
  QueryResult,
  RootOperationNode,
  UnknownRow,
} from "kysely";
import type { Database } from "../../../src/db/types/db.types.ts";
import type { FakeB2Client } from "../createFakeB2Client/createFakeB2Client.ts";

/** The watched handle, and every Backblaze call it caught. */
export type TransactionWatch = {
  /** Give this to the code under test, so its transactions are seen. */
  database: Kysely<Database>;
  /**
   * Every B2 operation called while a transaction was open, in order.
   *
   * Assert it is empty. The call also throws, but code that catches a B2
   * failure on purpose, as the abandon sweep's aborts do, would swallow the
   * throw, and this list is what still sees it.
   */
  callsInsideTransactions: string[];
};

/**
 * Makes any Backblaze call inside a SQLite transaction fail the test: a network
 * round trip would hold SQLite's one write lock for its duration.
 *
 * It watches the `begin immediate`, `commit` and `rollback` statements that
 * `runInImmediateTransaction.ts` issues, which every write path in this server
 * opens its transactions with, and sets the fake's `onCall` to throw, and to
 * record, whenever one is open. Statements that do not pass through the
 * returned handle are not seen, so the code under test must be given it.
 *
 * Shared by the complete-route and abandon-sweep tests, so both enforce the
 * same transaction boundary.
 *
 * @param options.database The test's database. Not modified.
 * @param options.b2 The fake whose `onCall` this takes over.
 */
export function failB2CallsInsideTransactions(
  options: Readonly<{
    database: Kysely<Database>;
    b2: FakeB2Client;
  }>,
): TransactionWatch {
  let openTransactionCount = 0;
  const callsInsideTransactions: string[] = [];
  const plugin: KyselyPlugin = {
    transformQuery: (args: PluginTransformQueryArgs): RootOperationNode => {
      const statement = ((node: RootOperationNode): string | undefined => {
        if (node.kind !== "RawNode" || node.sqlFragments.length !== 1) {
          return undefined;
        }
        return node.sqlFragments[0]?.trim().toLowerCase();
      })(args.node);
      if (statement?.startsWith("begin") === true) {
        openTransactionCount += 1;
      } else if (statement === "commit" || statement === "rollback") {
        openTransactionCount -= 1;
      }
      return args.node;
    },
    transformResult: (
      args: PluginTransformResultArgs,
    ): Promise<QueryResult<UnknownRow>> => {
      return Promise.resolve(args.result);
    },
  };

  options.b2.onCall = (operation) => {
    if (openTransactionCount > 0) {
      callsInsideTransactions.push(operation);
      throw new Error(
        `B2 ${operation} was called inside a SQLite transaction (step 6a design, decision 2)`,
      );
    }
  };

  return {
    database: options.database.withPlugin(plugin),
    callsInsideTransactions,
  };
}
