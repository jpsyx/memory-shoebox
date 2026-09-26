import {
  Button,
  Modal,
  NativeSelect,
  Stack,
  Table,
  TextInput,
} from "@mantine/core";
import { IconChevronDown, IconMail, IconPlus } from "@tabler/icons-react";
import { useState } from "react";
import { ALL_DEVICES, MEMBERS, type Member, type Role } from "@/data/fixtures";
import { Banner, Sheet, SheetHead, TopBar } from "@/system/Chrome";
import { ChipRow } from "@/system/Chip";
import { ICON_PROPS } from "@/system/icons";
import { LabelText, Lede, Prose } from "@/system/typography";
import classes from "@/system/system.module.css";
import type { Surface } from "@/surfaces/registry";

type MembersState =
  | "list"
  | "invite"
  | "pending"
  | "change-role"
  | "remove"
  | "devices"
  | "last-admin";

const ROLE_WORD: Record<Role, string> = {
  viewer: "Viewer",
  uploader: "Uploader",
  admin: "Admin",
};

const ROLE_OPTIONS = [
  { value: "viewer", label: "Viewer" },
  { value: "uploader", label: "Uploader" },
  { value: "admin", label: "Admin" },
];

function MemberRow({
  member,
  onChangeRole,
  onRemove,
}: {
  readonly member: Member;
  readonly onChangeRole: (member: Member) => void;
  readonly onRemove: (member: Member) => void;
}) {
  const isPending = member.status === "invited";
  return (
    <Table.Tr>
      <Table.Td>
        <b>{member.name}</b>
        <br />
        <span className={classes.fileMeta}>{member.email}</span>
      </Table.Td>
      <Table.Td>{ROLE_WORD[member.role]}</Table.Td>
      <Table.Td className={classes.tabular}>
        {isPending ? "Invitation pending" : member.lastSeen}
      </Table.Td>
      <Table.Td>
        <ChipRow>
          {isPending ? (
            <>
              <Button variant="default" size="sm">
                Send it again
              </Button>
              <Button variant="default" size="sm">
                Revoke
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="default"
                size="sm"
                onClick={() => {
                  return onChangeRole(member);
                }}
              >
                Change role
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => {
                  return onRemove(member);
                }}
              >
                Remove
              </Button>
            </>
          )}
        </ChipRow>
      </Table.Td>
    </Table.Tr>
  );
}

