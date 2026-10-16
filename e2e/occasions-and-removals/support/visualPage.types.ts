import type { APIResponse, Locator, Page, Request } from "@playwright/test";

/** Route operations used by controlled JSON and local artwork responses. */
export type VisualRoute = {
  fulfill: (options: {
    json?: unknown;
    contentType?: string;
    body?: string | Buffer;
  }) => Promise<void>;
  request: () => Pick<Request, "url">;
};

/** Route registration shared by controlled occasion and removal fixtures. */
export type VisualRoutingPage = {
  route: (
    url: string,
    handler: (route: VisualRoute) => Promise<void>,
  ) => Promise<unknown>;
};

/** Locator actions used to reveal one controlled visual state. */
export type VisualControl = Pick<Locator, "check" | "click"> & {
  first: () => VisualControl;
};

/**
 * Browser operations required to stage and observe a controlled visual page.
 */
export type ControlledVisualPage = VisualRoutingPage &
  Pick<Page, "unrouteAll" | "emulateMedia"> & {
    addInitScript: (
      script: (argument: string) => unknown,
      argument: string,
    ) => Promise<unknown>;
    request: {
      get: (
        url: string,
      ) => Promise<
        Pick<APIResponse, "status"> & { json: () => Promise<unknown> }
      >;
    };
    goto: (url: string) => Promise<unknown>;
    locator: (selector: string) => Pick<Locator, "waitFor">;
    getByRole: (...args: Parameters<Page["getByRole"]>) => VisualControl;
  };
