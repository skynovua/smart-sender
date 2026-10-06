# Smart Sender

Frontend test assignment scaffold. This commit sets up the development environment;
authentication, the API contract, webhook screens, and the required concurrent-401 test
will be implemented next.

## Requirements and installation

- Node.js 24.14.1 (`.nvmrc`)
- pnpm 11.17.0 (`packageManager` in `package.json`)

```sh
nvm use
pnpm install --frozen-lockfile
pnpm dev
```

The application is available at the local URL printed by Vite. MSW is enabled by default
in development and production preview builds so the assignment can run without a backend.
The worker starts before React renders. API handlers are currently empty.

An optional `.env` file can be copied from `.env.example`. Set `VITE_ENABLE_MSW=false`
only when connecting a real backend; Vite must be restarted after changing environment variables.

## Commands

| Command                | Purpose                                               |
| ---------------------- | ----------------------------------------------------- |
| `pnpm dev`             | Start Vite with hot reload and route generation       |
| `pnpm build`           | Generate routes, check TypeScript, and create `dist/` |
| `pnpm preview`         | Serve the production build locally                    |
| `pnpm routes:generate` | Regenerate the typed route tree                       |
| `pnpm typecheck`       | Generate routes and check both TypeScript projects    |
| `pnpm lint`            | Run ESLint with zero allowed warnings                 |
| `pnpm lint:fix`        | Apply available ESLint fixes                          |
| `pnpm format`          | Format files and sort imports and Tailwind classes    |
| `pnpm format:check`    | Check formatting without changing files               |
| `pnpm test`            | Run Vitest once                                       |
| `pnpm test:watch`      | Run Vitest in watch mode                              |
| `pnpm check`           | Check formatting, lint, types, and tests              |

There are no committed tests yet. `pnpm test` temporarily allows an empty suite;
remove `--passWithNoTests` when adding the required session concurrency test.

## Tooling decisions

- React and TypeScript with `strict`, `noUncheckedIndexedAccess`, and
  `exactOptionalPropertyTypes` enabled.
- TanStack Router with file-based routes, generated types, and automatic code splitting.
  The assignment leaves the routing library open, so TanStack Router is permitted.
- TanStack Query for server state. Automatic query and mutation retries are disabled;
  the upcoming API client will own the bounded 401/419 recovery policy.
- React Hook Form, Zod, and the Zod resolver for upcoming forms and parameter validation.
- Tailwind CSS v4 through the official Vite plugin; no separate PostCSS configuration.
- MSW v2, which is compatible with Vitest's MSW peer dependency. Shared handlers are
  connected to both the browser worker and the Node test server.
- Vitest, jsdom, and Testing Library are configured for component tests. API tests can use
  `// @vitest-environment node` to avoid the DOM environment. Unexpected requests fail tests.
- ESLint checks TypeScript, React Hooks, and Fast Refresh exports. Prettier owns formatting.
- Prettier sorts imports while preserving side-effect import order, and sorts Tailwind classes.
- Exact dependency versions and a committed pnpm lockfile keep installations reproducible.

## Editor and commit automation

For VS Code, install the extensions recommended in `.vscode/extensions.json`.
Workspace settings enable Prettier on save, ESLint fixes on explicit save, and Tailwind
IntelliSense. Import sorting is handled by Prettier; the editor's competing import organizer
is disabled. Other editors can use the same project Prettier and EditorConfig files.

`pnpm install` activates Husky. Before each commit, lint-staged fixes and formats staged
source files and formats staged documents/configuration. It only operates on staged files;
run `pnpm check` for a full project check.

The generated route tree and MSW worker are committed but excluded from formatting and linting.
Do not edit `src/routeTree.gen.ts` or `public/mockServiceWorker.js` manually. Regenerate the
worker with `pnpm exec msw init public --save` after updating MSW.

## Source layout

```text
src/
  app/       Application providers, QueryClient, typed router
  mocks/     Shared API handlers, browser worker, test server
  routes/    File-based routes and root layout
  test/      Vitest setup and test utilities
```

`@/` resolves to `src/` in TypeScript, Vite, and Vitest.

Test credentials will be documented when the authentication mock is implemented.
