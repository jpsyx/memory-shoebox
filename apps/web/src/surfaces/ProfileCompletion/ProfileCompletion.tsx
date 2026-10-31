import { Stack } from "@mantine/core";
import type { ReactNode } from "react";
import { Card } from "@/system/Chrome/Card";
import { Centred } from "@/system/Chrome/Centred";
import { TopBar } from "@/system/Chrome/TopBar";
import { Lede } from "@/system/typography/Lede";
import { Prose } from "@/system/typography/Prose";
import { ProfileCompletionForm } from "./ProfileCompletionForm";
import {
  useProfileCompletion,
  type ProfileCompletionOptions,
} from "./useProfileCompletion/useProfileCompletion";

/** Claims the member's name before continuing to the original family link. */
export function ProfileCompletion(
  options: Readonly<ProfileCompletionOptions>,
): ReactNode {
  const flow = useProfileCompletion(options);
  return (
    <>
      <TopBar title={options.account.settings.shoeboxName} />
      <Centred>
        <Card>
          <Stack gap="md">
            <Lede>What should we call you?</Lede>
            <Prose>
              Choose the name your family will see on your comments.
            </Prose>
            <ProfileCompletionForm flow={flow} />
          </Stack>
        </Card>
      </Centred>
    </>
  );
}
