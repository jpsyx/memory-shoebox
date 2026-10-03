import { expect, test, type Page } from "@playwright/test";
import { getContrastFailuresFromPage } from "./getContrastFailuresFromPage.ts";

/**
 * The contrast sweep's own rule for a layer behind the text that is not one
 * of its ancestors (`getUnderlaysFromLayer`, in
 * `getContrastFailuresFromDocument.ts`), checked against pages written for it
 * rather than against the product.
 *
 * The rule may only ever credit a layer that really is behind the words, so
 * two of the three cases are layers it must not count: one painted beneath
 * an opaque parent, and one behind only part of the text. Getting either
 * wrong is a sweep that passes text nobody can read.
 *
 * No sign-in and no seed: every page here is set from a string.
 */

/** The text of every element the sweep failed on the page it is given. */
async function _getFailingTextsFromMarkup(options: {
  page: Page;
  markup: string;
}): Promise<string[]> {
  await options.page.setContent(options.markup);
  const failures = await getContrastFailuresFromPage(options.page);
  return failures.map((failure) => {
    return failure.text;
  });
}

test("credits a segmented control's indicator under its chosen label", async ({
  page,
}) => {
  const markup = `<body style="margin: 0; background: #ebeef4">
    <div style="position: relative; display: flex; padding: 3px;
      background: #ebeef4; width: max-content">
      <span style="position: absolute; z-index: 1; left: 3px; top: 3px;
        width: 140px; height: 44px; background: #12235e"></span>
      <div style="position: relative; z-index: 2; width: 140px; height: 44px;
        display: flex; align-items: center; justify-content: center">
        <label><span style="color: #fbfcfe">EVERYONE</span></label>
      </div>
    </div>
  </body>`;

  expect(await _getFailingTextsFromMarkup({ page, markup })).toEqual([]);
});

test("does not credit a layer painted beneath an opaque parent", async ({
  page,
}) => {
  // The parent is positioned but has no z-index, so it is not a stacking
  // context: the dark layer goes under its pale background and is never
  // seen, and the white words are on the pale ground.
  const markup = `<body style="margin: 0; background: #ffffff">
    <div style="position: relative; background: #f4f4f4; padding: 10px;
      width: 300px">
      <span style="position: absolute; z-index: -1; inset: 0;
        background: #000000"></span>
      <p style="margin: 0">
        <span style="color: #ffffff">UNDER THE PARENT</span>
      </p>
    </div>
  </body>`;

  expect(await _getFailingTextsFromMarkup({ page, markup })).toEqual([
    "UNDER THE PARENT",
  ]);
});

test("does not credit a layer behind only the middle of the text", async ({
  page,
}) => {
  const markup = `<body style="margin: 0; background: #ffffff">
    <div style="position: relative; background: #f4f4f4; padding: 10px;
      width: 600px">
      <span style="position: absolute; z-index: 0; left: 250px; top: 0;
        width: 100px; height: 100%; background: #000000"></span>
      <p style="position: relative; z-index: 1; margin: 0; color: #ffffff">
        A LONG LABEL WHOSE TWO ENDS STAND ON THE PALE GROUND
      </p>
    </div>
  </body>`;

  expect(await _getFailingTextsFromMarkup({ page, markup })).toEqual([
    "A LONG LABEL WHOSE TWO ENDS STAND ON THE PALE GROUND",
  ]);
});
