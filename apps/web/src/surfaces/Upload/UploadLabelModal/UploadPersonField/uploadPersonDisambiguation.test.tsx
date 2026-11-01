import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { UploadPersonChoice } from "./UploadPersonChoice";

it("still requires an ID-valued choice for an ambiguous typed ad-hoc name", async () => {
  const onChoose = vi.fn();
  const people = [10, 20].map((itemCount) => {
    return {
      person: {
        personId: `person-${itemCount}`,
        displayName: "Alex",
        isMember: false,
      },
      itemCount,
      firstCapturedOn: null,
      lastCapturedOn: null,
      face: null,
    };
  });
  render(
    <MantineProvider>
      <UploadPersonChoice
        names={["Alex"]}
        people={people}
        choices={{}}
        onChoose={onChoose}
        isDisabled={false}
      />
    </MantineProvider>,
  );
  await userEvent.click(screen.getByRole("combobox", { name: "Which Alex?" }));
  await userEvent.click(
    screen.getByRole("option", { name: "Alex (not a member), 20 photographs" }),
  );
  expect(onChoose).toHaveBeenCalledWith({
    name: "Alex",
    personId: "person-20",
    index: 0,
  });
});
