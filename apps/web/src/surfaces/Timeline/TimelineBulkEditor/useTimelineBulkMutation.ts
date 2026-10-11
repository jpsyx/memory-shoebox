import { useRef, useState } from "react";
import {
  useMutation,
  useQueryClient,
  type QueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";
import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import { editItems } from "@/api/bulkItems/bulkItems";
import {
  bulkEditItemsRequestSchema,
  type BulkEditItemsRequest,
} from "@memory-shoebox/shared";

type BulkMutationState = {
  isPending: boolean;
  isUncertain: boolean;
  needsReview: boolean;
  problem: string | undefined;
  submit: (body: BulkEditItemsRequest) => void;
};

/** Refreshes derived archive views without recording phantom item opens. */
async function _refreshArchive(client: QueryClient): Promise<void> {
  await Promise.all(
    [
      "timeline",
      "filters",
      "tags",
      "people",
      "milestones",
      "bursts",
      "removals",
    ].map((prefix) => {
      return client.invalidateQueries({ queryKey: [prefix] });
    }),
  );
}

/** Human recovery copy for an atomic selection write. */
function _bulkProblem(error: Error | null): string | undefined {
  if (!error) {
    return undefined;
  }
  if (error instanceof ApiRequestError) {
    if (error.status === 403) {
      return "You can only delete your own uploads, unless you are an admin. Your permissions may have changed. Nothing in this selection was changed.";
    }
    if (error.status === 404) {
      return "A selected photo or choice is no longer available. Close this dialog and choose again. Nothing was changed.";
    }
    if (error.status === 400) {
      return "This edit exceeds a limit or contains an unavailable label. Use fewer labels or a smaller selection. Nothing was changed.";
    }
  }
  return "We could not confirm this change. Close this dialog and review the refreshed timeline before trying again.";
}

function _isUncertain(error: Error | null): boolean {
  return (
    error !== null &&
    (!(error instanceof ApiRequestError) || error.status >= 500)
  );
}

function _makeMutationOptions(options: {
  client: QueryClient;
  pending: { current: boolean };
  onSaved: (body: BulkEditItemsRequest) => void;
}): UseMutationOptions<void, Error, BulkEditItemsRequest> {
  const { client, pending, onSaved } = options;
  return {
    mutationFn: editItems,
    retry: false,
    onSuccess: async (_result, body) => {
      body.itemIds.forEach((itemId) => {
        client.removeQueries({
          queryKey: ["items", itemId],
          exact: true,
          type: "inactive",
        });
      });
      await _refreshArchive(client);
      onSaved(body);
    },
    onError: async () => {
      await _refreshArchive(client);
    },
    onSettled: () => {
      pending.current = false;
    },
  };
}

/** No write retries; local validation remains editable and sends no request. */
export function useTimelineBulkMutation(
  onSaved: (body: BulkEditItemsRequest) => void,
): BulkMutationState {
  const client = useQueryClient();
  const pending = useRef(false);
  const [localProblem, setLocalProblem] = useState<string>();
  const mutation = useMutation(
    _makeMutationOptions({ client, pending, onSaved }),
  );
  const isUncertain = _isUncertain(mutation.error);
  return {
    isPending: mutation.isPending,
    isUncertain,
    needsReview:
      isUncertain ||
      (mutation.error instanceof ApiRequestError &&
        mutation.error.status === 404),
    problem: localProblem ?? _bulkProblem(mutation.error),
    submit: (body) => {
      if (pending.current || isUncertain) {
        return;
      }
      const parsed = bulkEditItemsRequestSchema.safeParse(body);
      if (!parsed.success) {
        setLocalProblem(
          "Check the labels and selection limits. Nothing was sent. Correct the values and try again.",
        );
        return;
      }
      setLocalProblem(undefined);
      pending.current = true;
      mutation.mutate(parsed.data);
    },
  };
}
