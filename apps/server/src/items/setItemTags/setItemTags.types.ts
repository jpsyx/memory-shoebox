import type { DatabaseExecutor } from "../../db/types/db.types.ts";

/** Inputs for getTagIdsFromNames. */
export type GetTagIdsFromNamesOptions = {
  transaction: DatabaseExecutor;
  names: string[];
  memberId: string;
  now: string;
};

/** One requested name, with the form the database matches on. */
export type RequestedTag = {
  name: string;
  nameNormalized: string;
};
