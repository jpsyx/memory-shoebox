import { expect, type Locator, type Page } from "@playwright/test";
import {
  getContrastFailuresFromPage,
  type ContrastFailure,
} from "../support/getContrastFailuresFromPage/getContrastFailuresFromPage.ts";

type Rectangle = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
};
type ClipRectangle = { box: Rectangle; horizontal: boolean; vertical: boolean };
type ControlLayout = {
  label: string | null;
  box: Rectangle;
  clips: ClipRectangle[];
};
type SurfaceLayout = {
  documentWidth: number;
  viewportWidth: number;
  controls: ControlLayout[];
};

/** Checks viewport overflow and actual ancestor clipping on both axes. */
export async function expectSurfaceControlsUnclipped(
  page: Page,
): Promise<void> {
  await expect
    .poll(async () => {
      return _getFailuresFromSurfaceLayout(
        await page.evaluate(_getSurfaceLayoutFromDocument),
      );
    })
    .toEqual([]);
}

function _getSurfaceLayoutFromDocument(): SurfaceLayout {
  const getRectangle = (element: HTMLElement): Rectangle => {
    const { left, right, top, bottom, width, height } =
      element.getBoundingClientRect();
    return { left, right, top, bottom, width, height };
  };
  const getClips = (parent: HTMLElement | null): ClipRectangle[] => {
    if (!parent) {
      return [];
    }
    const style = getComputedStyle(parent);
    const horizontal = ["hidden", "clip"].includes(style.overflowX);
    const vertical = ["hidden", "clip"].includes(style.overflowY);
    return [
      ...(horizontal || vertical
        ? [{ box: getRectangle(parent), horizontal, vertical }]
        : []),
      ...getClips(parent.parentElement),
    ];
  };
  const controls = [
    ...document.querySelectorAll<HTMLElement>("button,input,select,a"),
  ]
    .map((element) => {
      return {
        label:
          element.textContent?.trim() || element.getAttribute("aria-label"),
        box: getRectangle(element),
        clips: getClips(element.parentElement),
      };
    })
    .filter(({ box }) => {
      return box.width > 0 && box.height > 0;
    });
  return {
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: innerWidth,
    controls,
  };
}

function _getFailuresFromSurfaceLayout(
  layout: Readonly<SurfaceLayout>,
): string[] {
  const controlFailures = layout.controls.flatMap(({ label, box, clips }) => {
    const viewportFailures =
      box.left < -1 || box.right > layout.viewportWidth + 1
        ? [`${label} outside viewport`]
        : [];
    const clippingFailures = clips.flatMap((clip) => {
      const horizontal =
        clip.horizontal &&
        (box.left < clip.box.left - 1 || box.right > clip.box.right + 1);
      const vertical =
        clip.vertical &&
        (box.top < clip.box.top - 1 || box.bottom > clip.box.bottom + 1);
      return horizontal || vertical ? [`${label}: ancestor clipping`] : [];
    });
    return [...viewportFailures, ...clippingFailures];
  });
  return [
    ...(layout.documentWidth > layout.viewportWidth + 1
      ? ["document overflow"]
      : []),
    ...controlFailures,
  ];
}

/** Active text uses the established sweep; inactive controls are WCAG exempt. */
export async function expectSurfaceContrast(page: Page): Promise<void> {
  await expect
    .configure({ soft: true })
    .poll(async () => {
      return _getActiveContrastFailuresFromPage(page);
    })
    .toEqual([]);
}

async function _getActiveContrastFailuresFromPage(
  page: Page,
): Promise<ContrastFailure[]> {
  const failures = await getContrastFailuresFromPage(page);
  const activeFailures = await Promise.all(
    failures.map(async (failure) => {
      const isInactive = await page.evaluate(({ selector, text }) => {
        const candidates = [...document.querySelectorAll(selector)].filter(
          (element) => {
            return element.textContent
              ?.trim()
              .replace(/\s+/g, " ")
              .startsWith(text);
          },
        );
        return (
          candidates.length > 0 &&
          candidates.every((element) => {
            return (
              element.closest(
                "button:disabled,input:disabled,select:disabled,textarea:disabled",
              ) !== null ||
              element.closest("label")?.control?.matches(":disabled") === true
            );
          })
        );
      }, failure);
      if (isInactive) {
        console.info(
          "Inactive control contrast exemption",
          JSON.stringify(failure),
        );
      }
      return isInactive ? [] : [failure];
    }),
  );
  return activeFailures.flat();
}

