import { z } from "zod";
import { idSchema, memberRefSchema } from "./dtos.ts";

/** The retained account whose archive collection is being opened. */
export const memberCollectionParamsSchema = z.strictObject({
  memberId: idSchema,
});

/** Public identity only, with unknown accounts represented as null. */
export const memberCollectionResponseSchema = z.strictObject({
  member: memberRefSchema.nullable(),
});

/** Response from authenticated `GET /api/member-collections/:memberId`. */
export type MemberCollectionResponse = z.infer<
  typeof memberCollectionResponseSchema
>;