function MembersSurface({ state }: { readonly state: MembersState }) {
  const [changingRole, setChangingRole] = useState<Member | undefined>(
    state === "change-role"
      ? MEMBERS[4]
      : state === "last-admin"
        ? MEMBERS[0]
        : undefined,
  );
  const [removing, setRemoving] = useState<Member | undefined>(
    state === "remove" ? MEMBERS[5] : undefined,
  );

  const admins = MEMBERS.filter((member) => {
    return member.role === "admin";
  }).length;

  return (
    <>
      <TopBar back="Back to my account" />
      <main className={classes.pageWide}>
        <Stack gap="lg">
          <Lede>Who is in this Shoebox.</Lede>
          <Prose onPanel>
            Nine people, by invitation only. There is no way to make an account
            here, and an address that has not been invited cannot sign in.
          </Prose>

          {state === "invite" || state === "pending" ? (
            <Sheet wide label="Invite somebody">
              <SheetHead title="Invite somebody" />
              <Stack gap="md">
                {state === "pending" ? (
                  <Banner icon={<IconMail {...ICON_PROPS} />}>
                    <b>Invitation sent to tomas@example.com.</b> It holds a
                    six-digit code and expires in seven days. Until he uses it
                    he shows as pending below, and nothing in the archive is
                    open to him.
                  </Banner>
                ) : null}
                <TextInput
                  label="Their email"
                  description="This becomes the only address they can sign in with."
                  placeholder="somebody@example.com"
                  defaultValue={state === "pending" ? "tomas@example.com" : ""}
                />
                <NativeSelect
                  label="What they can do"
                  description="A role can be changed later, and every higher role can do everything the lower ones can."
                  data={ROLE_OPTIONS}
                  rightSection={<IconChevronDown {...ICON_PROPS} />}
                />
                <ChipRow>
                  <Button leftSection={<IconPlus {...ICON_PROPS} />}>
                    Send the invitation
                  </Button>
                  <Button variant="default">Cancel</Button>
                </ChipRow>
              </Stack>
            </Sheet>
          ) : null}

          <Sheet wide label="Members">
            <SheetHead title={`${MEMBERS.length} people`}>
              {state === "invite" || state === "pending" ? null : (
                <Button leftSection={<IconPlus {...ICON_PROPS} />}>
                  Invite somebody
                </Button>
              )}
            </SheetHead>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Person</Table.Th>
                  <Table.Th>Role</Table.Th>
                  <Table.Th>Last seen</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {MEMBERS.map((member) => {
                  return (
                    <MemberRow
                      key={member.id}
                      member={member}
                      onChangeRole={setChangingRole}
                      onRemove={setRemoving}
                    />
                  );
                })}
              </Table.Tbody>
            </Table>
          </Sheet>

          {state === "devices" ? (
            <Sheet wide label="Every signed-in device">
              <SheetHead title="Every signed-in device" />
              <Stack gap="md">
                <Prose>
                  Every device currently holding a session, for everybody.
                  Signing one out stops it immediately, which is what a lost
                  phone in the family needs.
                </Prose>
                <Table>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Person</Table.Th>
                      <Table.Th>Device</Table.Th>
                      <Table.Th>Last used</Table.Th>
                      <Table.Th />
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {ALL_DEVICES.map((device) => {
                      const owner = MEMBERS.find((member) => {
                        return member.id === device.memberId;
                      });
                      return (
                        <Table.Tr key={device.id}>
                          <Table.Td>{owner?.name ?? "Somebody"}</Table.Td>
                          <Table.Td>
                            {device.label}
                            <br />
                            <span className={classes.fileMeta}>
                              {device.place}
                            </span>
                          </Table.Td>
                          <Table.Td className={classes.tabular}>
                            {device.lastUsed}
                          </Table.Td>
                          <Table.Td>
                            <Button variant="default" size="sm">
                              Sign it out
                            </Button>
                          </Table.Td>
                        </Table.Tr>
                      );
                    })}
                  </Table.Tbody>
                </Table>
              </Stack>
            </Sheet>
          ) : null}

          <Sheet wide label="What the roles mean">
            <Stack gap="sm">
              <LabelText component="h2">What the roles mean</LabelText>
              <dl className={classes.defs}>
                <dt>Viewer</dt>
                <dd>
                  Looks, comments, can ask for a photograph they are tagged in
                  to come down, and manages their own devices.
                </dd>
                <dt>Uploader</dt>
                <dd>
                  Everything a viewer can, plus putting things up, setting who
                  can see them, tagging, milestones, and deleting their own
                  uploads.
                </dd>
                <dt>Admin</dt>
                <dd>
                  Everything an uploader can, plus inviting, roles, groups, the
                  instance title, deleting anything, signing out anybody's
                  device, and seeing every item in the archive without
                  exception.
                </dd>
              </dl>
            </Stack>
          </Sheet>
        </Stack>
      </main>

      <Modal
        opened={changingRole !== undefined}
        onClose={() => {
          return setChangingRole(undefined);
        }}
        title={`What can ${changingRole?.name ?? "they"} do?`}
      >
        <Stack gap="md">
          <NativeSelect
            label="Role"
            data={ROLE_OPTIONS}
            defaultValue={changingRole?.role}
            rightSection={<IconChevronDown {...ICON_PROPS} />}
          />
          {state === "last-admin" ? (
            <Banner>
              <b>This is the only admin.</b> Somebody has to be able to invite
              people, act on removal requests and fix the mail settings, so the
              last admin cannot be demoted. Make somebody else an admin first.
            </Banner>
          ) : (
            <Prose>
              There are {admins} admins. Any admin can change any role,
              including another admin's, and an admin can demote themselves as
              long as they are not the last one.
            </Prose>
          )}
          <ChipRow>
            <Button
              disabled={state === "last-admin"}
              onClick={() => {
                return setChangingRole(undefined);
              }}
            >
              Save
            </Button>
            <Button
              variant="default"
              onClick={() => {
                return setChangingRole(undefined);
              }}
            >
              Cancel
            </Button>
          </ChipRow>
        </Stack>
      </Modal>

      <Modal
        opened={removing !== undefined}
        onClose={() => {
          return setRemoving(undefined);
        }}
        title={`Remove ${removing?.name ?? "them"}?`}
      >
        <Stack gap="md">
          <Prose>
            {removing?.name ?? "They"} loses access straight away, on every
            device. Nothing they uploaded or wrote is deleted, and their name
            stays on it.
          </Prose>
          <Banner>
            <b>They stay a person in the archive.</b> Photographs tagged with
            them keep the tag, so inviting them back later picks up where this
            left off.
          </Banner>
          <ChipRow>
            <Button
              variant="danger"
              onClick={() => {
                return setRemoving(undefined);
              }}
            >
              Remove them
            </Button>
            <Button
              variant="default"
              onClick={() => {
                return setRemoving(undefined);
              }}
            >
              Cancel
            </Button>
          </ChipRow>
        </Stack>
      </Modal>
    </>
  );
}

export const membersSurface: Surface = {
  id: "members",
  number: 12,
  title: "Members",
  who: "admins",
  group: "admin",
  blurb:
    "Who can open this Shoebox: what each of them can do, who has been invited but not arrived, and every device currently signed in.",
  states: [
    {
      id: "list",
      label: "The list",
      note: "Roles are a strict ladder and the table says so in plain words at the foot, not in a tooltip.",
      render: () => {
        return <MembersSurface state="list" />;
      },
    },
    {
      id: "invite",
      label: "Invite by email",
      note: "An address is the whole identity here. There is no name field, because the person will tell you their own name.",
      render: () => {
        return <MembersSurface state="invite" />;
      },
    },
    {
      id: "pending",
      label: "Invitation pending",
      note: "Says what the invited person has and has not got yet, and how long it lasts. Resend and revoke sit on the row.",
      render: () => {
        return <MembersSurface state="pending" />;
      },
    },
    {
      id: "change-role",
      label: "Changing a role",
      note: "Any admin may demote any admin, which is the answer to open question 3 in the spec.",
      render: () => {
        return <MembersSurface state="change-role" />;
      },
    },
    {
      id: "last-admin",
      label: "The last admin",
      note: "The one role change that is refused, with the reason stated rather than the control silently disabled.",
      render: () => {
        return <MembersSurface state="last-admin" />;
      },
    },
    {
      id: "remove",
      label: "Removing a member",
      note: "Removing a member never removes the person. A tagged grandmother without an account is a first-class record.",
      render: () => {
        return <MembersSurface state="remove" />;
      },
    },
    {
      id: "devices",
      label: "Revoking any device",
      note: "An admin can sign out anybody's device. Without this a handed-down phone is a month of silent access.",
      render: () => {
        return <MembersSurface state="devices" />;
      },
    },
  ],
};
