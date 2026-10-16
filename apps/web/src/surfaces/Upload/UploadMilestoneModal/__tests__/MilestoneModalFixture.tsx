import { MantineProvider } from "@mantine/core";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type {
  UploadSessionController,
  UploadSnapshot,
} from "@/upload/createUploadSessionController/createUploadSessionController.types";
import { UploadMilestoneModal } from "../UploadMilestoneModal";

type Props = {
  queryClient: QueryClient;
  snapshot: UploadSnapshot;
  controller: UploadSessionController;
  onClose: () => void;
  opened?: boolean;
};

/** Supplies the modal's providers around a controlled upload snapshot. */
export function MilestoneModalFixture({
  queryClient,
  snapshot,
  controller,
  onClose,
  opened = true,
}: Readonly<Props>): ReactNode {
  return (
    <QueryClientProvider client={queryClient}>
      <MantineProvider>
        <UploadMilestoneModal
          memberId="018f0000-0000-7000-8000-000000000001"
          opened={opened}
          snapshot={snapshot}
          controller={controller}
          onClose={onClose}
        />
      </MantineProvider>
    </QueryClientProvider>
  );
}
