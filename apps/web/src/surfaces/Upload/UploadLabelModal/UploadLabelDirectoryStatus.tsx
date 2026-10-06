import { Prose } from "@/system/typography/Prose";
import type {
  UploadSessionController,
  UploadSnapshot,
} from "@/upload/createUploadSessionController/createUploadSessionController.types";
import { Button } from "@mantine/core";
import type { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
type ParentProps = {
  memberId: string;
  kind: "tag" | "person";
  opened: boolean;
  controller: UploadSessionController;
  snapshot: UploadSnapshot;
  onClose: () => void;
};
type Tags = ReturnType<
  typeof useQuery<import("@memory-shoebox/shared").TagsResponse>
>;
type People = ReturnType<
  typeof useQuery<import("@memory-shoebox/shared").PeopleResponse>
>;
type Props = {
  options: Readonly<{ directory: Tags | People; kind: ParentProps["kind"] }>;
};

/** Shows directory loading or retry without blocking typed labels. */
export function UploadLabelDirectoryStatus({
  options,
}: Readonly<Props>): ReactNode {
  const { directory, kind } = options;
  const word = kind === "tag" ? "tags" : "people";
  return directory.isPending ? (
    <Prose>Loading {word}…</Prose>
  ) : directory.isError ? (
    <div role="alert">
      <Prose>
        {kind === "tag" ? "Tags" : "People"} are unavailable. Typed names can
        still be added as new labels; retry to choose an existing one.
      </Prose>
      <Button
        mt="sm"
        variant="default"
        onClick={() => {
          void directory.refetch();
        }}
      >
        Retry {word}
      </Button>
    </div>
  ) : null;
}
