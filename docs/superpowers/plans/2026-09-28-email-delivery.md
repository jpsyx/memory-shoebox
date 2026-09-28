# Email Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Write emails as react-email components in a package that compiles, and
deliver them through one `EmailService` that hides whether a message reached
Resend or became a PDF on the developer's disk.

**Architecture:** `@memory-shoebox/emails` is a new workspace package holding
`.tsx` templates, compiled to JavaScript because JSX is not erasable syntax and
`apps/server` runs its TypeScript unmodified. The server keeps parsing the
stored payload and keeps rendering before delivery, so the fake receives exactly
what Resend would. `EmailService` replaces the `MailSender` seam and gains three
implementations: Resend behind a rate limiter, a Playwright-backed PDF writer,
and the recording double the tests already use.

**Tech Stack:** react-email (`@react-email/components`, `@react-email/render`),
React 19, TypeScript compiled with `tsc`, Playwright, `@upstash/ratelimit` over
`@upstash/redis`, Fastify 5, Kysely over better-sqlite3, Vitest.

---

## Read before starting

The design is
[`docs/superpowers/specs/2026-09-28-email-delivery-design.md`](../specs/2026-09-28-email-delivery-design.md).
It carries the reasoning; this plan carries the code. Two documents state the
invariants this work must not break:

| Document                                                                      | What it settles                                                             |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `docs/mail.md`                                                                | The queue is the log; rendering takes the payload and nothing else          |
| `docs/prds/2026-09-27-memory-shoebox/tech-specs/apis/notifications.md` Part 1 | The payload holds resolved values, and one message is one row per recipient |

## Conventions this plan assumes

Read `AGENTS.md` and `docs/rules/typescript.md` once before Task 1. The ones
that bite in this work specifically:

- **Import extensions differ by package.** `.oxlintrc.json` requires a `.ts`
  extension on relative imports inside `apps/server/**` and
  `packages/shared/**`, and forbids one everywhere else. So
  **`packages/emails` uses extensionless relative imports**, like `apps/web`.
  Getting this backwards fails lint immediately.
- `type`, never `interface`. Never `any`. Every exported symbol has a
  docstring. Non-exported top-level helpers are prefixed `_`.
- **Never use an em dash** in code, comments, documents or commit messages.
- Functions stay at 45 lines or fewer, and a source file over 400 lines is a
  finding.
- `arrow-body-style` is set to `always`, so every arrow function uses a block
  body and an explicit `return`, including inside JSX callbacks.

Commands:

```sh
pnpm --filter @memory-shoebox/emails test
pnpm --filter @memory-shoebox/server test
pnpm check          # format, lint, types, build, tests: the gate
```

## File structure

```
packages/emails/                      NEW, and the only package that compiles
├── package.json                      main points at dist, not src
├── tsconfig.json                     type-check only, like its siblings
├── tsconfig.build.json               the one that emits, with jsx: react-jsx
├── vitest.config.ts
└── src/
    ├── index.ts                      one template object per kind that has copy
    ├── emailTemplate.types.ts        EmailTemplate, RenderedEmail
    ├── lib/
    │   ├── emailTheme.ts             literal hex, the system font stack, the source URL
    │   ├── spellSmallNumber.ts       moved from the server's layout helpers
    │   └── EmailShell.tsx            masthead, 600px column, footer
    └── templates/
        └── SignInCodeEmail.tsx       the one kind with copy

apps/server/src/mail/
├── EmailService/
│   ├── EmailService.types.ts         the seam: EmailService, EmailSendRequest, EmailSendResult
│   ├── createEmailService.ts         the factory that chooses an implementation
│   ├── createResendEmailService.ts   Resend, behind the limiter (was createResendMailSender.ts)
│   ├── createFakeEmailService.ts     the PDF writer
│   └── createSendRateLimiter.ts      Upstash, or the same window in memory
├── templates/emailTemplates.constants.ts   MODIFY: delegate to the package
├── templates/signInCodeTemplate.ts         DELETE
├── templates/emailLayoutHelpers.ts         DELETE
├── runMailQueueOnce.ts               MODIFY: await the renderer, rename the seam
└── MailSendError.ts                  unchanged, see Task 1

apps/server/test/helpers/createRecordingMailSender.ts  RENAME to createRecordingEmailService.ts
```

---

## Task 1: Rename the seam, change nothing else

**Files:**

- Rename: `apps/server/src/mail/createResendMailSender.ts` to `apps/server/src/mail/EmailService/createResendEmailService.ts`
- Create: `apps/server/src/mail/EmailService/EmailService.types.ts`
- Rename: `apps/server/test/helpers/createRecordingMailSender.ts` to `apps/server/test/helpers/createRecordingEmailService.ts`
- Modify: `apps/server/src/app.ts`, `apps/server/src/mail/runMailQueueOnce.ts`, `apps/server/src/mail/createMailQueueJob.ts`, and every test that names the old symbols

The seam is about to gain two implementations. Renaming first keeps the commit
that adds behaviour readable.

**What is renamed:** `MailSender` to `EmailService`, `MailSendRequest` to
`EmailSendRequest`, `MailSendResult` to `EmailSendResult`,
`createResendMailSender` to `createResendEmailService`,
`createRecordingMailSender` to `createRecordingEmailService`, and the
`mailSender` dependency on `createApp` to `emailService`.

**What is not renamed:** the `sender` field on `MailQueueRunOptions` and on the
worker's own context. It names a role in a call rather than a type, it reads
correctly, and renaming it would touch the worker for nothing. Its type changes
from `MailSender | undefined` to `EmailService | undefined`.

**What is not renamed either, correcting the design document:** `MailSendError` stays.
It belongs to the queue's error vocabulary rather than to the sender: its codes
are written into `outbound_emails.last_error_code` and read back by the health
surface, and `render_failed` is raised by the worker rather than by any sender.
Renaming it would churn the worker without clarifying anything.

- [ ] **Step 1: Move the seam's types into their own file**

Create `apps/server/src/mail/EmailService/EmailService.types.ts` with the three
types lifted from `createResendMailSender.ts`, unchanged except for their
names:

```ts
/** One message, rendered and addressed, ready to hand to a service. */
export type EmailSendRequest = {
  /** The full identity, for example `My Shoebox <shoebox@example.com>`. */
  from: string;
  to: string;
  subject: string;
  html: string;
  /** The plain-text alternative. Never omitted: for some members in this
   * audience it is the only version that ever arrives. */
  text: string;
  /** The row's own `idempotency_key`, so a retry cannot duplicate a send that
   * in fact succeeded and whose response we lost. */
  idempotencyKey: string;
};

/** What the service said about one accepted message. */
export type EmailSendResult = {
  /** Undefined when the service accepted the message without naming one. */
  providerMessageId: string | undefined;
};

/**
 * Delivers one message.
 *
 * **The one seam every test substitutes, and the one place the difference
 * between a real send and a local PDF lives.** A caller hands over a finished
 * `html` and `text` and learns only whether it was accepted, which is what
 * lets the fake receive exactly what Resend would.
 */
export type EmailService = {
  send: (request: EmailSendRequest) => Promise<EmailSendResult>;
};
```

- [ ] **Step 2: Move the Resend implementation and rename it**

`git mv apps/server/src/mail/createResendMailSender.ts apps/server/src/mail/EmailService/createResendEmailService.ts`.

In the moved file: delete the three type declarations now living in
`EmailService.types.ts` and import them instead, rename the function to
`createResendEmailService`, and fix the `MailSendError` import for its new
depth (`../MailSendError.ts`). Keep `ResendEmailsApi` where it is, keep every
docstring, and change no behaviour.

- [ ] **Step 3: Rename the test double**

`git mv apps/server/test/helpers/createRecordingMailSender.ts apps/server/test/helpers/createRecordingEmailService.ts`,
rename `RecordingMailSender` to `RecordingEmailService` and
`createRecordingMailSender` to `createRecordingEmailService`, and update its
imports to the new paths.

- [ ] **Step 4: Update every caller**

```sh
grep -rln "MailSender\|MailSendRequest\|MailSendResult\|createRecordingMailSender\|mailSender" apps/server
```

Work through every hit. `apps/server/src/app.ts` needs the most care: the
`AppDeps` field, its docstring naming the three states, the
`declare module "fastify"` block, the `app.decorate` call, and the private
`_buildMailSender`, which becomes `_buildEmailService`. The `"none"` literal
keeps its meaning and its name.

- [ ] **Step 5: Verify nothing changed but names**

```sh
pnpm --filter @memory-shoebox/server test
pnpm --filter @memory-shoebox/server exec tsc --noEmit
npx oxlint apps/server
npx oxfmt --check .
```

Expected: every test passes, with no test edited except for the symbol names it
imports. If a test's **assertions** had to change, something other than a name
changed; find it.

- [ ] **Step 6: Commit**

```bash
git add apps/server
git commit -m "refactor(server): the mail sender is an email service"
```

---

## Task 2: The package, and the render API it actually has

**Files:**

- Create: `packages/emails/package.json`, `tsconfig.json`, `tsconfig.build.json`, `vitest.config.ts`
- Create: `packages/emails/src/index.ts`
- Test: `packages/emails/test/toolchain.test.tsx`
- Modify: `package.json` (root scripts), `Dockerfile`

This task exists to settle the toolchain before any copy is written. The
version of `@react-email/render` decides whether rendering is synchronous, and
everything downstream depends on the answer.

- [ ] **Step 1: Create the package manifest**

`packages/emails/package.json`:

```json
{
  "name": "@memory-shoebox/emails",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "license": "AGPL-3.0-only",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "dev": "tsc -p tsconfig.build.json --watch --preserveWatchOutput",
    "type-check": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@memory-shoebox/shared": "workspace:*",
    "@react-email/components": "^0.5.1",
    "@react-email/render": "^1.1.2",
    "react": "^19.2.7"
  },
  "devDependencies": {
    "@types/react": "^19.2.17",
    "typescript": "~6.0.3",
    "vitest": "^4.1.11"
  }
}
```

React is pinned to the version `apps/web` already uses, so the workspace holds
one React.

- [ ] **Step 2: Create both tsconfigs**

`packages/emails/tsconfig.json`, which only type-checks, matching its siblings:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ESNext", "DOM"],
    "jsx": "react-jsx"
  },
  "include": ["src", "test", "vitest.config.ts"]
}
```

`packages/emails/tsconfig.build.json`, the one that emits:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src",
    "allowImportingTsExtensions": false
  },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts", "src/**/*.test.tsx"]
}
```

