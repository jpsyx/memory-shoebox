import {
  removalRequestDtoSchema,
  type RemovalRequestDto,
} from "@memory-shoebox/shared";
import type { Page } from "@playwright/test";
import { seedAskingAndOccasions } from "./seedAskingAndOccasions/seedAskingAndOccasions.ts";
/** Seeds an open request as a precondition for a reply scenario. */
export async function seedOpenRemovalRequest({
  page,
  label,
  reason = "",
}: Readonly<{
  page: Page;
  label: string;
  reason?: string;
}>): Promise<RemovalRequestDto> {
  const { itemId } = await seedAskingAndOccasions({ label });
  const response = await page.request.post(
    `/api/items/${itemId}/removal-requests`,
    { data: { reason } },
  );
  return removalRequestDtoSchema.parse(await response.json());
}
/** Seeds a withdrawn request as a precondition for asking again. */
export async function seedWithdrawnRemovalRequest({
  page,
  label,
}: Readonly<{ page: Page; label: string }>): Promise<RemovalRequestDto> {
  const request = await seedOpenRemovalRequest({ page, label });
  const response = await page.request.post(
    `/api/removal-requests/${request.requestId}/withdraw`,
  );
  return removalRequestDtoSchema.parse(await response.json());
}
/** Opens an item and sends a blank removal request through its form. */
export async function sendBlankRemovalAsk({
  page,
  itemId,
}: Readonly<{ page: Page; itemId: string }>): Promise<void> {
  await page.goto(`/items/${itemId}/removal`);
  await page.getByRole("button", { name: "Send the request" }).click();
}
