import { QueryClient } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { makeUploadLifetimeWrapperFromViewerAndClient } from "./makeUploadLifetimeWrapperFromViewerAndClient";
import { vi } from "vitest";
import type { Viewer } from "@/session/requireSignedIn/requireSignedIn";
import { makeUploadControllerHarness } from "@/upload/createUploadSessionController/__tests__/uploadControllerTestHelpers/uploadControllerTestHelpers";
import * as dependenciesModule from "@/upload/createUploadSessionController/makeUploadControllerDependenciesFromOptions";
import type { MediaWorkerPort } from "@/upload/mediaWorker/mediaWorkerProtocol.types";
import type { UploadSessionResources } from "../UploadSessionProvider/UploadSessionProvider.types";
import { useUploadSessionResources } from "../UploadSessionProvider/useUploadSessionResources";
import { createHeldUploadDecoders } from "./createHeldUploadDecoders";

type HeldUploadLifetime = {
  resources: UploadSessionResources;
  decoders: ReturnType<typeof createHeldUploadDecoders>;
  api: ReturnType<typeof makeUploadControllerHarness>["api"];
  unmount: () => void;
};

/**
 * Renders the real StrictMode shell with only catalog and worker boundaries
 * replaced.
 */
export function renderHeldUploadLifetime(
  viewer: Readonly<Viewer>,
): HeldUploadLifetime {
  const catalog = makeUploadControllerHarness();
  catalog.controller.destroy();
  const decoders = createHeldUploadDecoders();
  const getDependencies =
    dependenciesModule.makeUploadControllerDependenciesFromOptions;
  vi.spyOn(
    dependenciesModule,
    "makeUploadControllerDependenciesFromOptions",
  ).mockImplementation((options) => {
    return getDependencies({
      ...options,
      api: catalog.api,
      storage: catalog.storage,
      getManifestEntryFromFile: catalog.headerReader,
    });
  });
  vi.stubGlobal("Worker", function MediaWorker(): MediaWorkerPort {
    return decoders.factory.createMediaWorker();
  });
  const client = new QueryClient();
  const view = renderHook(useUploadSessionResources, {
    wrapper: makeUploadLifetimeWrapperFromViewerAndClient({ viewer, client }),
  });
  return {
    resources: view.result.current,
    decoders,
    api: catalog.api,
    unmount: view.unmount,
  };
}
