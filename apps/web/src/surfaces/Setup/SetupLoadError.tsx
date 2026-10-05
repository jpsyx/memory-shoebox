import { Centred } from "@/system/Chrome/Centred";
import { Sheet } from "@/system/Chrome/Sheet";
import { Lede } from "@/system/typography/Lede";
import { Button, Stack, Text } from "@mantine/core";
import { useRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";

/** Initialization failure is an explicit retry, never assumed availability. */
export function SetupLoadError(): ReactNode {
  const router = useRouter();
  return (
    <Centred>
      <Sheet>
        <Stack>
          <Lede>Could not open this Shoebox.</Lede>
          <Text>
            We could not check whether it is ready. Try again when the
            connection is back.
          </Text>
          <Button
            onClick={() => {
              void router.invalidate();
            }}
          >
            Try again
          </Button>
        </Stack>
      </Sheet>
    </Centred>
  );
}
