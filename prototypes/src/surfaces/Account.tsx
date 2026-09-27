import { Button, Modal, Stack, Switch, Table, TextInput } from "@mantine/core";
import {
  IconAdjustments,
  IconDeviceMobile,
  IconEye,
  IconFlag,
  IconMail,
  IconUsers,
} from "@tabler/icons-react";
import { useState } from "react";
import {
  CURRENT_MEMBER,
  NOTIFY_ALL,
  NOTIFY_NONE,
  SHOEBOX_NAME,
  MY_DEVICES,
  type Device,
  type NotifyPrefs,
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

/**
 * The four switches, each carrying the sentence that says what it stops.
 *
 * One switch was easier to build and worse to live with: the member who wants
 * the daily upload mail but not the comment threads had exactly one move, and
 * it was to turn the whole thing off and stop coming back.
 */
interface NotifyKind {
  readonly key: keyof NotifyPrefs;
  readonly label: string;
  readonly note: string;
}

const NOTIFY_KINDS: readonly NotifyKind[] = [
  {
    key: "onUpload",
    label: "Somebody puts photographs up",
    note: "One email for the whole batch, however many it was, saying how many of them you can see.",
  },
  {
    key: "onComment",
    label: "Somebody writes on something of yours",
    note: "Only things you uploaded.",
  },
  {
    key: "onReply",
    label: "Somebody writes on something you wrote on",
    note: "So a conversation you joined does not carry on without you.",
  },
  {
    key: "onRemoval",
    label: "Somebody asks for a photograph to come down",
    note: "You get these because you can act on them. A viewer never does.",
  },
];

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
  const [notify, setNotify] = useState<NotifyPrefs>(
    state === "notifications-off" ? NOTIFY_NONE : NOTIFY_ALL,
  );
  const someOn = Object.values(notify).some((on) => {
    return on;
  });
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
            {CURRENT_MEMBER.name}, in {SHOEBOX_NAME}.
          </Lede>

          <Sheet wide label="You">
            <SheetHead title="You" />
            <Stack gap="md">
              <TextInput
                label="Your name"
                description="What the family sees on your comments and on anything you put up."
                defaultValue={CURRENT_MEMBER.name}
              />
              <Prose>
                Whoever invited you typed this in. If they got it wrong, or if
                you would rather be something else here, change it.
              </Prose>
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
              <Prose>
                Nothing here is ever one email per photograph. Turn off whatever
                you do not want and the rest keeps coming.
              </Prose>
              <Stack gap="sm">
                {NOTIFY_KINDS.map((kind) => {
                  return (
                    <div key={kind.key} className={classes.notifyRow}>
                      <Switch
                        checked={notify[kind.key]}
                        onChange={(event) => {
                          return setNotify({
                            ...notify,
                            [kind.key]: event.currentTarget.checked,
                          });
                        }}
                        label={kind.label}
                      />
                      <span className={classes.notifyNote}>{kind.note}</span>
                    </div>
                  );
                })}
              </Stack>
              <ChipRow>
                <Button
                  variant="default"
                  size="sm"
                  disabled={!someOn}
                  onClick={() => {
                    return setNotify(NOTIFY_NONE);
                  }}
                >
                  Turn them all off
                </Button>
                {someOn ? null : (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => {
                      return setNotify(NOTIFY_ALL);
                    }}
                  >
                    Turn them back on
                  </Button>
                )}
              </ChipRow>
              <Banner icon={<IconMail {...ICON_PROPS} />}>
                <b>Sign-in codes are not on this list.</b> Without them there is
                no way back in, so they arrive however many of these you switch
                off.
              </Banner>
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
                  Five things only an admin can reach. They are here rather than
                  on the top bar, because everybody else's bar should not carry
                  doors they cannot open.
                </Prose>
                <ChipRow>
                  <Button
                    variant="default"
                    leftSection={<IconAdjustments {...ICON_PROPS} />}
                  >
                    Shoebox settings
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
                    leftSection={<IconEye {...ICON_PROPS} />}
                  >
                    Who has been looking
                  </Button>
                  <Button
                    variant="default"
                    leftSection={<IconFlag {...ICON_PROPS} />}
                  >
                    Removal requests · 2
                  </Button>
                </ChipRow>
                <Banner>
                  <b>You can see every item in this Shoebox.</b> That is what
                  running one means here, and it cannot be switched off, not
                  even by another admin.
                </Banner>
              </Stack>
            </Sheet>
          ) : null}

          <Sheet wide label="Licence">
            <Stack gap="sm">
              <LabelText component="h2">About this archive</LabelText>
              <Prose>
                Memory Shoebox is free software under the AGPL. You are entitled
                to the source of the exact version running this Shoebox.
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
              : `${signingOut?.label ?? "That device"} stops working straight away. Whoever is holding it will see the sign-in page and nothing else.`}
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
    "The name the family sees, the address codes go to and can never change, a switch for each kind of email, and every device currently signed in as you.",
  states: [
    {
      id: "default",
      label: "Default",
      note: "A name the member can correct, an address they cannot change, a switch per kind of email, and every device with how long it has left.",
      render: () => {
        return <AccountSurface state="default" />;
      },
    },
    {
      id: "notifications-off",
      label: "All notifications off",
      note: "Four switches, not one, so wanting fewer emails never means wanting none. Says what still arrives: a member who silences everything and then cannot sign in has been failed by this screen.",
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
