import { Button, Modal, Stack, Switch, Table, TextInput } from "@mantine/core";
import {
  IconAdjustments,
  IconDeviceMobile,
  IconFlag,
  IconMail,
  IconUsers,
} from "@tabler/icons-react";
import { useState } from "react";
import {
  CURRENT_MEMBER,
  INSTANCE_TITLE,
  MY_DEVICES,
  type Device,
} from "@/data/fixtures";
import { Banner, Sheet, SheetHead, TopBar } from "@/system/Chrome";
import { ChipRow } from "@/system/Chip";
import { ICON_PROPS } from "@/system/icons";
import { LabelText, Lede, Prose } from "@/system/typography";
import classes from "@/system/system.module.css";
import type { Surface } from "@/surfaces/registry";

type AccountState =
  | "default"
  | "notifications-off"
  | "sign-out-device"
  | "sign-out-current";

function DeviceRow({
  device,
  onSignOut,
}: {
  readonly device: Device;
  readonly onSignOut: (device: Device) => void;
}) {
  return (
    <Table.Tr>
      <Table.Td>
        <b>{device.label}</b>
        {device.current ? " · this one" : ""}
        <br />
        <span className={classes.fileMeta}>{device.place}</span>
      </Table.Td>
      <Table.Td className={classes.tabular}>{device.lastUsed}</Table.Td>
      <Table.Td className={classes.tabular}>
        {device.daysIdle >= 26
          ? `Falls out in ${30 - device.daysIdle} days`
          : `${30 - device.daysIdle} days left`}
      </Table.Td>
      <Table.Td>
        <Button
          variant={device.current ? "danger" : "default"}
          size="sm"
          onClick={() => {
            return onSignOut(device);
          }}
        >
          {device.current ? "Sign out here" : "Sign out"}
        </Button>
      </Table.Td>
    </Table.Tr>
  );
}