`allowImportingTsExtensions` is switched off here because it cannot coexist
with emitting, and it is the reason this package's relative imports carry no
extension. That matches `.oxlintrc.json`, which requires the extension only
under `apps/server` and `packages/shared`.

- [ ] **Step 3: Create the vitest config**

`packages/emails/vitest.config.ts`, copying the shape of
`packages/shared/vitest.config.ts` (read it first) and adding nothing: Vitest
reads `jsx` from the tsconfig.

- [ ] **Step 4: Install**

```sh
pnpm install
```

Expected: pnpm links the new workspace member. If it refuses, check
`pnpm-workspace.yaml` already globs `packages/*`, which it does.

- [ ] **Step 5: Write the toolchain probe**

Create `packages/emails/test/toolchain.test.tsx`. This is a real test, not
scaffolding: it pins the two properties every template depends on.

```tsx
import { Body, Html, Text } from "@react-email/components";
import { render } from "@react-email/render";
import { describe, expect, it } from "vitest";

/** The smallest thing that exercises the toolchain end to end. */
function Probe(): React.JSX.Element {
  return (
    <Html>
      <Body>
        <Text>hello from a component</Text>
      </Body>
    </Html>
  );
}

describe("the react-email toolchain", () => {
  it("renders a component to html", async () => {
    const html = await render(<Probe />);

    expect(html).toContain("hello from a component");
    expect(html).toContain("<html");
  });

  it("renders the same component to plain text, with no markup left", async () => {
    const text = await render(<Probe />, { plainText: true });

    expect(text).toContain("hello from a component");
    expect(text).not.toContain("<html");
    expect(text).not.toContain("<p");
  });
});
```

- [ ] **Step 6: Run it, and record what the API actually is**

```sh
pnpm --filter @memory-shoebox/emails test
```

Expected: PASS. **If `render` turns out to be synchronous in the installed
version**, `await` on a string is harmless and the tests still pass, but say so
in your report: the rest of this plan treats rendering as asynchronous, and a
synchronous API would let Task 6 keep the worker's renderer synchronous.

- [ ] **Step 7: Give the package an entry point**

`packages/emails/src/index.ts`, which the next tasks fill in:

```ts
export type { EmailTemplate, RenderedEmail } from "./emailTemplate.types";
```

That file does not exist yet, so create `packages/emails/src/emailTemplate.types.ts`:

```ts
/** One rendered message, in both forms a mail client may choose between. */
export type RenderedEmail = {
  html: string;
  text: string;
};

/**
 * One kind's copy.
 *
 * **Takes the payload and nothing else.** That is the mechanical test for
 * whether a payload is right (`apis/notifications.md` § Rules that hold for all
 * nine): if rendering would need a query, the payload is wrong, and a retry a
 * day later would produce a different message from the same row.
 *
 * `subject` is separate from `render` and stays synchronous because it is
 * needed at **enqueue** time, where the row's subject column is written, while
 * the body is rendered at **send** time.
 */
export type EmailTemplate<Payload> = {
  subject: (payload: Payload) => string;
  render: (payload: Payload) => Promise<RenderedEmail>;
};
```

- [ ] **Step 8: Teach the root scripts and the image about the package**

In the root `package.json`, the `dev` and `dev:server` scripts must build the
package before the server starts, because the server imports its output:

```json
"dev": "pnpm --filter @memory-shoebox/emails build && pnpm --parallel --filter \"./apps/*\" --filter @memory-shoebox/emails dev",
"dev:server": "pnpm --filter @memory-shoebox/emails build && pnpm --filter @memory-shoebox/server dev",
```

`build` is already `pnpm -r build`, which pnpm runs in dependency order, so
`pnpm check` needs no change.

In the `Dockerfile`, add the manifest to the copied list, beside the others:

```dockerfile
COPY packages/emails/package.json packages/emails/package.json
```

and build the package in the same step that builds the web app, **before** the
production install prunes dev dependencies:

```dockerfile
RUN pnpm --filter @memory-shoebox/emails build
RUN pnpm --filter @memory-shoebox/web build
```

- [ ] **Step 9: Verify the build emits what the manifest promises**

```sh
pnpm --filter @memory-shoebox/emails build
ls packages/emails/dist
```

Expected: `index.js` and `index.d.ts` exist. Add `packages/emails/dist` to
`.gitignore` if the repository's ignore file does not already cover `dist`;
check first rather than assuming.

- [ ] **Step 10: Commit**

```bash
git add packages/emails package.json pnpm-lock.yaml Dockerfile .gitignore
git commit -m "feat(emails): a package that compiles, because JSX cannot be erased"
```

---

## Task 3: The shell every message sits in

**Files:**

- Create: `packages/emails/src/lib/emailTheme.ts`
- Create: `packages/emails/src/lib/spellSmallNumber.ts`
- Create: `packages/emails/src/lib/EmailShell.tsx`
- Test: `packages/emails/test/EmailShell.test.tsx`

This is a port of `apps/server/src/mail/templates/emailLayoutHelpers.ts`. Read
that file first: its docstrings carry the reasoning, and the reasoning survives
the port even though the code does not.

**The constraint that outlives the rewrite:** nothing here may reference a
design token, a webfont, or a layout that needs a modern renderer.
`prototypes/src/surfaces/Emails.module.css` says so and gives the reason: a
mail client strips webfonts, ignores custom properties, flattens `color-mix`,
and may show the plain-text alternative instead of any of it. What is being
designed is whether the message still reads after somebody forwards it to four
people.

- [ ] **Step 1: Write the failing test**

Create `packages/emails/test/EmailShell.test.tsx`:

```tsx
import { Text } from "@react-email/components";
import { render } from "@react-email/render";
import { describe, expect, it } from "vitest";
import { EmailShell } from "../src/lib/EmailShell";

/** The shell with a one-line body, which is all these cases need. */
function shellWith(preferencesUrl: string | null): React.JSX.Element {
  return (
    <EmailShell shoeboxName="My Shoebox" preferencesUrl={preferencesUrl}>
      <Text>the body</Text>
    </EmailShell>
  );
}

describe("the shell every message sits in", () => {
  it("names the Shoebox in the masthead and in the footer", async () => {
    const html = await render(shellWith(null));

    expect(html).toContain("My Shoebox");
    expect(html).toContain("This went to you because you are in My Shoebox.");
  });

  it("offers the source, which the licence obliges", async () => {
    const html = await render(shellWith(null));

    expect(html).toContain("https://github.com/jpsyx/memory-shoebox");
    expect(html).toContain("get the source of");
  });

  it("omits the preferences link when there is no switch to offer", async () => {
    const html = await render(shellWith(null));

    expect(html).not.toContain("Turn these emails off");
  });

  it("offers the preferences link when there is one", async () => {
    const html = await render(shellWith("https://shoebox.example/account"));

    expect(html).toContain("Turn these emails off");
    expect(html).toContain("https://shoebox.example/account");
  });

  it("references no design token, because a mail client resolves none", async () => {
    const html = await render(shellWith(null));

    expect(html).not.toContain("var(--");
    expect(html).not.toContain("color-mix");
    expect(html).toContain("Arial");
  });

  it("carries the body through to the plain-text form", async () => {
    const text = await render(shellWith(null), { plainText: true });

    expect(text).toContain("the body");
    expect(text).toContain("My Shoebox");
    expect(text).not.toContain("<");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @memory-shoebox/emails test`
Expected: FAIL, cannot resolve `../src/lib/EmailShell`.

- [ ] **Step 3: Write the theme**

`packages/emails/src/lib/emailTheme.ts`:

```ts
/**
 * Literal values, because a mail client resolves nothing.
 *
 * Every colour here is a hex string and the font stack names fonts a client
 * already has. A custom property, a webfont or a `color-mix` would be dropped
 * by the renderer and take the design with it.
 */
export const EMAIL_THEME = {
  ink: "#1b1f22",
  quietInk: "#4a4a4a",
  paper: "#ffffff",
  rule: "#cccccc",
  fontFamily: "Arial,Helvetica,sans-serif",
  /** The column the mockups were drawn at. */
  columnWidth: "600px",
} as const;

/**
 * Where an AGPL-licensed instance offers its source.
 *
 * The footer's offer is a licence obligation as much as a courtesy, so it is
 * in every message rather than configurable per deployment.
 */
export const SOURCE_URL = "https://github.com/jpsyx/memory-shoebox";
```

- [ ] **Step 4: Move the number speller across**

`packages/emails/src/lib/spellSmallNumber.ts`, copied from the server's layout
helpers with its docstring intact:

```ts
/**
 * Spells a small number in English, falling back to digits.
 *
 * The mockup reads "It works for ten minutes", and the payload carries `10` so
 * the copy cannot drift from the row. Hard-coding the word would defeat the
 * field, and printing "10" would not be the copy that was designed, so the
 * number is spelled.
 */
export function spellSmallNumber(value: number): string {
  const words = [
    "zero",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
    "eleven",
    "twelve",
  ];
  return words[value] ?? String(value);
}
```

- [ ] **Step 5: Write the shell**

`packages/emails/src/lib/EmailShell.tsx`:

