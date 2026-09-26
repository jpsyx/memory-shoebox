import { Button, Modal, Stack, Tabs, Textarea } from "@mantine/core";
import { IconClock, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import { REMOVAL_REQUESTS, type RemovalRequest } from "@/data/fixtures";
import { Banner, Sheet, TopBar } from "@/system/Chrome";
import { ChipRow } from "@/system/Chip";
import { ICON_PROPS } from "@/system/icons";
import { LabelText, Lede, Prose, Stat } from "@/system/typography";
import classes from "@/system/system.module.css";
import type { Surface } from "@/surfaces/registry";

type RequestsState = "open" | "deleting" | "declining" | "settled" | "none";

const STATE_WORD: Record<RemovalRequest["state"], string> = {
  open: "Waiting",
  deleted: "Deleted",
  declined: "Kept",
};

function RequestCard({
  request,
  onDelete,
  onDecline,
}: {
  readonly request: RemovalRequest;
  readonly onDelete: (request: RemovalRequest) => void;
  readonly onDecline: (request: RemovalRequest) => void;
}) {
  return (
    <Sheet wide label={`Request from ${request.requestedBy}`}>
      <Stack gap="md">
        <div className={classes.requestRow}>
          <span className={classes.itemThumb}>
            <img
              src={request.item.thumb}
              alt={request.item.alt}
              loading="lazy"
            />
          </span>
          <Stack gap="xs">
            <LabelText component="h3">
              {STATE_WORD[request.state]} · {request.when}
            </LabelText>
            <p className={classes.title}>
              {request.requestedBy} is tagged in this one
            </p>
            <span className={classes.fileMeta}>
              Put up by {request.uploader}
            </span>
            {request.reason === undefined ? (
              <Prose>
                No reason given, which is allowed. Asking is enough.
              </Prose>
            ) : (
              <Prose>{request.reason}</Prose>
            )}
            {request.declineReason === undefined ? null : (
              <>
                <LabelText component="h4">
                  What {request.uploader} said back
                </LabelText>
                <Prose>{request.declineReason}</Prose>
              </>
            )}
          </Stack>
        </div>

        {request.state === "open" ? (
          <ChipRow>
            <Button
              variant="danger"
              leftSection={<IconTrash {...ICON_PROPS} />}
              onClick={() => {
                return onDelete(request);
              }}
            >
              Delete it
            </Button>
            <Button
              variant="default"
              onClick={() => {
                return onDecline(request);
              }}
            >
              Keep it, and say why
            </Button>
          </ChipRow>
        ) : null}
      </Stack>
    </Sheet>
  );
}

function RequestsSurface({ state }: { readonly state: RequestsState }) {
  const [deleting, setDeleting] = useState<RemovalRequest | undefined>(
    state === "deleting" ? REMOVAL_REQUESTS[0] : undefined,
  );
  const [declining, setDeclining] = useState<RemovalRequest | undefined>(
    state === "declining" ? REMOVAL_REQUESTS[0] : undefined,
  );

  const open = REMOVAL_REQUESTS.filter((request) => {
    return request.state === "open";
  });
  const settled = REMOVAL_REQUESTS.filter((request) => {
    return request.state !== "open";
  });

  return (
    <>
      <TopBar back="Back to my account" />
      <main className={classes.pageWide}>
        <Stack gap="lg">
          <Lede>
            {state === "none"
              ? "Nobody has asked for anything to come down."
              : "Two people have asked for a photograph to come down."}
          </Lede>
          <Prose onPanel>
            Anybody tagged in a photograph can ask for it to be removed. The
            person who put it up hears about it and so does every admin, and
            either can act.
          </Prose>

          {state === "none" ? (
            <Sheet wide label="Nothing waiting">
              <Stack gap="md">
                <div className={classes.uploadFigureRow}>
                  <Stat figure="0" label="Waiting" />
                  <Stat figure="2" label="Settled, all time" />
                </div>
                <Prose>
                  This is the normal state. A request is a family conversation
                  that happens a few times a year, not a queue.
                </Prose>
              </Stack>
            </Sheet>
          ) : (
            <Tabs defaultValue={state === "settled" ? "settled" : "open"}>
              <Tabs.List>
                <Tabs.Tab value="open">Waiting · {open.length}</Tabs.Tab>
                <Tabs.Tab value="settled">Settled · {settled.length}</Tabs.Tab>
              </Tabs.List>

              <Tabs.Panel value="open" pt="md">
                <Stack gap="md">
                  <Banner onPanel icon={<IconClock {...ICON_PROPS} />}>
                    <b>A request that nobody answers stays here.</b> It does not
                    expire and it does not escalate: letting one quietly lapse
                    is exactly the silence this feature exists to replace. The
                    reminder email goes out weekly until somebody acts.
                  </Banner>
                  {open.map((request) => {
                    return (
                      <RequestCard
                        key={request.id}
                        request={request}
                        onDelete={setDeleting}
                        onDecline={setDeclining}
                      />
                    );
                  })}
                </Stack>
              </Tabs.Panel>

              <Tabs.Panel value="settled" pt="md">
                <Stack gap="md">
                  {settled.map((request) => {
                    return (
                      <RequestCard
                        key={request.id}
                        request={request}
                        onDelete={setDeleting}
                        onDecline={setDeclining}
                      />
                    );
                  })}
                </Stack>
              </Tabs.Panel>
            </Tabs>
          )}
        </Stack>
      </main>

      <Modal
        opened={deleting !== undefined}
        onClose={() => {
          return setDeleting(undefined);
        }}
        title="Delete it?"
      >
        <Stack gap="md">
          <Prose>
            The photograph and its file both go, along with anything written on
            it. {deleting?.requestedBy ?? "The person who asked"} and{" "}
            {deleting?.uploader ?? "the uploader"} are both told it is done.
          </Prose>
          <Banner>
            <b>Nobody else is told.</b> A family member asking for a photograph
            to come down does not want it announced to the circle.
          </Banner>
          <ChipRow>
            <Button
              variant="danger"
              onClick={() => {
                return setDeleting(undefined);
              }}
            >
              Delete it
            </Button>
            <Button
              variant="default"
              onClick={() => {
                return setDeleting(undefined);
              }}
            >
              Cancel
            </Button>
          </ChipRow>
        </Stack>
      </Modal>

      <Modal
        opened={declining !== undefined}
        onClose={() => {
          return setDeclining(undefined);
        }}
        title="Keep it, and say why"
      >
        <Stack gap="md">
          <Textarea
            label={`What ${declining?.requestedBy ?? "they"} will read`}
            description="This is required. A request answered with silence turns into a phone call."
            placeholder="It is the only one with all four of you in it."
          />
          <Prose>
            The photograph stays exactly as it is. If you would rather keep it
            but make it quieter, you can also change who can see it.
          </Prose>
          <ChipRow>
            <Button
              onClick={() => {
                return setDeclining(undefined);
              }}
            >
              Send this and keep it
            </Button>
            <Button
              variant="default"
              onClick={() => {
                return setDeclining(undefined);
              }}
            >
              Change who can see it instead
            </Button>
          </ChipRow>
        </Stack>
      </Modal>
    </>
  );
}

export const removalRequestsSurface: Surface = {
  id: "removal-requests",
  number: 15,
  title: "Removal requests",
  who: "uploaders and admins",
  group: "admin",
  blurb:
    "Open requests and what happened to the settled ones. Two actions only: delete it, or keep it and say why.",
  states: [
    {
      id: "open",
      label: "Open requests",
      note: "Answers open question 4: a request never expires, because letting one lapse is the silence this feature exists to replace.",
      render: () => {
        return <RequestsSurface state="open" />;
      },
    },
    {
      id: "deleting",
      label: "Acting by deleting",
      note: "Says who is told and, more importantly, who is not. A removal is not an announcement to the circle.",
      render: () => {
        return <RequestsSurface state="deleting" />;
      },
    },
    {
      id: "declining",
      label: "Declining one",
      note: "The reason is compulsory here, unlike the request itself, and a third way out is offered: keep it but narrow who sees it.",
      render: () => {
        return <RequestsSurface state="declining" />;
      },
    },
    {
      id: "settled",
      label: "Settled",
      note: "What was deleted and what was kept, with the words the requester was answered in.",
      render: () => {
        return <RequestsSurface state="settled" />;
      },
    },
    {
      id: "none",
      label: "Nothing waiting",
      note: "The normal state, and it should read as normal rather than as an empty inbox waiting to be filled.",
      render: () => {
        return <RequestsSurface state="none" />;
      },
    },
  ],
};
