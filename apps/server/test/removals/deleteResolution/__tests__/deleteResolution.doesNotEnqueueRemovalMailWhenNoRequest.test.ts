import { describe, expect, it } from "vitest";
import { runDelete } from "../../../helpers/runDelete.ts";
import { createDeletionContext } from "./deleteResolutionTestHelpers.ts";

async function _assertDoesNotEnqueueRemovalMailWhenNoRequest3(): Promise<void> {
  const context = await createDeletionContext();
  try {
    await runDelete({
      database: context.database,
      itemId: context.itemId,
      memberId: context.uploaderId,
    });
    expect(
      await context.database
        .selectFrom("outbound_emails")
        .selectAll()
        .execute(),
    ).toEqual([]);
  } finally {
    await context.close();
  }
}
describe("deletion resolution mail", (): void => {
  it(
    "does not enqueue removal mail when no request is open",
    _assertDoesNotEnqueueRemovalMailWhenNoRequest3,
  );
});