```tsx
import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Section,
  Text,
} from "@react-email/components";
import { EMAIL_THEME, SOURCE_URL } from "./emailTheme";
import type { ReactNode } from "react";

type Props = {
  /** The instance's own name, resolved at enqueue and carried in the payload. */
  shoeboxName: string;
  /**
   * Null for `sign_in_code`, and only for it: offering to turn off a message
   * that cannot be turned off is a lie.
   */
  preferencesUrl: string | null;
  children: ReactNode;
};

/**
 * The masthead, the column and the footer every message shares.
 *
 * **There is deliberately no preview line.** react-email's `Preview` hides a
 * line of text for the inbox list, and that text reappears at the top of the
 * plain-text rendering, where it reads as the message saying itself twice.
 */
export function EmailShell({
  shoeboxName,
  preferencesUrl,
  children,
}: Props): React.JSX.Element {
  return (
    <Html>
      <Head />
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Text style={styles.masthead}>{shoeboxName}</Text>
          <Hr style={styles.mastheadRule} />
          <Section>{children}</Section>
          <Hr style={styles.footerRule} />
          <Section>
            <Text style={styles.footerText}>
              {`This went to you because you are in ${shoeboxName}. Nobody outside it can see anything here.`}
            </Text>
            <Text style={styles.footerText}>
              {preferencesUrl === null ? null : (
                <>
                  <Link href={preferencesUrl} style={styles.footerLink}>
                    Turn these emails off
                  </Link>
                  {" · "}
                </>
              )}
              {"Memory Shoebox, which you can "}
              <Link href={SOURCE_URL} style={styles.footerLink}>
                get the source of
              </Link>
              {"."}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const styles = {
  body: {
    backgroundColor: EMAIL_THEME.paper,
    color: EMAIL_THEME.ink,
    fontFamily: EMAIL_THEME.fontFamily,
    fontSize: "16px",
    lineHeight: "1.5",
    margin: 0,
    padding: "24px",
  },

  container: {
    margin: "0 auto",
    maxWidth: EMAIL_THEME.columnWidth,
  },

  masthead: {
    fontSize: "18px",
    fontWeight: "bold",
    margin: 0,
  },

  mastheadRule: {
    borderColor: EMAIL_THEME.ink,
    borderTopWidth: "2px",
    margin: "12px 0 0",
  },

  footerRule: {
    borderColor: EMAIL_THEME.rule,
    margin: "28px 0 16px",
  },

  footerText: {
    color: EMAIL_THEME.quietInk,
    fontSize: "14px",
    margin: "0 0 8px",
  },

  footerLink: {
    color: EMAIL_THEME.ink,
  },
};
```

Two details that are not stylistic. The sentences are written as single
interpolated strings rather than as JSX text with expressions between words,
so each renders as one text node and a test can assert on the whole sentence.
And `styles` is declared after the component, matching the file it was ported
from.

- [ ] **Step 6: Run the test**

Run: `pnpm --filter @memory-shoebox/emails test`
Expected: PASS, six cases.

- [ ] **Step 7: Commit**

```bash
git add packages/emails
git commit -m "feat(emails): the shell every message sits in"
```

---

## Task 4: The sign-in code message

**Files:**

- Create: `packages/emails/src/templates/SignInCodeEmail.tsx`
- Modify: `packages/emails/src/index.ts`
- Test: `packages/emails/test/SignInCodeEmail.test.tsx`

The one kind with copy. Read
`apps/server/src/mail/templates/signInCodeTemplate.ts` first; this is its port.

The copy is fixed by surface 16 of the design spec and must survive: the six
digits large and selectable, "Type it into the page you left open. It works for
ten minutes and then it stops.", the reassurance that an unrequested code means
somebody typed an address by mistake, the digits in the **subject** so the code
reads off a lock screen, and no preferences link.

- [ ] **Step 1: Write the failing test**

Create `packages/emails/test/SignInCodeEmail.test.tsx`. These are the seven
cases from `apps/server/test/mail/templates/signInCodeTemplate.test.ts`, moved
and adapted:

```tsx
import { describe, expect, it } from "vitest";
import type { SignInCodeEmailPayload } from "@memory-shoebox/shared";
import { signInCodeEmail } from "../src/templates/SignInCodeEmail";

const PAYLOAD: SignInCodeEmailPayload = {
  shoeboxName: "My Shoebox",
  baseUrl: "https://shoebox.example",
  timezone: "Europe/Madrid",
  toDisplayName: "Abuela Rosa",
  preferencesUrl: null,
  code: "410233",
  expiresAt: "2026-09-27T10:10:00.000Z",
  expiresInMinutes: 10,
};

describe("the sign-in code message", () => {
  it("puts the digits in the subject, so the code reads off a lock screen", () => {
    expect(signInCodeEmail.subject(PAYLOAD)).toBe("Your code is 410233");
  });

  it("renders the digits, the ten minutes, and the reassurance", async () => {
    const { html } = await signInCodeEmail.render(PAYLOAD);

    expect(html).toContain("410233");
    expect(html).toContain("It works for ten minutes and then it stops.");
    expect(html).toContain("somebody typed your address by mistake");
    expect(html).toContain("My Shoebox");
  });

  it("renders a plain-text alternative that stands on its own", async () => {
    const { text } = await signInCodeEmail.render(PAYLOAD);

    expect(text).toContain("My Shoebox");
    expect(text).toContain("410233");
    expect(text).toContain("This went to you because you are in My Shoebox.");
  });

  it("omits the preferences link in both forms, because there is no switch to offer", async () => {
    const { html, text } = await signInCodeEmail.render(PAYLOAD);

    expect(html).not.toContain("Turn these emails off");
    expect(text).not.toContain("Turn these emails off");
  });

  it("references no design token, because a mail client resolves none", async () => {
    const { html } = await signInCodeEmail.render(PAYLOAD);

    expect(html).not.toContain("var(--");
    expect(html).not.toContain("color-mix");
    expect(html).toContain("Arial");
  });

  it("takes the minutes from the payload rather than hard-coding the word", async () => {
    const { html } = await signInCodeEmail.render({
      ...PAYLOAD,
      expiresInMinutes: 5,
    });

    expect(html).toContain("It works for five minutes and then it stops.");
  });

  it("renders the same message twice, so a retry cannot differ", async () => {
    const first = await signInCodeEmail.render(PAYLOAD);
    const second = await signInCodeEmail.render(PAYLOAD);

    expect(second).toEqual(first);
  });
});
```

**One assertion deliberately changed from the original**, and it is the only
behavioural difference in the port: the plain-text masthead was
`"MY SHOEBOX"`, produced by a hand-written text renderer that uppercased it.
The plain text now comes from the same component as the HTML, so the masthead
reads `"My Shoebox"`. The guarantee that mattered, a text alternative that
names who it is from and carries the code, is unchanged. **Do not restore the
uppercase by hand-writing a second text template**: that is the drift this port
exists to remove.

The last case is new and worth having: it is the payload-determinism promise
the queue depends on, asserted directly.

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @memory-shoebox/emails test`
Expected: FAIL, cannot resolve `../src/templates/SignInCodeEmail`.

- [ ] **Step 3: Write the template**

`packages/emails/src/templates/SignInCodeEmail.tsx`:

```tsx
import { Text } from "@react-email/components";
import { render } from "@react-email/render";
import { EmailShell } from "../lib/EmailShell";
import { EMAIL_THEME } from "../lib/emailTheme";
import { spellSmallNumber } from "../lib/spellSmallNumber";
import type { EmailTemplate } from "../emailTemplate.types";
import type { SignInCodeEmailPayload } from "@memory-shoebox/shared";

const REASSURANCE =
  "If you did not ask for this, somebody typed your address by mistake. Nothing has happened and you can ignore it.";

type Props = {
  payload: SignInCodeEmailPayload;
};

/**
 * `sign_in_code`: surface 16, state `code`.
 *
 * The six digits are in the subject deliberately, so the code reads off a lock
 * screen without opening anything. That is also why both the payload and the
 * subject are scrubbed once the row is terminal: the subject column is
 * otherwise a permanent log of live-looking codes sitting beside the address
 * each was sent to.
 *
 * The footer carries no preferences link, because a sign-in code is the one
 * message nobody may turn off.
 */
export function SignInCodeEmail({ payload }: Props): React.JSX.Element {
  return (
    <EmailShell
      shoeboxName={payload.shoeboxName}
      preferencesUrl={payload.preferencesUrl}
    >
      <Text style={styles.heading}>Your code</Text>
      <Text style={styles.code}>{payload.code}</Text>
      <Text style={styles.paragraph}>
        {`Type it into the page you left open. It works for ${spellSmallNumber(payload.expiresInMinutes)} minutes and then it stops.`}
      </Text>
      <Text style={styles.paragraph}>{REASSURANCE}</Text>
    </EmailShell>
  );
}

/** The kind's copy, as the queue consumes it. */
export const signInCodeEmail: EmailTemplate<SignInCodeEmailPayload> = {
  subject: (payload) => {
    return `Your code is ${payload.code}`;
  },

  render: async (payload) => {
    const element = <SignInCodeEmail payload={payload} />;
    return {
      html: await render(element),
      text: await render(element, { plainText: true }),
    };
  },
};

const styles = {
  heading: {
    fontSize: "24px",
    fontWeight: "bold",
    lineHeight: "1.2",
    margin: "24px 0 0",
  },

  code: {
    border: `2px solid ${EMAIL_THEME.ink}`,
    fontFamily: "'Courier New',Courier,monospace",
    fontSize: "34px",
    fontWeight: "bold",
    letterSpacing: "0.35em",
    margin: "20px 0 0",
    padding: "16px",
    textAlign: "center" as const,
  },

  paragraph: {
    margin: "16px 0 0",
  },
};
```

- [ ] **Step 4: Export it**

`packages/emails/src/index.ts`:

```ts
export { SignInCodeEmail, signInCodeEmail } from "./templates/SignInCodeEmail";
export type { EmailTemplate, RenderedEmail } from "./emailTemplate.types";
```

- [ ] **Step 5: Run the test**

Run: `pnpm --filter @memory-shoebox/emails test`
Expected: PASS, thirteen cases across the two files.

If the "ten minutes" assertion fails because the sentence arrived split, the
interpolated-string form above was not used: React renders adjacent expressions
as separate text nodes, and a sentence assembled from three of them cannot be
matched whole.

- [ ] **Step 6: Commit**

```bash
git add packages/emails
git commit -m "feat(emails): the sign-in code message, in react-email"
```

---

## Task 5: The server renders through the package

**Files:**

- Modify: `apps/server/src/mail/templates/emailTemplates.constants.ts`
- Modify: `apps/server/src/mail/runMailQueueOnce.ts`
- Modify: `apps/server/package.json`
- Delete: `apps/server/src/mail/templates/signInCodeTemplate.ts`
- Delete: `apps/server/src/mail/templates/emailLayoutHelpers.ts`
- Delete: `apps/server/test/mail/templates/signInCodeTemplate.test.ts`

The registry stays where it is and keeps its job as the gate on what may be
enqueued. What changes is where the copy comes from, and that rendering is now
asynchronous.

- [ ] **Step 1: Depend on the package**

Add to `apps/server/package.json`'s `dependencies`, in its existing
alphabetical position:

```json
"@memory-shoebox/emails": "workspace:*",
```

Then `pnpm install`.

- [ ] **Step 2: Point the registry at the package**

Rewrite `apps/server/src/mail/templates/emailTemplates.constants.ts`. Read the
existing file first and keep every docstring that still applies: the argument
for why the registry is the gate, and the argument for why the renderer parses
before rendering, are both still true.

```ts
import { signInCodeEmail } from "@memory-shoebox/emails";
import {
  signInCodeEmailPayloadSchema,
  type EmailCommon,
  type SignInCodeEmailPayload,
} from "@memory-shoebox/shared";
import type { EmailTemplate, RenderedEmail } from "@memory-shoebox/emails";
import type { ZodType } from "zod";

