import { Button, Stack, Text } from "@mantine/core";
import type { ReactNode } from "react";
import { AvatarEditor } from "@/surfaces/Account/AvatarEditor/AvatarEditor";
import { useProfilePhotoCompletion } from "./useProfilePhotoCompletion";
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
  const photo = useProfilePhotoCompletion(options);
  const flow = useProfileCompletion({
    ...options,
    onContinue: photo.onContinue,
  });
  const editor = (
    <AvatarEditor
      key={options.account.me.member.memberId}
      me={{
        ...options.account.me,
        member: { ...options.account.me.member, displayName: flow.name },
      }}
      onSaved={photo.onSaved}
      completion={photo.completion}
    />
  );
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
            <ProfileCompletionForm
              flow={flow}
              photo={editor}
              recovery={
                photo.isNameSaved ? (
                  photo.hasPhotoFailed ? (
                    <>
                      <Button onClick={photo.retry}>Try again</Button>
                      <Button variant="default" onClick={photo.continueWithout}>
                        Continue without a photo
                      </Button>
                    </>
                  ) : (
                    <Text role="status">Saving photo...</Text>
                  )
                ) : undefined
              }
            />
          </Stack>
        </Card>
      </Centred>
    </>
  );
}
