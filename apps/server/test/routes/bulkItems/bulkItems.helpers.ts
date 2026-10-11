import { onTestFinished } from "vitest";
import type { LightMyRequestResponse } from "fastify";
import { createTestApp, type TestApp } from "../../helpers/createTestApp.ts";
import { insertSignedInMember } from "../../helpers/insertSignedInMember.ts";
import { insertItem, NOW } from "../../helpers/seedHelpers/seedHelpers.ts";

/** A real app and a pair of uploaded items, with guaranteed cleanup. */
export async function makeBulkTestContext(): Promise<
  TestApp & {
    memberId: string;
    itemIds: string[];
    post: (payload: Record<string, unknown>) => Promise<LightMyRequestResponse>;
  }
> {
  const context = await createTestApp({
    clock: () => {
      return new Date(NOW);
    },
  });
  onTestFinished(context.close);
  const { cookie, memberId } = await insertSignedInMember(context);
  const itemIds = await Promise.all(
    [0, 1].map((seq) => {
      return insertItem(context.database, { uploadedBy: memberId, seq });
    }),
  );
  return {
    ...context,
    memberId,
    itemIds,
    post: (payload) => {
      return context.app.inject({
        method: "POST",
        url: "/api/items/bulk-edit",
        headers: { cookie },
        payload,
      });
    },
  };
}
