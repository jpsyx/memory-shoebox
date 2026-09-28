import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { VisibilityControl } from "@/system/VisibilityControl/VisibilityControl";
import { cssVariablesResolver } from "@/theme/cssVariablesResolver";
import { theme } from "@/theme/theme";

function _render(node: ReactNode) {
  return render(
    <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver}>
      {node}
    </MantineProvider>,
  );
}

describe("the visibility control", () => {
  it("renders, and says out loud that an admin sees everything", () => {
    _render(
      <VisibilityControl
        mode="everyone"
        onModeChange={() => {}}
        subjects={[]}
        onSubjectsChange={() => {}}
        members={[]}
        groups={[]}
      />,
    );

    expect(screen.getByText(/An admin sees every item/)).toBeVisible();
  });
});