/** Checks active milestone options in normal, hovered and selected states. */
export async function expectMilestoneOptionContrast(page: Page): Promise<void> {
  const option = page.getByRole("button", { name: /Home from the hospital/ });
  await page.mouse.move(0, 0);
  await expectSurfaceContrast(page);
  await option.hover();
  await expectSurfaceContrast(page);
  await option.click();
  await expect(option).toHaveAttribute("aria-pressed", "true");
  await expectSurfaceContrast(page);
}

/** Checks Upload controls on their actual print or panel ground. */
export async function expectContextControlContrast(
  page: Page,
  state: string,
): Promise<void> {
  const control =
    state === "milestone-new"
      ? page.getByRole("switch")
      : state === "milestone-fix"
        ? page.getByRole("radio").first()
        : ["done", "partial"].includes(state)
          ? page.getByRole("button", { name: "Upload more", exact: true })
          : state === "unavailable"
            ? page.getByRole("button", {
                name: "Read this batch again",
                exact: true,
              })
            : null;
  if (!control || !(await control.count())) return;
  await control.hover();
  await expectSurfaceContrast(page);
  await control.focus();
  await expect(control).toBeFocused();
  await expectSurfaceContrast(page);
  await page.mouse.move(0, 0);
}

/** Keeps below-fold state-specific content in a supplemental viewport capture. */
export async function scrollSurfaceStateForInspection(
  page: Page,
  state: string,
): Promise<void> {
  const regionName =
    state === "milestone-fix"
      ? "Photographs outside the milestone"
      : state === "visibility"
        ? "Who can see these"
        : state === "undated"
          ? "Undated files"
          : ["tagged", "people-tagged", "milestone-assigned"].includes(state)
            ? "What you have added"
            : null;
  if (regionName) {
    await page
      .getByRole("region", { name: regionName, exact: true })
      .scrollIntoViewIfNeeded();
  }
}

/** Uses genuine wheel scrolling to render skipped day sections and verify viewport entry. */
export async function scrollSurfaceControlByWheel(
  page: Page,
  target: Locator,
  deltaY: number,
): Promise<void> {
  await page.mouse.move(200, 450);
  await expect
    .poll(
      async () => {
        const isInViewport = await target.evaluate((element) => {
          const rectangle = element.getBoundingClientRect();
          return rectangle.top >= 0 && rectangle.bottom <= innerHeight;
        });
        if (!isInViewport) await page.mouse.wheel(0, deltaY);
        return isInViewport;
      },
      { timeout: 15_000 },
    )
    .toBe(true);
  await expect(target).toBeInViewport();
}

/** Waits for addressed draft loading to finish before acting on native controls. */
export async function expectSurfaceDraftReady(
  page: Page,
  sessionId: string,
): Promise<void> {
  await expect(page).toHaveURL((url) => {
    return url.searchParams.get("session") === sessionId;
  });
  await expect(
    page.getByRole("radio", { name: "Everyone", exact: true }),
  ).toBeEnabled();
}

/** Selects a controlled group through the visible Except form and awaits readiness. */
export async function chooseSurfaceVisibilityException(
  page: Page,
): Promise<void> {
  await page.getByText("Except", { exact: true }).click();
  await expect(
    page.getByRole("radio", { name: "Except", exact: true }),
  ).toBeChecked();
  const picker = page.getByRole("combobox", {
    name: "Everybody except these",
    exact: true,
  });
  await scrollSurfaceControlByWheel(page, picker, 450);
  await picker.fill("grandparents");
  await expect(picker).toBeFocused();
  await expect(picker).toHaveValue("grandparents");
  await expect(picker).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByRole("option", { name: /The grandparents/ }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Everybody except these", exact: true })
    .press("ArrowDown");
  await page
    .getByRole("combobox", { name: "Everybody except these", exact: true })
    .press("Enter");
  await page
    .getByRole("combobox", { name: "Everybody except these", exact: true })
    .press("Tab");
  await expect(
    page.getByText("The grandparents", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Put 264 up", exact: true }),
  ).toBeEnabled();
}