/**
 * The payload each built kind carries, minus `EmailCommon`, which
 * `enqueueEmail` resolves.
 *
 * Only `sign_in_code` has copy today, so it is the only entry. A kind gains an
 * entry here in the same change that adds its template and its callers, which
 * is what keeps this type from ever being ahead of the copy that renders it.
 */
export type EmailPayloadExtras = {
  sign_in_code: Omit<SignInCodeEmailPayload, keyof EmailCommon>;
};

/** Kind to the copy that kind's payload can actually be rendered by. */
type EmailTemplateRegistry = {
  [Kind in keyof EmailPayloadExtras]: EmailTemplate<
    EmailCommon & EmailPayloadExtras[Kind]
  >;
};

/**
 * Kind to copy, for every kind that has copy.
 *
 * **This object is what gates the mail queue.** `enqueueEmail` derives a
 * message's subject from its template, so a kind absent from here cannot be
 * enqueued at all, and the attempt is a type error rather than a row that sits
 * `queued` forever behind a renderer that cannot render it. Copy and caller
 * therefore have to land together, which is the point: the compiler enforces
 * it rather than a convention asking for it.
 */
export const EMAIL_TEMPLATES = {
  sign_in_code: signInCodeEmail,
} as const satisfies EmailTemplateRegistry;

/** A kind that has copy today, and so may be enqueued today. */
export type BuiltEmailKind = keyof typeof EMAIL_TEMPLATES;

/**
 * Renders one stored row's payload into both forms a mail client picks from.
 *
 * Takes `unknown` because that is honestly what the worker holds: it reads
 * `payload_json` back out of SQLite, where a row may have been written by an
 * older build or edited by hand. The kind is typed now, and that does not help
 * here: knowing a row is a `comment` says nothing about whether the JSON beside
 * it still matches that kind's schema. The parse that turns one into the other
 * is closed over beside the template that needs it, so the worker never names a
 * payload type it cannot know.
 */
export type EmailRenderer = (payload: unknown) => Promise<RenderedEmail>;

/** Pairs one kind's schema with its copy, and forgets which kind it was. */
function _createRenderer<Payload extends EmailCommon>(options: {
  template: EmailTemplate<Payload>;
  schema: ZodType<Payload>;
}): EmailRenderer {
  return async (payload) => {
    return options.template.render(options.schema.parse(payload));
  };
}

/**
 * Kind to renderer, for every kind that has copy.
 *
 * The worker's half of `EMAIL_TEMPLATES`: same keys, same gate, but it
 * validates the stored payload first. A payload that does not parse throws
 * inside the worker's `try` and lands as `render_failed`, which is the outcome
 * that branch was always written for.
 */
export const EMAIL_RENDERERS = {
  sign_in_code: _createRenderer({
    template: signInCodeEmail,
    schema: signInCodeEmailPayloadSchema,
  }),
} as const satisfies Record<BuiltEmailKind, EmailRenderer>;
```

- [ ] **Step 3: Await the renderer in the worker**

In `apps/server/src/mail/runMailQueueOnce.ts`, the render call becomes
awaited. Find the line inside the `try` that reads

```ts
const rendered = render(JSON.parse(row.payload_json));
```

and make it

```ts
const rendered = await render(JSON.parse(row.payload_json));
```

Check the enclosing function is already `async`; it is. Change nothing else:
the `try` that turns a throw into `render_failed` still wraps it, and an
awaited rejection lands in the same place.

- [ ] **Step 4: Delete what the package replaced**

```sh
git rm apps/server/src/mail/templates/signInCodeTemplate.ts
git rm apps/server/src/mail/templates/emailLayoutHelpers.ts
git rm apps/server/test/mail/templates/signInCodeTemplate.test.ts
```

The content assertions now live in `packages/emails/test/SignInCodeEmail.test.tsx`.
If any other file imports the deleted modules, follow the error: `escapeHtml`
and the text wrapper have no callers once the templates are gone, which is why
they go with them.

- [ ] **Step 5: Run the whole server suite**

```sh
pnpm --filter @memory-shoebox/emails build
pnpm --filter @memory-shoebox/server test
pnpm --filter @memory-shoebox/server exec tsc --noEmit
npx oxlint apps/server packages/emails
npx oxfmt --check .
```

The build comes first because the server now imports the package's output.

Expected: PASS. `apps/server/test/mail/runMailQueueOnce.test.ts` and
`apps/server/test/mail/forbiddenPayload.test.ts` exercise the renderer and are
the check that the registry still behaves. If either fails on an unawaited
promise, a second render call was missed.

- [ ] **Step 6: Commit**

```bash
git add apps/server packages/emails pnpm-lock.yaml
git commit -m "refactor(server): the copy lives in the emails package now"
```

---

## Task 6: The rate limiter, and its fallback

**Files:**

- Create: `apps/server/src/mail/EmailService/createSendRateLimiter.ts`
- Test: `apps/server/test/mail/EmailService/createSendRateLimiter.test.ts`
- Modify: `apps/server/package.json`

Resend allows two requests a second. Avandar limits to 1.7 for slack and waits
for a slot rather than failing, and this follows that. The difference here is
the fallback: this instance must boot with nothing configured, so an absent
Upstash is a quieter limiter rather than a dead server.

- [ ] **Step 1: Add the dependencies**

Add to `apps/server/package.json`'s `dependencies`:

```json
"@upstash/ratelimit": "^2.0.5",
"@upstash/redis": "^1.35.0",
```

Then `pnpm install`.

- [ ] **Step 2: Write the failing test**

Create `apps/server/test/mail/EmailService/createSendRateLimiter.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createSendRateLimiter } from "../../../src/mail/EmailService/createSendRateLimiter.ts";

/** A clock and a sleep that record rather than wait. */
function createFakeTime() {
  const slept: number[] = [];
  let nowMs = 0;
  return {
    slept,
    now: () => {
      return nowMs;
    },
    sleep: (ms: number) => {
      nowMs += ms;
      slept.push(ms);
      return Promise.resolve();
    },
  };
}