function AccountSurface({ state }: { readonly state: AccountState }) {
  const [notify, setNotify] = useState(state !== "notifications-off");
  const [signingOut, setSigningOut] = useState<Device | undefined>(
    state === "sign-out-device"
      ? MY_DEVICES[2]
      : state === "sign-out-current"
        ? MY_DEVICES[0]
        : undefined,
  );

  return (
    <>
      <TopBar back="Back to the pile" />
      <main className={classes.page}>
        <Stack gap="lg">
          <Lede>
            {CURRENT_MEMBER.name}, in {INSTANCE_TITLE}.
          </Lede>

          <Sheet wide label="You">
            <SheetHead title="You" />
            <Stack gap="md">
              <TextInput
                label="Your email"
                description="Sign-in codes and every notification go here."
                value={CURRENT_MEMBER.email}
                readOnly
                classNames={{ input: classes.fieldFixed }}
              />
              <Banner icon={<IconMail {...ICON_PROPS} />}>
                <b>This address cannot be changed.</b> It is not a detail on an
                account, it is the account: it is what you were invited at, what
                the six-digit code goes to, and the only thing that proves you
                are you. To move to a different address an admin invites the new
                one and removes this one, which is deliberately a thing somebody
                else does.
              </Banner>
            </Stack>
          </Sheet>

          <Sheet wide label="Email">
            <SheetHead title="Email" />
            <Stack gap="md">
              <Switch
                checked={notify}
                onChange={(event) => {
                  return setNotify(event.currentTarget.checked);
                }}
                label="Email me when something happens"
              />
              <Prose>
                {notify
                  ? "One email when somebody puts a day up, one when somebody writes on something of yours, and one if anybody asks for a photograph of you to come down. Never one per photograph."
                  : "Nothing will be emailed to you except the six-digit code you need to sign in, which is not something that can be turned off."}
              </Prose>
              {notify ? null : (
                <Banner>
                  <b>You will still get sign-in codes.</b> Without them there is
                  no way back in, so they are not part of this switch.
                </Banner>
              )}
            </Stack>
          </Sheet>

          <Sheet wide label="Your devices">
            <SheetHead title="Where you are signed in" />
            <Stack gap="md">
              <Prose>
                Each of these stays signed in for 30 days and the clock resets
                every time you use it. A phone you have not opened in a month
                falls out on its own and needs a fresh code.
              </Prose>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Device</Table.Th>
                    <Table.Th>Last used</Table.Th>
                    <Table.Th>Stays until</Table.Th>
                    <Table.Th />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {MY_DEVICES.map((device) => {
                    return (
                      <DeviceRow
                        key={device.id}
                        device={device}
                        onSignOut={setSigningOut}
                      />
                    );
                  })}
                </Table.Tbody>
              </Table>
              <Banner icon={<IconDeviceMobile {...ICON_PROPS} />}>
                <b>Lost a phone, or handed one on?</b> Sign it out here and it
                stops working immediately, wherever it is.
              </Banner>
            </Stack>
          </Sheet>

          {CURRENT_MEMBER.role === "admin" ? (
            <Sheet wide label="Running this archive">
              <SheetHead title="You run this archive" />
              <Stack gap="md">
                <Prose>
                  Four things only an admin can reach. They are here rather than
                  on the top bar, because everybody else's bar should not carry
                  doors they cannot open.
                </Prose>
                <ChipRow>
                  <Button
                    variant="default"
                    leftSection={<IconAdjustments {...ICON_PROPS} />}
                  >
                    Settings
                  </Button>
                  <Button
                    variant="default"
                    leftSection={<IconUsers {...ICON_PROPS} />}
                  >
                    Members and groups
                  </Button>
                  <Button variant="default">Milestones</Button>
                  <Button
                    variant="default"
                    leftSection={<IconFlag {...ICON_PROPS} />}
                  >
                    Removal requests · 2
                  </Button>
                </ChipRow>
                <Banner>
                  <b>You can see every item in this archive.</b> That is what
                  running it means here, and it cannot be switched off, not even
                  by another admin.
                </Banner>
              </Stack>
            </Sheet>
          ) : null}

          <Sheet wide label="Licence">
            <Stack gap="sm">
              <LabelText component="h2">About this archive</LabelText>
              <Prose>
                Memory Shoebox is free software under the AGPL. You are entitled
                to the source of the exact version running here.
              </Prose>
              <ChipRow>
                <Button variant="default">Get the source</Button>
              </ChipRow>
            </Stack>
          </Sheet>
        </Stack>
      </main>

      <Modal
        opened={signingOut !== undefined}
        onClose={() => {
          return setSigningOut(undefined);
        }}
        title={
          signingOut?.current === true
            ? "Sign out of this device?"
            : "Sign this device out?"
        }
      >
        <Stack gap="md">
          <Prose>
            {signingOut?.current === true
              ? "You are using this one. Signing out here means you will need a fresh six-digit code to get back in, on this device."
              : `${signingOut?.label ?? "That device"} in ${signingOut?.place ?? ""} stops working straight away. Whoever is holding it will see the sign-in page and nothing else.`}
          </Prose>
          <ChipRow>
            <Button
              variant="danger"
              onClick={() => {
                return setSigningOut(undefined);
              }}
            >
              {signingOut?.current === true ? "Sign out here" : "Sign it out"}
            </Button>
            <Button
              variant="default"
              onClick={() => {
                return setSigningOut(undefined);
              }}
            >
              Leave it
            </Button>
          </ChipRow>
        </Stack>
      </Modal>
    </>
  );
}

export const accountSurface: Surface = {
  id: "account",
  number: 9,
  title: "My account",
  who: "every member",
  group: "member",
  blurb:
    "The address codes go to, whether email arrives at all, and every device that is currently signed in as you.",
  states: [
    {
      id: "default",
      label: "Default",
      note: "Devices carry a last-used date and how long each has left, because a sliding 30-day session is invisible unless it is stated.",
      render: () => {
        return <AccountSurface state="default" />;
      },
    },
    {
      id: "notifications-off",
      label: "Notifications off",
      note: "Says what still arrives. A member who turns email off and then cannot sign in has been failed by this switch.",
      render: () => {
        return <AccountSurface state="notifications-off" />;
      },
    },
    {
      id: "sign-out-device",
      label: "Signing a device out",
      note: "Names the device and says the effect is immediate. This is the path for a lost or handed-down phone.",
      render: () => {
        return <AccountSurface state="sign-out-device" />;
      },
    },
    {
      id: "sign-out-current",
      label: "Signing out the one I am on",
      note: "Different words, because the consequence is different: you need a fresh code to undo it.",
      render: () => {
        return <AccountSurface state="sign-out-current" />;
      },
    },
  ],
};
