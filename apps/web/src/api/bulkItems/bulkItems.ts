import { z } from "zod";
import {
  bulkEditItemsRequestSchema,
  type BulkEditItemsRequest,
} from "@memory-shoebox/shared";
import { apiFetch, jsonInit } from "@/api/clientHelpers/clientHelpers";

/** Applies one additive edit or confirmed deletion atomically. */
export function editItems(body: Readonly<BulkEditItemsRequest>): Promise<void> {
  return apiFetch({
    path: "/items/bulk-edit",
    schema: z.void(),
    init: jsonInit({
      method: "POST",
      body: bulkEditItemsRequestSchema.parse(body),
    }),
  });
}
