import type { SetCaptureDateRequest } from "@memory-shoebox/shared";
import { setItemCaptureDate } from "@/api/items/items";
import {
  useItemDetailWrite,
  type ItemWrite,
} from "@/surfaces/Item/itemWrites/useItemDetailWrite/useItemDetailWrite";

/** The hand correction to the capture date. */
export function useSetItemCaptureDate(
  itemId: string,
): ItemWrite<SetCaptureDateRequest> {
  return useItemDetailWrite({
    itemId,
    mutationFn: (body: SetCaptureDateRequest) => {
      return setItemCaptureDate({ itemId, body });
    },
  });
}
