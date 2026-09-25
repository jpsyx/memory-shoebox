# Contributing to Famgram

Thanks for considering a contribution. Famgram is a small project with a narrow
purpose, so the most useful thing you can do before writing code is to open an
issue and check that the change fits.

## Before you start

- **Read [`docs/PRODUCT.md`](docs/PRODUCT.md).** Famgram is deliberately small.
  Features that make sense for a public social network usually do not make
  sense here, and a pull request that conflicts with the product's non-goals
  will be declined however good the code is.
- **Read [`AGENTS.md`](AGENTS.md).** It holds the coding conventions for this
  repository: TypeScript style, naming, testing, and documentation rules. They
  apply to everyone, including coding agents.
- **Open an issue first** for anything beyond a bug fix or a typo. It saves you
  from building something that will not be merged.

## Development setup

Requires Node 22.18 or newer and pnpm 10.

```sh
pnpm install
cp apps/server/.env.example apps/server/.env.local   # then fill it in
pnpm dev
```

[`docs/deployment.md`](docs/deployment.md) explains how to create the Backblaze
B2 bucket and application key the server needs.

## Making a change

1. **Branch** from `main` using a Gitflow prefix: `feat/`, `fix/`, `refactor/`,
   `chore/`, `docs/`, or `test/`.
2. **Write the test first.** This project uses red/green TDD by default: write
   a failing test that describes the behavior, confirm it fails for the right
   reason, then write the smallest implementation that makes it pass. Skip this
   only when a test adds no real value (copy changes, styling, config).
3. **Update the docs in the same change.** If you add, change, or remove a
   feature, module, route, data model, or architectural boundary, update the
   matching file in `docs/`. Stale documentation counts as a broken change.
4. **Run the full check** before you push:

   ```sh
   pnpm check
   ```

   That runs formatting, linting, type-checking, the build, and the tests.

5. **Open a pull request** describing what changed and why. Link the issue.

## Commit messages

Write them in the imperative mood ("add invite expiry", not "added invite
expiry") and explain the why in the body when it is not obvious from the diff.

## Scope discipline

Keep pull requests focused. Do not mix a refactor into a feature change, and do
not reformat files you are not otherwise touching. A small, reviewable diff
gets merged; a large one waits.

## License of contributions

Famgram is licensed under the GNU Affero General Public License v3. By
submitting a contribution you agree that it is licensed under the same terms.
