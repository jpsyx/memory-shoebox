# Email copy (`packages/emails`)

Every message Memory Shoebox sends is a React component in this package,
rendered by react-email into the two forms a mail client picks between. The
package exists because of a constraint that is easy to miss and expensive to
discover: **it is the only package in this repository that compiles**, and it
has to be.

[`mail.md`](mail.md) owns the queue, the worker and the seam a message is
delivered through. This document owns the copy: why it is compiled, why its
imports look unlike every other file here, what a template is, and what a mail
client will and will not do with what comes out.

## Layout

```
packages/emails/
├── package.json                 main and exports point at dist, not src
├── tsconfig.json                type-check only, like its siblings
├── tsconfig.build.json          the one that emits, with jsx: react-jsx
└── src/
    ├── index.ts                 one template object per kind that has copy
    ├── emailTemplate.types.ts   EmailTemplate, RenderedEmail
    ├── lib/
    │   ├── emailTheme.ts        literal hex, a system font stack, the source URL
    │   ├── renderEmail.ts       one element, rendered into both forms
    │   ├── spellSmallNumber.ts  so the copy reads "ten minutes"
    │   └── EmailShell.tsx       masthead, 600px column, footer
    └── templates/
        ├── SignInCodeEmail.tsx  the sign-in code
        └── CommentEmail.tsx     a comment, to its uploader or a prior commenter
```

## Why this package compiles when nothing else here does

`apps/server` runs its TypeScript unmodified: Node strips the type annotations
as it loads a file and transforms nothing else. **JSX is not something that can
be stripped.** `<p>hi</p>` is not an annotation with a runtime value hiding
underneath it, it is syntax that has to be rewritten into a function call, and
Node will not do that for anybody.

The next person to read this will otherwise try putting a `.tsx` file in the
server, so here is the minute that saves:

```sh
printf 'export const x = <p>hi</p>;\n' > probe.ts && node probe.ts
# SyntaxError [ERR_INVALID_TYPESCRIPT_SYNTAX]: Expression expected
```

Naming it `probe.tsx` does not rescue it. Node does not recognise that
extension at all, and says so instead.

So the copy lives in a package with a build step and `apps/server` imports its
`dist/` rather than its `src/`. That is the whole of the exception: `main` and
`exports` point at `dist`, `pnpm dev` and `pnpm dev:server` build this package
before starting the server, and the `Dockerfile` builds it before it builds the
web app. The server itself still has no build step, and the production image
still runs the same files a developer does.

The cost is that build step. What it buys is one source for both forms of every
message. The alternative, and what this replaced, was string templates: hand
written table markup beside a hand written plain-text version, two of them per
kind and seven kinds to come. Those drift, and the plain-text one drifts
silently, because almost nobody reviewing a change opens it.

## The extension rule, and the bug it caused

Relative imports in this package carry the **real** extension, `.ts` or
`.tsx`, and `rewriteRelativeImportExtensions` turns each one into `.js` on
emit. `apps/server` and `packages/shared` require a `.ts` for a different
reason, which is that Node resolves their imports literally at runtime, and
`apps/web` forbids an extension entirely. `.oxlintrc.json` enforces the three
separately, so a file here is linted against the rule that fits what happens to
it.

It reads like a style choice and it is not. Written extensionless, this package
type-checks, passes every test in the repository, and then kills `pnpm start`
on the first import, because Node's ESM resolver will not guess an extension.
Nothing in the toolchain notices: `tsc` runs under
`moduleResolution: "bundler"`, Vitest resolves through Vite, and the server's
own suite imports this package through Vite as well. **Only `node` rejects it**,
and nothing in this repository used to ask `node` anything.

`test/distRuntimeImport.test.ts` is what asks now. It builds the package, then
shells out to a real `node` and has it import `dist/index.js` and render a
message, so the whole import graph loads rather than just the entry point. It
is the only check here that runs `node` itself. When it fails, a relative
import has lost its extension or `rewriteRelativeImportExtensions` has been
turned off. Restore the extension rather than deleting the test.

## What a template is

An object with two fields: a synchronous `subject` and an asynchronous
`render`. Both **take the payload and nothing else**.

The split is not cosmetic. `subject` is needed at enqueue, where the row's
`subject` column is written, and the body is not rendered until the send, which
in the retry case is hours later. That gap is the reason for the rule the two
share: a row retried a day after it was written has to produce the identical
message, so everything the copy reads travels in the payload and is frozen when
the row is written. The mechanical test is that if rendering would need a
query, the payload is wrong. See
[`mail.md` § Rendering takes the payload and nothing else](mail.md).

`render` is asynchronous because react-email is, which is why the queue's
worker awaits it.

Which kinds may be enqueued at all is decided next door, by `EMAIL_TEMPLATES`
in `apps/server/src/mail/templates/emailTemplates.constants.ts`, because that is
a question about the queue rather than about the copy. Two kinds have copy
today: `sign_in_code` and `comment`.

## Where the plain text comes from

The same component, rendered a second time. `renderEmail` takes one element and
returns both forms, so there is no second source for the two to drift apart
from.

It is one shared function rather than two calls inside each template because
the plain-text options are the easy thing to forget, and forgetting them is
invisible: no wrapping is applied by default, and a message that arrives as
four unbroken paragraphs still passes every assertion anybody thought to write
about its words.

**The plain-text form is never omitted.** For some members in this audience it
is the only version that ever arrives.

## What the copy may not use

A mail client is not a browser. It resolves no custom property, fetches no
webfont, and may show the plain-text alternative instead of any of the design.
So three rules hold, and all three are structural rather than aesthetic:

- **Nothing in a message may reference a design token.** `emailTheme.ts` holds
  literal hex and a stack of fonts a client already has. A `var(--ms-ink)` or a
  `color-mix()` is dropped by the renderer and takes the design with it.
- **No layout that needs a modern renderer.** A 600px column and nothing that
  depends on flex or grid resolving.
- **The footer's preferences link is rendered when `preferencesUrl` is set and
  omitted when it is null**, which is `sign_in_code` and only `sign_in_code`,
  because offering to turn off a message that cannot be turned off is a lie.

This is the one surface that has to survive being forwarded into a client
nobody here has ever seen.

## How to look at one

Install the browser the PDF writer needs, once, from the repository root:

```sh
pnpm --filter @memory-shoebox/server exec playwright install chromium
```

Then set both of these in `apps/server/.env.local`:

```
NODE_ENV=development
ENABLE_FAKE_EMAIL=true
```

Ask for a sign-in code and the message is written to
`~/Downloads/memory-shoebox-emails` as a PDF instead of being sent, with the
addressing drawn across the top of it so the subject line is readable, which
for `sign_in_code` is where the code actually is.

Both variables are required, and the `NODE_ENV` half is a safety gate rather
than a convenience: it is not enough for `NODE_ENV` to be something other than
`production`. See
[`mail.md` § Fake email writes a PDF and reports success](mail.md), which is
where that gate and its reasoning live.
