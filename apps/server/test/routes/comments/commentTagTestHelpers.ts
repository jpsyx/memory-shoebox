import type { LightMyRequestResponse } from "fastify";
import { createTestApp } from "../../helpers/createTestApp.ts";
import { insertSignedInMember } from "../../helpers/insertSignedInMember.ts";
import {
  insertItem,
  insertMember,
} from "../../helpers/seedHelpers/seedHelpers.ts";

/** Shared create comment tag fixture for focused local regression scenarios. */
type Fixture = Awaited<ReturnType<typeof createTestApp>> & {
  author: Awaited<ReturnType<typeof insertSignedInMember>>;
  memberId: string;
  itemId: string;
  post: (payload: object) => Promise<LightMyRequestResponse>;
  patch: (
    commentId: string,
    payload: object,
  ) => Promise<LightMyRequestResponse>;
};

/** Creates a real authorized comment writer and a separate candidate. */
export async function createCommentTagFixture(): Promise<Fixture> {
  const context = await createTestApp();
  const author = await insertSignedInMember({
    database: context.database,
    member: { display_name: "Author" },
  });
  const memberId = await insertMember(context.database, {
    display_name: "Ana",
  });
  const itemId = await insertItem(context.database, {
    uploadedBy: author.memberId,
    kind: "video",
    duration_ms: 30000,
  });
  const post = async (payload: object) => {
    return context.app.inject({
      method: "POST",
      url: `/api/items/${itemId}/comments`,
      headers: { cookie: author.cookie },
      payload,
    });
  };
  const patch = async (commentId: string, payload: object) => {
    return context.app.inject({
      method: "PATCH",
      url: `/api/comments/${commentId}`,
      headers: { cookie: author.cookie },
      payload,
    });
  };
  return { ...context, author, memberId, itemId, post, patch };
}
