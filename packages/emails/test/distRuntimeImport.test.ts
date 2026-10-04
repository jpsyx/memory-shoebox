import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const PACKAGE_ROOT = fileURLToPath(new URL("..", import.meta.url));

/**
 * The guard on the one thing about this package no other check can see.
 *
 * Node's ESM resolver will not guess a file extension, so an emitted
 * `from "./lib/EmailShell"` cannot be loaded, and `pnpm start` dies on the
 * first import. Nothing else in the repository notices: `tsc` runs under
 * `moduleResolution: "bundler"` and Vitest resolves through Vite, and both
 * accept the extensionless form. The server's own suite is no help either,
 * because it imports this package through Vite as well.
 *
 * So this test leaves the toolchain entirely and asks `node` itself, which is
 * the only thing whose opinion matters in production.
 *
 * If it fails, a relative import in `src` lost its `.ts` or `.tsx` extension,
 * or `rewriteRelativeImportExtensions` was turned off. Restore the extension
 * rather than deleting this test.
 */

/** Runs a snippet in a real `node`, returning its stdout. */
function _runInNode(source: string): string {
  return execFileSync(process.execPath, ["--input-type=module", "-e", source], {
    cwd: PACKAGE_ROOT,
    encoding: "utf8",
  }).trim();
}
describe("the built package, loaded by node", () => {
  beforeAll(() => {
    execFileSync("pnpm", ["exec", "tsc", "-p", "tsconfig.build.json"], {
      cwd: PACKAGE_ROOT,
      encoding: "utf8",
    });
  }, 60_000);

  it("resolves every relative specifier it emitted", () => {
    const output = _runInNode(
      `import * as emails from "./dist/index.js";
       console.log(Object.keys(emails).sort().join(","));`,
    );

    expect(output).toBe(
      "CommentEmail,InvitationEmail,RemovalReminderEmail,RemovalReminderEmailTemplate,RemovalRequestEmail,RemovalRequestEmailTemplate,RemovalResolvedEmail,RemovalResolvedEmailTemplate,SignInCodeEmail,UploadSessionEmail,commentEmail,invitationEmail,signInCodeEmail,uploadSessionEmail",
    );
  });

  it("renders a message, so the whole graph loads and not just the entry", () => {
    const output = _runInNode(
      `import { signInCodeEmail } from "./dist/index.js";
       const rendered = await signInCodeEmail.render({
         shoeboxName: "My Shoebox",
         baseUrl: "https://shoebox.example",
         preferencesUrl: null,
         code: "410233",
         expiresInMinutes: 10,
       });
       console.log(rendered.text.includes("410233"));`,
    );

    expect(output).toBe("true");
  });
});