describe("createSendRateLimiter", () => {
  it("limits in memory when Upstash is not configured", () => {
    const limiter = createSendRateLimiter({ upstash: undefined });

    expect(limiter.kind).toBe("memory");
  });

  it("lets the first send through without waiting", async () => {
    const time = createFakeTime();
    const limiter = createSendRateLimiter({ upstash: undefined, ...time });

    await limiter.acquire();

    expect(time.slept).toEqual([]);
  });

  it("spaces the second send rather than refusing it", async () => {
    const time = createFakeTime();
    const limiter = createSendRateLimiter({ upstash: undefined, ...time });

    await limiter.acquire();
    await limiter.acquire();

    expect(time.slept).toHaveLength(1);
    expect(time.slept[0]).toBeGreaterThan(0);
  });

  it("holds a burst of ten under two a second", async () => {
    const time = createFakeTime();
    const limiter = createSendRateLimiter({ upstash: undefined, ...time });

    const startedAt = time.now();
    for (let index = 0; index < 10; index += 1) {
      await limiter.acquire();
    }

    // Nine gaps between ten sends, and the whole burst may not fit into the
    // window that two a second would allow for ten.
    const elapsed = time.now() - startedAt;
    expect(elapsed).toBeGreaterThanOrEqual(9 * 500);
  });

  it("stops waiting once the gap has already passed", async () => {
    const time = createFakeTime();
    const limiter = createSendRateLimiter({ upstash: undefined, ...time });

    await limiter.acquire();
    await time.sleep(5_000);
    time.slept.length = 0;
    await limiter.acquire();

    expect(time.slept).toEqual([]);
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `pnpm --filter @memory-shoebox/server test test/mail/EmailService/createSendRateLimiter.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 4: Write the limiter**

Create `apps/server/src/mail/EmailService/createSendRateLimiter.ts`:

```ts
/**
 * How many sends a second the provider is asked for.
 *
 * Resend allows two. Asking for 1.7 leaves slack for a clock that disagrees
 * with theirs and for a retry that arrives beside a fresh send.
 */
const SENDS_PER_SECOND = 1.7;

/** The gap the in-memory window keeps between one send and the next. */
const MINIMUM_SEND_GAP_MS = Math.ceil(1000 / SENDS_PER_SECOND);

/** How long to wait when Upstash refuses without saying when to return. */
const UNKNOWN_RESET_WAIT_MS = 500;

/** Upstash's credentials, when the instance has them. */
export type UpstashCredentials = {
  restUrl: string;
  restToken: string;
};

/** Waits for a slot before a message is handed to the provider. */
export type SendRateLimiter = {
  /** Resolves when the caller may send. Never rejects. */
  acquire: () => Promise<void>;
  /** Which store is enforcing the window, for the health surface. */
  readonly kind: "upstash" | "memory";
};

/** Timing, injectable so a test needs no real clock and no real waiting. */
type LimiterTime = {
  now: () => number;
  sleep: (milliseconds: number) => Promise<void>;
};

/**
 * The window held in this process.
 *
 * It reserves the next slot as it hands one out, so concurrent callers queue
 * behind each other rather than all reading the same "now" and agreeing they
 * may go. A single Fly machine running one queue worker is the case this
 * handles exactly.
 */
function _createMemoryRateLimiter(time: LimiterTime): SendRateLimiter {
  let nextSlotAtMs = 0;

  return {
    kind: "memory",
    acquire: async () => {
      const nowMs = time.now();
      const waitMs = Math.max(nextSlotAtMs - nowMs, 0);
      nextSlotAtMs = Math.max(nextSlotAtMs, nowMs) + MINIMUM_SEND_GAP_MS;
      if (waitMs > 0) {
        await time.sleep(waitMs);
      }
    },
  };
}

/**
 * The window held in Upstash, shared by everything using the same API key.
 *
 * The limit belongs to the key rather than to the process, so a script run
 * beside the server draws on the same budget. That is the whole reason this
 * option exists; the in-memory window cannot see it.
 *
 * It waits for a slot rather than refusing, because the caller is a queue
 * worker with a message in hand and nowhere else to put it.
 */
function _createUpstashRateLimiter(options: {
  credentials: UpstashCredentials;
  time: LimiterTime;
}): SendRateLimiter {
  const { credentials, time } = options;
  // Imported lazily so an instance with no Upstash never loads the client.
  const limiterPromise = (async () => {
    const [{ Ratelimit }, { Redis }] = await Promise.all([
      import("@upstash/ratelimit"),
      import("@upstash/redis"),
    ]);
    return new Ratelimit({
      redis: new Redis({
        url: credentials.restUrl,
        token: credentials.restToken,
      }),
      limiter: Ratelimit.slidingWindow(SENDS_PER_SECOND, "1 s"),
      // Namespaced because two deployments may share one API key, and so one
      // budget.
      prefix: "memory-shoebox:resend",
    });
  })();

  return {
    kind: "upstash",
    acquire: async () => {
      const limiter = await limiterPromise;
      // Loops rather than returning a refusal: `reset` says when the next
      // token appears, so the wait is exact rather than a guess, and the loop
      // passes straight through when nothing is limiting.
      for (;;) {
        const { success, reset } = await limiter.limit("global");
        if (success) {
          return;
        }
        const waitMs =
          typeof reset === "number"
            ? Math.max(reset - time.now(), 100)
            : UNKNOWN_RESET_WAIT_MS;
        await time.sleep(waitMs);
      }
    },
  };
}

/**
 * Builds the limiter every send passes through.
 *
 * **Upstash when it is configured, and the same window in memory when it is
 * not.** Avandar's equivalent throws when the Upstash variables are missing;
 * this one cannot, because `docs/architecture.md` requires an instance to boot
 * and serve with no mail configured at all. Both branches are real limiting:
 * the difference is whether the budget is shared outside this process.
 *
 * @param options.upstash The credentials, or undefined.
 * @param options.now Overridable so a test needs no real clock.
 * @param options.sleep Overridable so a test needs no real waiting.
 */
export function createSendRateLimiter(options: {
  upstash: UpstashCredentials | undefined;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}): SendRateLimiter {
  const time: LimiterTime = {
    now:
      options.now ??
      (() => {
        return Date.now();
      }),
    sleep:
      options.sleep ??
      ((milliseconds) => {
        return new Promise((resolve) => {
          setTimeout(resolve, milliseconds);
        });
      }),
  };

  return options.upstash === undefined
    ? _createMemoryRateLimiter(time)
    : _createUpstashRateLimiter({ credentials: options.upstash, time });
}
```

- [ ] **Step 5: Run the test**

Run: `pnpm --filter @memory-shoebox/server test test/mail/EmailService/createSendRateLimiter.test.ts`
Expected: PASS, five cases.

- [ ] **Step 6: Commit**

```bash
git add apps/server package.json pnpm-lock.yaml
git commit -m "feat(server): a send budget, shared when it can be"
```

---

## Task 7: Resend, behind the limiter

**Files:**

- Modify: `apps/server/src/mail/EmailService/createResendEmailService.ts`
- Test: `apps/server/test/mail/EmailService/createResendEmailService.test.ts`

The file already exists from Task 1 and already handles a rejection and an
error response. It gains two things: it waits for a slot before calling, and it
treats the provider's own rate-limit refusal as a reason to wait rather than as
a failed attempt.

That distinction matters to the queue. `outbound_emails.attempts` is the
retry budget, and five of them is the whole schedule; a 429 is not the message
failing, it is us asking too fast, so spending an attempt on it would retire a
message that nothing is wrong with.

- [ ] **Step 1: Write the failing test**

Create `apps/server/test/mail/EmailService/createResendEmailService.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createResendEmailService } from "../../../src/mail/EmailService/createResendEmailService.ts";
import { MailSendError } from "../../../src/mail/MailSendError.ts";
import type { EmailSendRequest } from "../../../src/mail/EmailService/EmailService.types.ts";
import type { SendRateLimiter } from "../../../src/mail/EmailService/createSendRateLimiter.ts";

const REQUEST: EmailSendRequest = {
  from: "My Shoebox <shoebox@example.com>",
  to: "rosa@example.com",
  subject: "Your code is 410233",
  html: "<p>410233</p>",
  text: "410233",
  idempotencyKey: "signin:0192f2a0-7d3c-7000-8000-000000000001",
};

/** A limiter that counts how often a slot was asked for. */
function createCountingLimiter(): SendRateLimiter & { acquired: number } {
  const limiter = {
    kind: "memory" as const,
    acquired: 0,
    acquire: () => {
      limiter.acquired += 1;
      return Promise.resolve();
    },
  };
  return limiter;
}

describe("createResendEmailService", () => {
  it("waits for a slot before it calls the provider", async () => {
    const limiter = createCountingLimiter();
    const calls: unknown[] = [];
    const service = createResendEmailService({
      apiKey: "not-a-key",
      limiter,
      emails: {
        send: (payload) => {
          calls.push(payload);
          expect(limiter.acquired).toBe(1);
          return Promise.resolve({ data: { id: "provider-1" } });
        },
      },
    });

    const result = await service.send(REQUEST);

    expect(result.providerMessageId).toBe("provider-1");
    expect(calls).toHaveLength(1);
  });

  it("passes the row's idempotency key to the provider", async () => {
    let seenKey: string | undefined;
    const service = createResendEmailService({
      apiKey: "not-a-key",
      limiter: createCountingLimiter(),
      emails: {
        send: (_payload, options) => {
          seenKey = options.idempotencyKey;
          return Promise.resolve({ data: { id: "provider-1" } });
        },
      },
    });

    await service.send(REQUEST);

    expect(seenKey).toBe(REQUEST.idempotencyKey);
  });

  it("waits and retries when the provider says we are going too fast", async () => {
    const limiter = createCountingLimiter();
    let attempts = 0;
    const service = createResendEmailService({
      apiKey: "not-a-key",
      limiter,
      emails: {
        send: () => {
          attempts += 1;
          return attempts === 1
            ? Promise.resolve({
                error: { name: "rate_limit_exceeded", message: "too fast" },
              })
            : Promise.resolve({ data: { id: "provider-2" } });
        },
      },
    });

    const result = await service.send(REQUEST);

    expect(result.providerMessageId).toBe("provider-2");
    expect(attempts).toBe(2);
    // A fresh slot for the retry, rather than going straight back.
    expect(limiter.acquired).toBe(2);
  });

  it("gives up on a rate limit that will not clear", async () => {
    const service = createResendEmailService({
      apiKey: "not-a-key",
      limiter: createCountingLimiter(),
      emails: {
        send: () => {
          return Promise.resolve({
            error: { name: "rate_limit_exceeded", message: "too fast" },
          });
        },
      },
    });

    await expect(service.send(REQUEST)).rejects.toBeInstanceOf(MailSendError);
  });

  it("does not retry an error that is not a rate limit", async () => {
    let attempts = 0;
    const service = createResendEmailService({
      apiKey: "not-a-key",
      limiter: createCountingLimiter(),
      emails: {
        send: () => {
          attempts += 1;
          return Promise.resolve({
            error: { name: "validation_error", message: "bad address" },
          });
        },
      },
    });

    await expect(service.send(REQUEST)).rejects.toBeInstanceOf(MailSendError);
    expect(attempts).toBe(1);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @memory-shoebox/server test test/mail/EmailService/createResendEmailService.test.ts`
Expected: FAIL, `limiter` is not a known option.

- [ ] **Step 3: Add the limiter and the retry**

In `apps/server/src/mail/EmailService/createResendEmailService.ts`:

Add a constant and a predicate above the factory:

```ts
/**
 * How many times one message may meet a rate limit before it is given up on.
 *
 * A rate limit is not the message failing, so it does not spend one of the
 * row's five attempts. It still needs a ceiling, or a provider stuck on 429
 * would hold the worker forever and every other queued message behind it.
 */
const RATE_LIMIT_ATTEMPTS = 3;

/** Whether the provider refused because we are sending too fast. */
function _isRateLimited(error: {
  name?: string;
  statusCode?: number;
}): boolean {
  return error.name === "rate_limit_exceeded" || error.statusCode === 429;
}
```

Widen `ResendEmailsApi`'s error shape to carry the status the SDK may send:

```ts
  ) => Promise<{
    data?: { id: string } | null;
    error?: { name?: string; message: string; statusCode?: number } | null;
  }>;
```

Add `limiter` to the factory's options and its docstring, then wrap the body of
`send` in the attempt loop. The existing call, its `try`, and both
`MailSendError` throws stay exactly as they are; what is new is the
`await options.limiter.acquire()` before each attempt and the branch that
continues instead of throwing:

```ts
    send: async (request) => {
      for (let attempt = 1; ; attempt += 1) {
        await options.limiter.acquire();

        // The call is wrapped rather than assigned out of a `try`, so the
        // response is a `const` and its type comes from the call rather than
        // from an annotation written only because the assignment was deferred.
        const response = await (async () => {
          try {
            return await emails.send(
              {
                from: request.from,
                to: [request.to],
                subject: request.subject,
                html: request.html,
                text: request.text,
              },
              { idempotencyKey: request.idempotencyKey },
            );
          } catch (error: unknown) {
            throw new MailSendError({
              code: "provider_unreachable",
              message: error instanceof Error ? error.message : String(error),
            });
          }
        })();

        // Nullish rather than `!== null`: the SDK's declared shape is one of
        // the two fields, but a response carrying neither must not crash the
        // worker on a property read. Such a response falls through as an
        // acceptance with no id, which is what an undefined
        // `providerMessageId` is for.
        const error = response.error ?? undefined;
        if (error === undefined) {
          return { providerMessageId: response.data?.id };
        }

        // Going too fast is our problem rather than the message's, so it buys
        // another slot instead of spending one of the row's attempts.
        if (_isRateLimited(error) && attempt < RATE_LIMIT_ATTEMPTS) {
          continue;
        }

        throw new MailSendError({
          code: error.name ?? "provider_rejected",
          message: error.message,
        });
      }
    },
```

- [ ] **Step 4: Run the test**

Run: `pnpm --filter @memory-shoebox/server test test/mail/EmailService/createResendEmailService.test.ts`
Expected: PASS, five cases.

- [ ] **Step 5: Commit**

```bash
git add apps/server
git commit -m "feat(server): a rate limit is not the message failing"
```

---

## Task 8: The fake, which writes a PDF

**Files:**

- Create: `apps/server/src/mail/EmailService/createFakeEmailService.ts`
- Test: `apps/server/test/mail/EmailService/createFakeEmailService.test.ts`
- Modify: `apps/server/package.json`, root `package.json`

The point of this is that its caller cannot tell. It takes the same request,
returns the same shape, and reports success, so the row goes `sent` exactly as
it would have. What it does in between is render the message in a browser and
write a PDF where a developer will find it.

- [ ] **Step 1: Add Playwright**

Add to `apps/server/package.json`'s `devDependencies`:

```json
"playwright": "^1.50.0",
```

It is a dev dependency on purpose: the fake is the only thing that loads it,
the fake never runs in production, and the production image installs with
`--prod`.

```sh
pnpm install
npx playwright install chromium
```

The second command downloads the browser. Add it to the repository's setup
instructions in Task 11; a developer who has not run it gets a skipped test
rather than a mysterious failure.

- [ ] **Step 2: Write the failing test**

Create `apps/server/test/mail/EmailService/createFakeEmailService.test.ts`:

```ts
import { mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFakeEmailService,
  makeEmailFileName,
} from "../../../src/mail/EmailService/createFakeEmailService.ts";
import type { EmailSendRequest } from "../../../src/mail/EmailService/EmailService.types.ts";

const REQUEST: EmailSendRequest = {
  from: "My Shoebox <shoebox@example.com>",
  to: "abuela@example.com",
  subject: "Your code is 410233",
  html: "<p>410233</p>",
  text: "410233",
  idempotencyKey: "signin:0192f2a0-7d3c-7000-8000-000000000001",
};

/** Whether the browser the fake needs has been downloaded. */
async function hasChromium(): Promise<boolean> {
  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch();
    await browser.close();
    return true;
  } catch {
    return false;
  }
}

describe("makeEmailFileName", () => {
  it("names the file for when it arrived and who it was for", () => {
    const name = makeEmailFileName({
      request: REQUEST,
      now: new Date("2026-09-28T12:34:56.000Z"),
    });

    expect(name).toBe("2026-09-28T12-34-56-000Z__abuela-at-example-com.pdf");
  });

  it("keeps an awkward address out of the filesystem's way", () => {
    const name = makeEmailFileName({
      request: { ...REQUEST, to: "A.Person+tag@Example.COM" },
      now: new Date("2026-09-28T12:34:56.000Z"),
    });

    expect(name).not.toContain("+");
    expect(name).not.toContain("/");
    expect(name).toMatch(/^[\w.@+-]+\.pdf$/);
  });
});

describe("createFakeEmailService", () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "shoebox-fake-email-"));
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it("writes a PDF and reports the message as accepted", async ({ skip }) => {
    if (!(await hasChromium())) {
      skip("chromium is not installed: run `npx playwright install chromium`");
    }
    const service = createFakeEmailService({ outputDirectory: directory });

    const result = await service.send(REQUEST);

    const written = readdirSync(directory);
    expect(written).toHaveLength(1);
    expect(written[0]).toMatch(/\.pdf$/);
    expect(statSync(join(directory, written[0] ?? "")).size).toBeGreaterThan(
      1000,
    );
    expect(result.providerMessageId).toContain("fake-pdf");
  }, 60_000);

  it("creates the directory when it is not there yet", async ({ skip }) => {
    if (!(await hasChromium())) {
      skip("chromium is not installed: run `npx playwright install chromium`");
    }
    const nested = join(directory, "not", "yet", "there");
    const service = createFakeEmailService({ outputDirectory: nested });

    await service.send(REQUEST);

    expect(readdirSync(nested)).toHaveLength(1);
  }, 60_000);
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `pnpm --filter @memory-shoebox/server test test/mail/EmailService/createFakeEmailService.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 4: Write the fake**

Create `apps/server/src/mail/EmailService/createFakeEmailService.ts`:

```ts
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { EmailSendRequest, EmailService } from "./EmailService.types.ts";

/**
 * Turns an address into something a filesystem is comfortable with.
 *
 * The address is in the name because a run of several messages is easier to
 * read as a file listing than by opening each one.
 */
function _slugifyAddress(address: string): string {
  return address
    .toLowerCase()
    .replace(/@/g, "-at-")
    .replace(/[^a-z0-9.-]+/g, "-");
}

/**
 * What one message is called on disk.
 *
 * Exported so it can be tested without a browser, which is most of what there
 * is to get wrong here.
 *
 * @param options.request The message about to be written.
 * @param options.now When it was written.
 */
export function makeEmailFileName(options: {
  request: EmailSendRequest;
  now: Date;
}): string {
  const instant = options.now.toISOString().replace(/[:.]/g, "-");
  return `${instant}__${_slugifyAddress(options.request.to)}.pdf`;
}

/**
 * The envelope a mail client would draw around the message.
 *
 * The rendered HTML is the body of a message and carries no addressing, so a
 * PDF of it alone would not show who it was for or what the subject was, which
 * for `sign_in_code` is where the code actually is.
 */
function _wrapInEnvelope(request: EmailSendRequest): string {
  const rows = [
    ["From", request.from],
    ["To", request.to],
    ["Subject", request.subject],
  ];
  const header = rows
    .map(([label, value]) => {
      return `<tr><td style="padding:2px 12px 2px 0;color:#4a4a4a;">${label}</td><td style="padding:2px 0;">${value ?? ""}</td></tr>`;
    })
    .join("");

  return [
    `<!doctype html><html><head><meta charset="utf-8" /></head><body style="margin:0;">`,
    `<div style="padding:16px 24px;border-bottom:1px solid #cccccc;font-family:Arial,Helvetica,sans-serif;font-size:13px;">`,
    `<table style="border-collapse:collapse;">${header}</table>`,
    `<p style="margin:12px 0 0;color:#8a8a8a;">Written by Memory Shoebox in fake email mode. Nothing was sent.</p>`,
    `</div>`,
    request.html,
    `</body></html>`,
  ].join("");
}

/**
 * Builds the service that writes a PDF instead of sending.
 *
 * **Its caller cannot tell.** It takes the same request, returns the same
 * shape, and reports acceptance, so the row goes `sent` exactly as it would
 * have. That is the point: the path exercised in development is the path that
 * runs in production, up to the last step.
 *
 * Playwright is imported inside `send` rather than at the top of the file, so
 * an instance that never fakes never loads it and the browser stays a
 * development concern.
 *
 * @param options.outputDirectory Where the PDFs are written. Created if absent.
 * @param options.now Overridable so a test can name a file predictably.
 */
export function createFakeEmailService(options: {
  outputDirectory: string;
  now?: () => Date;
}): EmailService {
  const now =
    options.now ??
    (() => {
      return new Date();
    });

  return {
    send: async (request) => {
      const { chromium } = await import("playwright");
      await mkdir(options.outputDirectory, { recursive: true });

      const fileName = makeEmailFileName({ request, now: now() });
      const browser = await chromium.launch();
      try {
        const page = await browser.newPage();
        await page.setContent(_wrapInEnvelope(request), {
          waitUntil: "load",
        });
        await page.pdf({
          path: join(options.outputDirectory, fileName),
          format: "A4",
          printBackground: true,
        });
      } finally {
        await browser.close();
      }

      // A synthetic id, in the shape the provider's would take, so the row
      // records something that says where the message actually went.
      return { providerMessageId: `fake-pdf:${fileName}` };
    },
  };
}
```

- [ ] **Step 5: Run the test**

Run: `pnpm --filter @memory-shoebox/server test test/mail/EmailService/createFakeEmailService.test.ts`
Expected: PASS, four cases. If the two browser cases skip, chromium is not
installed; run `npx playwright install chromium` and run them again. **Do not
leave this task with those two skipped**: they are the only proof the PDF is
produced at all.

- [ ] **Step 6: Commit**

```bash
git add apps/server package.json pnpm-lock.yaml
git commit -m "feat(server): the fake writes a PDF and says nothing went wrong"
```

---

## Task 9: The choice, and the three variables behind it

**Files:**

- Modify: `apps/server/src/config.ts`
- Create: `apps/server/src/mail/EmailService/createEmailService.ts`
- Modify: `apps/server/.env.example`
- Test: `apps/server/test/config.test.ts` (exists; add to it)
- Test: `apps/server/test/mail/EmailService/createEmailService.test.ts`

Everything so far has been an implementation. This is the rule that picks one.

- [ ] **Step 1: Write the failing config test**

Append to `apps/server/test/config.test.ts`, reusing the existing `validEnv()`
helper rather than adding a second one:

```ts
describe("the email variables", () => {
  it("leaves fake email off when nothing says otherwise", () => {
    expect(parseConfig(validEnv()).enableFakeEmail).toBe(false);
  });

  it("reads fake email as on only for the exact string", () => {
    expect(
      parseConfig({ ...validEnv(), ENABLE_FAKE_EMAIL: "true" }).enableFakeEmail,
    ).toBe(true);
    expect(
      parseConfig({ ...validEnv(), ENABLE_FAKE_EMAIL: "1" }).enableFakeEmail,
    ).toBe(false);
  });

  it("treats an unfilled Upstash variable as absent, not as empty", () => {
    const config = parseConfig({
      ...validEnv(),
      UPSTASH_REDIS_REST_URL: "",
      UPSTASH_REDIS_REST_TOKEN: "",
    });

    expect(config.upstashRedisRestUrl).toBeUndefined();
    expect(config.upstashRedisRestToken).toBeUndefined();
  });

  it("reads the Upstash credentials when they are filled in", () => {
    const config = parseConfig({
      ...validEnv(),
      UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
      UPSTASH_REDIS_REST_TOKEN: "a-token",
    });

    expect(config.upstashRedisRestUrl).toBe("https://example.upstash.io");
    expect(config.upstashRedisRestToken).toBe("a-token");
  });
});
```

- [ ] **Step 2: Add the three variables**

In `apps/server/src/config.ts`:

A copied `.env.example` leaves a variable unfilled, and Node reads that as `""`
rather than as absent. `RESEND_API_KEY` already carries an inline transform for
that; there are three of them now, so lift it out rather than writing it three
times:

```ts
/**
 * An unfilled variable is absent, not empty.
 *
 * A copied `.env.example` leaves `NAME=` behind, which Node reads as `""`. That
 * means "not set yet" rather than "set to nothing", and every optional
 * variable here wants the same reading.
 */
function _emptyToUndefined(value: string | undefined): string | undefined {
  return value === "" ? undefined : value;
}
```

Use it for `RESEND_API_KEY` in place of its inline transform, and add the three
new entries to `environmentSchema`:

```ts
  // Fake email is off unless the variable says exactly "true". Anything else,
  // including "1" and "yes", leaves it off: this decides whether real mail
  // goes out, so it is not the place for a generous reading.
  ENABLE_FAKE_EMAIL: z
    .string()
    .optional()
    .transform((value) => {
      return value === "true";
    }),
  UPSTASH_REDIS_REST_URL: z.string().optional().transform(_emptyToUndefined),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional().transform(_emptyToUndefined),
```

Add the three fields to the `Config` type with docstrings:

```ts
/**
 * Whether a message is written as a PDF instead of sent.
 *
 * Honoured only outside production: see `getEmailServiceKind`.
 */
enableFakeEmail: boolean;
/** Upstash's REST endpoint, which rate limits sends across processes. */
upstashRedisRestUrl: string | undefined;
/** The token for that endpoint. */
upstashRedisRestToken: string | undefined;
```

and to the returned object.

- [ ] **Step 3: Run the config test**

Run: `pnpm --filter @memory-shoebox/server test test/config.test.ts`
Expected: PASS.

- [ ] **Step 4: Write the failing factory test**

Create `apps/server/test/mail/EmailService/createEmailService.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getEmailServiceKind } from "../../../src/mail/EmailService/createEmailService.ts";
import { createTestConfig } from "../../helpers/createTestConfig.ts";

describe("getEmailServiceKind", () => {
  it("sends nothing when nothing is configured", () => {
    expect(getEmailServiceKind(createTestConfig())).toBe("none");
  });

  it("uses the provider when a key is set", () => {
    const config = createTestConfig({ RESEND_API_KEY: "re_test" });

    expect(getEmailServiceKind(config)).toBe("resend");
  });

  it("fakes when asked to, outside production", () => {
    const config = createTestConfig({
      ENABLE_FAKE_EMAIL: "true",
      RESEND_API_KEY: "re_test",
    });

    expect(getEmailServiceKind(config)).toBe("fake");
  });

  it("fakes even with no provider key, since nothing is sent", () => {
    const config = createTestConfig({ ENABLE_FAKE_EMAIL: "true" });

    expect(getEmailServiceKind(config)).toBe("fake");
  });

  it("refuses to fake in production, however the flag is set", () => {
    const config = createTestConfig({
      NODE_ENV: "production",
      ENABLE_FAKE_EMAIL: "true",
      RESEND_API_KEY: "re_test",
    });

    expect(getEmailServiceKind(config)).toBe("resend");
  });

  it("sends nothing in production with the flag on and no key", () => {
    const config = createTestConfig({
      NODE_ENV: "production",
      ENABLE_FAKE_EMAIL: "true",
    });

    expect(getEmailServiceKind(config)).toBe("none");
  });
});
```

- [ ] **Step 5: Run it and watch it fail**

Run: `pnpm --filter @memory-shoebox/server test test/mail/EmailService/createEmailService.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 6: Write the factory**

Create `apps/server/src/mail/EmailService/createEmailService.ts`:

```ts
import { homedir } from "node:os";
import { join } from "node:path";
import { createFakeEmailService } from "./createFakeEmailService.ts";
import { createResendEmailService } from "./createResendEmailService.ts";
import { createSendRateLimiter } from "./createSendRateLimiter.ts";
import type { Config } from "../../config.ts";
import type { EmailService } from "./EmailService.types.ts";

/** Where a developer finds the messages this instance did not send. */
const FAKE_EMAIL_DIRECTORY = join(
  homedir(),
  "Downloads",
  "memory-shoebox-emails",
);

/** Which of the three ways to treat a message this instance is using. */
export type EmailServiceKind = "fake" | "resend" | "none";

/**
 * Decides how this instance treats a message.
 *
 * **Faking needs two conditions, and one of them cannot be set by mistake.**
 * `ENABLE_FAKE_EMAIL` says what the developer wants; `NODE_ENV` says whether
 * they may have it. The asymmetry is deliberate: a production instance quietly
 * writing PDFs instead of sending would look exactly like a working instance
 * to everybody except the person waiting for a code, so the guard holds even
 * when the flag is set on a server by accident.
 *
 * `none` is a state this product runs in perfectly well: mail waits. A fresh
 * instance has no key, because an admin has to reach the settings surface to
 * configure mail at all.
 */
export function getEmailServiceKind(config: Config): EmailServiceKind {
  if (config.enableFakeEmail && !config.isProduction) {
    return "fake";
  }
  return config.resendApiKey === undefined ? "none" : "resend";
}

/**
 * Builds the service this instance sends through, or nothing.
 *
 * @param options.config The parsed environment.
 * @param options.fakeOutputDirectory Overridable so a test writes to a
 *   temporary directory rather than to somebody's Downloads folder.
 * @returns The service, or undefined when this instance sends nothing.
 */
export function createEmailService(options: {
  config: Config;
  fakeOutputDirectory?: string;
}): EmailService | undefined {
  const { config } = options;

  switch (getEmailServiceKind(config)) {
    case "fake":
      return createFakeEmailService({
        outputDirectory: options.fakeOutputDirectory ?? FAKE_EMAIL_DIRECTORY,
      });

    case "resend":
      return createResendEmailService({
        // Narrowed by `getEmailServiceKind`, which returns `resend` only when
        // the key is set.
        apiKey: config.resendApiKey ?? "",
        limiter: createSendRateLimiter({
          upstash:
            config.upstashRedisRestUrl === undefined ||
            config.upstashRedisRestToken === undefined
              ? undefined
              : {
                  restUrl: config.upstashRedisRestUrl,
                  restToken: config.upstashRedisRestToken,
                },
        }),
      });

    case "none":
      return undefined;
  }
}
```

- [ ] **Step 7: Run the test**

Run: `pnpm --filter @memory-shoebox/server test test/mail/EmailService/createEmailService.test.ts`
Expected: PASS, six cases.

- [ ] **Step 8: Document the variables where somebody will fill them in**

In `apps/server/.env.example`, after the Resend block:

```
# --- Local email (development only) --------------------------------------
# Write every message as a PDF in ~/Downloads/memory-shoebox-emails instead of
# sending it. The whole path runs as it would in production, including the
# rendering and the queue, and only the last step changes, so the PDF is the
# message somebody would have received.
#
# Ignored when NODE_ENV=production, whatever this says.
# Needs a browser: run `npx playwright install chromium` once.
ENABLE_FAKE_EMAIL=

# --- Upstash (rate limiting) ---------------------------------------------
# Resend allows two requests a second, and that budget belongs to the API key
# rather than to this process, so a script running beside the server spends
# from the same one. With these set, the limit is enforced across everything
# using the key. Without them the same window is enforced in memory, which is
# correct for a single machine and is what a self-hoster will run.
#
# Create a Redis database at https://upstash.com and copy the REST URL and
# token from its console.
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

- [ ] **Step 9: Commit**

```bash
git add apps/server
git commit -m "feat(server): which way a message goes, and the guard on it"
```

---

## Task 10: Wire it in, and prove it end to end

**Files:**

- Modify: `apps/server/src/app.ts`
- Test: `apps/server/test/mail/fakeEmailDelivery.test.ts`

- [ ] **Step 1: Write the failing integration test**

This is the test that matters most in the whole plan: it drives the real queue
with the real fake service and asserts a PDF appears. Create
`apps/server/test/mail/fakeEmailDelivery.test.ts`:

```ts
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createEmailService } from "../../src/mail/EmailService/createEmailService.ts";
import { enqueueEmail } from "../../src/mail/enqueueEmail.ts";
import { runMailQueueOnce } from "../../src/mail/runMailQueueOnce.ts";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { createTestConfig } from "../helpers/createTestConfig.ts";
import {
  NOW,
  insertInstanceSetting,
} from "../helpers/seedHelpers/seedHelpers.ts";
import type { Kysely } from "kysely";
import type { Database } from "../../src/db/types/db.types.ts";

/** Whether the browser the fake needs has been downloaded. */
async function hasChromium(): Promise<boolean> {
  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch();
    await browser.close();
    return true;
  } catch {
    return false;
  }
}

describe("a message sent in fake email mode", () => {
  let database: Kysely<Database>;
  let directory: string;

  beforeEach(async () => {
    database = createDatabase(":memory:");
    await migrateToLatest(database);
    directory = mkdtempSync(join(tmpdir(), "shoebox-fake-delivery-"));
    // Three settings, each for its own reason. Without an absolute base URL
    // the enqueue writes the row `failed` and scrubs the digits, so there
    // would be nothing to deliver. Without a sending identity the worker
    // defers the row instead of sending it, because the instance is not
    // configured to send yet, and the test would pass its assertions about
    // nothing.
    await insertInstanceSetting(database, {
      key: "public.base_url",
      value: "https://shoebox.example",
    });
    await insertInstanceSetting(database, {
      key: "mail.from_address",
      value: "shoebox@example.com",
    });
    await insertInstanceSetting(database, {
      key: "mail.from_name",
      value: "My Shoebox",
    });
  });

  afterEach(async () => {
    rmSync(directory, { recursive: true, force: true });
    await database.destroy();
  });

  it("reaches a PDF, and the row says it was sent", async ({ skip }) => {
    if (!(await hasChromium())) {
      skip("chromium is not installed: run `npx playwright install chromium`");
    }
    const service = createEmailService({
      config: createTestConfig({ ENABLE_FAKE_EMAIL: "true" }),
      fakeOutputDirectory: directory,
    });
    expect(service).toBeDefined();

    await enqueueEmail({
      executor: database,
      input: {
        kind: "sign_in_code",
        toAddress: "abuela@example.com",
        toMemberId: undefined,
        toDisplayName: "Abuela Rosa",
        idempotencyKey: "signin:one",
        payload: {
          code: "410233",
          expiresAt: NOW,
          expiresInMinutes: 10,
        },
        triggerKind: "sign_in_code",
        triggerId: "one",
      },
      now: NOW,
    });

    const summary = await runMailQueueOnce({
      database,
      sender: service,
      now: NOW,
    });

    // `deferredCount` is the one to watch: a row the worker put back because
    // the instance is not configured to send is not a failure, and it is what
    // this test would otherwise quietly be asserting nothing about.
    expect(summary).toMatchObject({ sentCount: 1, deferredCount: 0 });
    expect(readdirSync(directory)).toHaveLength(1);

    const row = await database
      .selectFrom("outbound_emails")
      .select(["state", "provider_message_id"])
      .executeTakeFirstOrThrow();
    expect(row.state).toBe("sent");
    expect(row.provider_message_id).toContain("fake-pdf");
  }, 60_000);
});
```

The call matches `MailQueueRunOptions` as it stands: `database`, `sender`,
`now`, and an optional `batchSize`. There is no `fromAddress` parameter,
because the worker reads the sending identity from the `mail.from_address` and
`mail.from_name` settings, which is why the fixture writes them.

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @memory-shoebox/server test test/mail/fakeEmailDelivery.test.ts`
Expected: FAIL, `createEmailService` cannot be found, or the call signatures
disagree. Fix the signatures, not the intent.

- [ ] **Step 3: Use the factory in the application**

In `apps/server/src/app.ts`, replace the body of `_buildEmailService` (renamed
in Task 1) so that it defers to the factory instead of building Resend itself:

```ts
/**
 * The service this instance sends through, or undefined when it sends nothing.
 *
 * A missing key is not a refusal to start. `docs/architecture.md` requires an
 * existing session to survive a mail outage, and an admin cannot configure mail
 * without first reaching the settings surface, so an unconfigured instance
 * boots with no service and the worker defers what is queued.
 *
 * Three states, and the field keeps telling them apart. Omitting it means
 * "decide from the environment", a service means "use this one", and `"none"`
 * means "deliberately do not send".
 */
function _buildEmailService(deps: AppDeps): EmailService | undefined {
  if (deps.emailService === "none") {
    return undefined;
  }
  if (deps.emailService !== undefined) {
    return deps.emailService;
  }
  return createEmailService({ config: deps.config });
}
```

Then log the choice once at boot, after the decoration, so an instance says out
loud which way its mail is going:

```ts
app.log.info(
  { emailService: getEmailServiceKind(deps.config) },
  "email delivery",
);
```

- [ ] **Step 4: Run the whole server suite**

```sh
pnpm --filter @memory-shoebox/emails build
pnpm --filter @memory-shoebox/server test
pnpm --filter @memory-shoebox/server exec tsc --noEmit
npx oxlint apps/server
npx oxfmt --check .
```

Expected: PASS. Tests that pass their own `emailService` are unaffected, and
tests that pass nothing still get no service, because `createTestConfig`
carries no Resend key and does not enable the fake.

- [ ] **Step 5: Commit**

```bash
git add apps/server
git commit -m "feat(server): the application picks a way to deliver"
```

---

## Task 11: Documentation

**Files:**

- Create: `docs/emails.md`
- Modify: `docs/mail.md`, `docs/README.md`, `docs/architecture.md`, `AGENTS.md`, `README.md`

`AGENTS.md` is explicit that this is part of the change rather than an
afterthought. Read `docs/mail.md` fully before editing it: it is the best
existing example of this repository's voice, and most of it is still true.

- [ ] **Step 1: Write `docs/emails.md`**

A new file covering the package, in the house voice: high level, says why a
decision went the way it did, does not restate code. It must carry:

- **Why the package compiles when nothing else here does.** JSX is not erasable
  syntax, Node's type stripping does not transform it, and `apps/server` runs
  its TypeScript unmodified. Include the one-line reproduction, because the
  next person will otherwise try to put a `.tsx` file in the server.
- **The extension rule reverses here.** `.oxlintrc.json` requires `.ts` on
  relative imports under `apps/server` and `packages/shared`, and forbids it
  everywhere else, so this package writes extensionless imports.
- **What a template is:** an object with a synchronous `subject` and an
  asynchronous `render`, taking the payload and nothing else, because a retry a
  day later has to produce the identical message.
- **How to look at one:** set `ENABLE_FAKE_EMAIL=true`, ask for a sign-in code,
  open the PDF in `~/Downloads/memory-shoebox-emails`.
- **The constraint on the copy:** no design token, no webfont, no layout that
  needs a modern renderer, because a mail client resolves none of them and may
  show the plain-text alternative instead of any of it.
- **Where the plain text comes from:** the same component, rendered again, so
  the two cannot drift.

- [ ] **Step 2: Update `docs/mail.md`**

Four changes:

1. The seam is `EmailService` now, with three implementations rather than one.
   Its section heading § The provider seam, and why no test ever sends still
   holds; the names in it do not.
2. A new section on fake email: what turns it on, the two conditions, what it
   writes and where, and the thing a reader will otherwise be confused by:
   **a faked message is recorded `sent`, with a synthetic provider id.** That is
   deliberate, because the point is that the caller cannot tell, and it means
   `GET /api/mail/health` will look healthy in fake mode. Say so plainly.
3. A new section on rate limiting: the window, why 1.7 against a limit of 2,
   why it waits rather than refusing, and why a provider's 429 does not spend
   one of the row's five attempts.
4. § Rendering takes the payload and nothing else: still true, still the
   invariant, now enforced in a different package. Point at `docs/emails.md`.

- [ ] **Step 3: Update the smaller ones**

- `docs/README.md`: a Map row for `emails.md`, after `mail.md`.
- `docs/architecture.md`: the repository now has a package that compiles, and
  the reason. Its "What is not built yet" section is unaffected.
- `AGENTS.md`: add `packages/emails` to the list of workspace packages with a
  one-line description, and qualify the sentence that says the server has no
  build step: it still does not, and it now imports a package that does.
- `README.md`: whatever setup steps it lists gain
  `npx playwright install chromium`, described as needed only for fake email
  and the end-to-end tests. Read the file first; if it has no setup section,
  put the line where a new contributor will meet it.

- [ ] **Step 4: Format and commit**

```bash
pnpm format
git add docs AGENTS.md README.md
git commit -m "docs: a package that compiles, and mail that sometimes lands in Downloads"
```

---

## Task 12: Verification

**Files:** none, unless the gate finds something.

- [ ] **Step 1: Run the gate**

```sh
pnpm check
```

Expected: green. It runs `pnpm -r build` in dependency order, so the emails
package builds before the server is type-checked against it.

- [ ] **Step 2: Confirm the production image still builds**

The Dockerfile gained a manifest and a build step in Task 2. Nothing else in
this plan touches it, but a broken image is discovered late and painfully:

```sh
docker build -t memory-shoebox-emailcheck .
```

Expected: the build completes. If Docker is not available, say so in your
report rather than skipping quietly, and check by eye that
`packages/emails/package.json` is copied before `pnpm install --frozen-lockfile`
and that the package is built before the `--prod` install prunes.

- [ ] **Step 3: See a real email**

This is the point of the whole plan, and it needs a person to look at it.

```sh
npx playwright install chromium          # once
```

Add `ENABLE_FAKE_EMAIL=true` to `apps/server/.env.local`, then:

```sh
pnpm migrate
sqlite3 ./apps/server/data/memory-shoebox.db \
  "INSERT INTO settings (id,scope,scope_id,key,value,updated_at) VALUES
   (lower(hex(randomblob(16))),'instance',NULL,'public.base_url','\"http://localhost:5173\"',datetime('now'));
   INSERT INTO members (id,email,display_name,role,status,notify_on_upload,notify_on_comment,
     notify_on_reply,notify_on_removal,created_at)
   VALUES (lower(hex(randomblob(16))),'you@example.com','You','admin','invited',1,1,1,1,datetime('now'));"

pnpm dev:server
```

In another terminal:

```sh
curl -s -X POST localhost:8080/api/auth/sign-in-codes \
  -H 'content-type: application/json' -d '{"email":"you@example.com"}'
open ~/Downloads/memory-shoebox-emails
```

Expected: within ten seconds of the request, one PDF appears there, showing the
envelope header and the message with the six digits. The queue polls every ten
seconds, so it is not instant.

Then check the two things this whole design rests on:

- The digits in the PDF are the digits that sign you in. Take them and
  `POST /api/auth/session`, and expect a `201`.
- The row says `sent`:
  `sqlite3 ./apps/server/data/memory-shoebox.db "SELECT state, provider_message_id FROM outbound_emails ORDER BY created_at DESC LIMIT 1;"`

- [ ] **Step 4: Report what you saw**

Say whether the PDF looked like a message somebody would be happy to receive,
because that judgement is the reason for building this and no test makes it.

---

## What this plan deliberately leaves out

| Left out                                                 | Why                                                                                                                                                |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| The six kinds with no copy                               | `invitation`, `upload_session`, `comment` and the three `removal_resolved` outcomes need product copy decisions that belong to steps 5a through 8a |
| react-email's own preview server                         | The PDF is the preview, and the dev server is a second way to look at the same thing                                                               |
| Any end-to-end spec                                      | Playwright is installed and proven here by the PDF writer; the suite is the next plan's                                                            |
| Sending anything from a test                             | The recording double stays the service every test uses, and the fake writes to a temporary directory                                               |
| Changing `MailSendError` or the queue's error vocabulary | Those belong to the queue rather than to the sender, and renaming them would churn the worker                                                      |

## Notes for the reviewer

Three things in this plan are deviations worth checking rather than assuming:

1. **The plain-text masthead changed**, from `MY SHOEBOX` to `My Shoebox`,
   because the text now comes from the same component as the HTML instead of a
   hand-written renderer that uppercased it. One assertion changed with it.
   That is the only behavioural difference in the template port, and restoring
   the uppercase by hand-writing a second text template would reintroduce the
   drift the port removes.
2. **Rendering became asynchronous**, so `EmailRenderer` returns a promise and
   the worker awaits it. If the installed `@react-email/render` turns out to be
   synchronous, Task 2 says to report it: the plan would then be keeping an
   `await` that buys nothing.
3. **A faked message is recorded `sent`.** It is the design's central claim that
   the caller cannot tell, and it does mean the mail health surface looks
   healthy while nothing is being delivered. The documentation says so; decide
   whether that is the trade you want before this merges.
