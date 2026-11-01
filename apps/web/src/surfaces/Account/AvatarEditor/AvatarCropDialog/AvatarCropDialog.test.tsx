import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { AvatarCropDialog } from "./AvatarCropDialog";
it("allows keyboard zoom, directional movement and reset without dragging", async () => {
  const onCrop = vi.fn();
  const props = {
    opened: true,
    url: "blob:test",
    dimensions: { width: 101, height: 57 },
    crop: { centerX: 0.5, centerY: 0.5, zoom: 1 },
    onCrop,
    onSave: vi.fn(),
    onCancel: vi.fn(),
    onChoose: vi.fn(),
    isSaving: false,
  };
  const rendered = render(
    <MantineProvider>
      <AvatarCropDialog {...props} />
    </MantineProvider>,
  );
  const slider = await screen.findByRole("slider", { name: "Photo zoom" });
  slider.focus();
  await userEvent.keyboard("{ArrowRight}");
  expect(slider).toHaveFocus();
  expect(onCrop.mock.calls.at(-1)![0].zoom).toBeGreaterThan(1);
  await userEvent.click(
    screen.getByRole("button", { name: "Move photo left" }),
  );
  expect(onCrop.mock.calls.at(-1)![0].centerX).toBeGreaterThan(0.5);
  rendered.rerender(
    <MantineProvider>
      <AvatarCropDialog
        {...props}
        crop={{ centerX: 0.8, centerY: 0.8, zoom: 2 }}
      />
    </MantineProvider>,
  );
  await userEvent.click(screen.getByRole("button", { name: "Reset" }));
  expect(onCrop).toHaveBeenLastCalledWith({
    centerX: 0.5,
    centerY: 0.5,
    zoom: 1,
  });
});
